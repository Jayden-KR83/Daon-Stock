"""2단계 인증(TOTP) — RFC 6238 준거 + 복구 코드 회귀 보호.

오너는 2026-07 GitHub 2FA 분실로 3주간 푸시가 막힌 전례가 있다.
그래서 '맞으면 통과'만큼 **'잃어버려도 복구된다'**를 검사한다.
"""
import json
import main


# RFC 6238 Appendix B — SHA1, secret = ASCII "12345678901234567890"
RFC_SECRET_B32 = main.base64.b32encode(b"12345678901234567890").decode().rstrip('=')


class TestTotpAlgorithm:
    def test_rfc6238_vectors(self):
        """표준 테스트벡터로 알고리즘 자체를 못 박는다(라이브러리 없이 구현했으므로)."""
        cases = {59: "287082", 1111111109: "081804", 1111111111: "050471",
                 1234567890: "005924", 2000000000: "279037"}
        for t, expected in cases.items():
            assert main._totp_at(RFC_SECRET_B32, t // main.TOTP_STEP) == expected, t

    def test_verify_accepts_current_code(self):
        now = 1111111109
        code = main._totp_at(RFC_SECRET_B32, int(now // main.TOTP_STEP))
        assert main._totp_verify(RFC_SECRET_B32, code, now=now) is True

    def test_verify_tolerates_clock_drift(self):
        """폰 시계가 30초 어긋나도 통과해야 한다 — 아니면 정상 사용자가 못 들어온다."""
        now = 1111111109
        ctr = int(now // main.TOTP_STEP)
        for d in (-1, 0, 1):
            assert main._totp_verify(RFC_SECRET_B32, main._totp_at(RFC_SECRET_B32, ctr + d), now=now)

    def test_verify_rejects_far_drift(self):
        now = 1111111109
        ctr = int(now // main.TOTP_STEP)
        assert main._totp_verify(RFC_SECRET_B32, main._totp_at(RFC_SECRET_B32, ctr + 5), now=now) is False

    def test_rejects_malformed(self):
        for bad in ('', '12345', '1234567', 'abcdef', None):
            assert main._totp_verify(RFC_SECRET_B32, bad, now=59) is False

    def test_rejects_when_no_secret(self):
        assert main._totp_verify('', '287082', now=59) is False

    def test_generated_secret_is_usable(self):
        sec = main._b32_secret()
        assert main._totp_verify(sec, main._totp_at(sec, int(main.time() // main.TOTP_STEP)))


class TestRecoveryCodes:
    def _user(self, uid='u-2fa'):
        plain, hashed = main._make_recovery_codes()
        with main._db() as conn:
            conn.execute("DELETE FROM users WHERE user_id=?", (uid,))
            conn.execute(
                "INSERT INTO users(user_id,email,name,pw_hash,created_at) VALUES(?,?,?,?,?)",
                (uid, f'{uid}@x.com', 'T', main._hash_password('pw'), ''))
            conn.execute("UPDATE users SET totp_recovery=? WHERE user_id=?", (hashed, uid))
        return uid, plain, hashed

    def test_issues_expected_count(self):
        plain, hashed = main._make_recovery_codes()
        assert len(plain) == main.RECOVERY_N
        assert len(json.loads(hashed)) == main.RECOVERY_N

    def test_codes_are_not_stored_in_plaintext(self):
        plain, hashed = main._make_recovery_codes()
        assert all(p not in hashed for p in plain)

    def test_valid_code_is_accepted_and_consumed(self):
        """1회용이어야 한다 — 재사용되면 유출 시 영구 백도어가 된다."""
        uid, plain, hashed = self._user()
        assert main._consume_recovery_code(uid, plain[0], hashed) is True
        with main._db() as conn:
            left = conn.execute("SELECT totp_recovery FROM users WHERE user_id=?", (uid,)).fetchone()[0]
        assert len(json.loads(left)) == main.RECOVERY_N - 1
        assert main._consume_recovery_code(uid, plain[0], left) is False   # 재사용 불가

    def test_wrong_code_rejected(self):
        uid, plain, hashed = self._user()
        assert main._consume_recovery_code(uid, 'dead-beef-cafe', hashed) is False

    def test_empty_and_corrupt_storage(self):
        uid, _, _ = self._user()
        assert main._consume_recovery_code(uid, 'x', '[]') is False
        assert main._consume_recovery_code(uid, 'x', 'not-json') is False


class TestOtpauthUri:
    def test_contains_secret_and_params(self):
        uri = main._totp_uri('a@b.com', 'ABCDEFGH')
        assert uri.startswith('otpauth://totp/')
        assert 'secret=ABCDEFGH' in uri and 'digits=6' in uri and 'period=30' in uri

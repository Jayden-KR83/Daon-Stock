"""VAPID 키를 pywebpush 에 넘기는 **형식** (2026-10-28).

왜 회귀 보호가 필요한가:
  운영 발송이 전부 `ValueError: Could not deserialize key data` 로 죽고 있었다.
  키는 멀쩡했다 — **넘기는 형식이 틀렸다.**

  pywebpush 는 `vapid_private_key` 가 문자열이면 `py_vapid.Vapid.from_string()` 에
  넘기는데, from_string 은 PEM 을 **DER 로 착각해 base64 디코딩**을 시도한다.

      from_string(PEM)            → FAIL   ← 우리가 하던 것
      from_string(raw b64url 32B) → OK     ← 고친 것

  이 테스트는 **실제 py_vapid 로 파싱해 본다.** 추측으로 두 번 틀렸기 때문이다.
"""
import base64
import pytest

import main

pytest.importorskip('py_vapid')
from py_vapid import Vapid      # noqa: E402


def _fresh_pem():
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    pk = ec.generate_private_key(ec.SECP256R1())
    return pk.private_bytes(serialization.Encoding.PEM,
                            serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()


class TestFormat:
    def test_PEM을_그대로_넘기면_깨진다(self):
        """이것이 운영 장애의 정확한 재현이다. 깨지지 않게 되면 이 테스트를 지워도 된다."""
        pem = _fresh_pem()
        with pytest.raises(Exception) as e:
            Vapid.from_string(private_key=pem)
        assert 'deserialize' in str(e.value).lower() or 'asn' in str(e.value).lower()

    def test_변환한_키는_py_vapid가_읽는다(self):
        pem = _fresh_pem()
        raw = main._vapid_private_for_webpush(pem)
        Vapid.from_string(private_key=raw)      # 예외가 나면 실패

    def test_변환_결과는_32바이트_base64url(self):
        raw = main._vapid_private_for_webpush(_fresh_pem())
        assert '=' not in raw and '+' not in raw and '/' not in raw
        assert len(base64.urlsafe_b64decode(raw + '==')) == 32

    def test_우리가_저장하는_키로_왕복한다(self):
        # _get_vapid 가 만든 키 → 변환 → py_vapid 파싱까지 한 번에
        with main._db() as conn:
            conn.execute("DELETE FROM settings WHERE key IN ('vapid_private','vapid_public')")
        priv, pub = main._get_vapid()
        Vapid.from_string(private_key=main._vapid_private_for_webpush(priv))
        assert pub


class TestSendPushUsesIt:
    def test_키_오류가_아니라_전송_단계까지_간다(self):
        """가짜 엔드포인트로 보내면 **전송**에서 실패해야 한다.
        키 오류가 뜨면 형식이 또 틀린 것이다."""
        with main._db() as conn:
            conn.execute("DELETE FROM settings WHERE key IN ('vapid_private','vapid_public')")
            conn.execute(
                "INSERT OR IGNORE INTO users(user_id, email, name, pw_hash, created_at) "
                "VALUES(?,?,?,?,?)", ('fmt-u', 'f@t.local', 'f', 'x', '2026-10-28'))
            conn.execute("DELETE FROM push_subscriptions WHERE user_id=?", ('fmt-u',))
            conn.execute(
                "INSERT OR REPLACE INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) "
                "VALUES(?,?,?,?,?)",
                ('fmt-u', 'https://fcm.googleapis.com/fcm/send/NOT-A-REAL-ENDPOINT',
                 base64.urlsafe_b64encode(b'\x04' + b'1' * 64).rstrip(b'=').decode(),
                 base64.urlsafe_b64encode(b'0' * 16).rstrip(b'=').decode(), main.time()))
        errs = []
        main._send_push('fmt-u', 't', 'b', '/', errors=errs)
        joined = ' '.join(errs).lower()
        assert 'deserialize' not in joined, '키 형식이 아직 틀렸다: %s' % errs

"""로그인 무차별 대입 차단 — 회귀 보호.

사용자가 사실상 1명이라 '계정 하나 탈취 = 전부 상실'이다.
자기 발등 찍기(정상 사용자 영구 잠금)도 같이 막아야 해서 해제 조건까지 검사한다.
"""
import main


class _Req:
    """FastAPI Request 대역 — 헤더/클라이언트만 흉내낸다."""
    def __init__(self, headers=None, host='9.9.9.9'):
        self.headers = headers or {}
        self.client = type('C', (), {'host': host})()


def _clear():
    with main._db() as conn:
        conn.execute("DELETE FROM login_attempts")


class TestClientIp:
    def test_prefers_cloudflare_header(self):
        r = _Req({'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8'})
        assert main._client_ip(r) == '1.2.3.4'

    def test_falls_back_to_xff_first_hop(self):
        assert main._client_ip(_Req({'x-forwarded-for': '5.6.7.8, 9.9.9.9'})) == '5.6.7.8'

    def test_falls_back_to_socket_peer(self):
        assert main._client_ip(_Req({}, host='7.7.7.7')) == '7.7.7.7'


class TestLoginLock:
    def test_not_locked_below_threshold(self):
        _clear()
        for _ in range(main.LOGIN_MAX_PER_MAIL - 1):
            main._record_login_failure('a@b.com', '1.1.1.1')
        assert main._login_lock_remaining(
            [('email:a@b.com', main.LOGIN_MAX_PER_MAIL)]) == 0

    def test_locks_at_threshold(self):
        _clear()
        for _ in range(main.LOGIN_MAX_PER_MAIL):
            main._record_login_failure('a@b.com', '1.1.1.1')
        assert main._login_lock_remaining(
            [('email:a@b.com', main.LOGIN_MAX_PER_MAIL)]) > 0

    def test_ip_threshold_is_separate_and_higher(self):
        """여러 계정을 훑는 시도를 잡는 상위 그물 — 계정별 한도보다 커야 의미가 있다."""
        assert main.LOGIN_MAX_PER_IP > main.LOGIN_MAX_PER_MAIL
        _clear()
        for i in range(main.LOGIN_MAX_PER_MAIL + 1):
            main._record_login_failure(f'u{i}@b.com', '1.1.1.1')   # 매번 다른 계정
        assert main._login_lock_remaining(
            [('email:u0@b.com', main.LOGIN_MAX_PER_MAIL)]) == 0     # 계정별로는 안 잠김
        assert main._login_lock_remaining(
            [('ip:1.1.1.1', main.LOGIN_MAX_PER_IP)]) == 0           # 아직 IP 한도 미만

    def test_old_attempts_expire(self):
        """창을 벗어난 시도는 영구 잠금이 되면 안 된다(정상 사용자 자기 발등 찍기 방지)."""
        _clear()
        stale = main.time() - main.LOGIN_WINDOW_SEC - 10
        with main._db() as conn:
            conn.executemany("INSERT INTO login_attempts(key,ts) VALUES(?,?)",
                             [('email:a@b.com', stale)] * (main.LOGIN_MAX_PER_MAIL + 3))
        assert main._login_lock_remaining(
            [('email:a@b.com', main.LOGIN_MAX_PER_MAIL)]) == 0

    def test_success_clears_email_but_keeps_ip(self):
        """성공은 그 계정만 푼다. IP 기록을 같이 지우면, 한 계정 비번을 아는 공격자가
        로그인 성공으로 IP 카운터를 초기화하며 다른 계정을 계속 훑을 수 있다."""
        _clear()
        for _ in range(3):
            main._record_login_failure('a@b.com', '1.1.1.1')
        main._clear_login_failures('a@b.com')
        with main._db() as conn:
            assert conn.execute(
                "SELECT COUNT(*) c FROM login_attempts WHERE key='email:a@b.com'"
            ).fetchone()['c'] == 0
            assert conn.execute(
                "SELECT COUNT(*) c FROM login_attempts WHERE key='ip:1.1.1.1'"
            ).fetchone()['c'] == 3

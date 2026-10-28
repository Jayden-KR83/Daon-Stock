"""푸시 구독 — 브라우저와 서버가 어긋나는 상태를 드러낸다 (2026-10-28).

왜 회귀 보호가 필요한가:
  **브라우저에 구독 객체가 있다는 것과 서버가 보낼 주소를 가졌다는 것은 다른 사실이다.**
  서버는 푸시 서비스가 404/410 을 주면 죽은 구독으로 보고 지운다. 그때 브라우저 쪽
  구독은 그대로 남으므로, 클라이언트가 자기 구독만 보면 '켜짐'으로 보인다.
  그리고 켜져 있다고 믿으면 재등록을 하지 않으므로 **스스로 낫지 않는다.**

  실제로 오너 갤럭시가 그 상태였다 — 토글 켜짐, 진단 '구독 있음',
  테스트는 '보낼 기기 없음', 알림 100건이 앱 화면 안에만 쌓였다.
"""
import pytest
from fastapi import HTTPException

import main

UID = 'test-push-user'
CU = {'user_id': UID}


def _reset(endpoints=()):
    with main._db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users(user_id, email, name, pw_hash, created_at) "
            "VALUES(?,?,?,?,?)", (UID, f'{UID}@test.local', UID, 'x', '2026-10-28'))
        conn.execute("DELETE FROM push_subscriptions WHERE user_id=?", (UID,))
        for ep in endpoints:
            conn.execute(
                "INSERT OR REPLACE INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) "
                "VALUES(?,?,?,?,?)", (UID, ep, 'k', 'a', main.time()))


class TestPushStatus:
    def test_구독이_없으면_0대(self):
        # 이것이 '알림이 만들어지기만 하고 오지 않는' 상태의 서버 쪽 사실이다
        _reset()
        assert main.push_status(cu=CU)['devices'] == 0

    def test_기기_수를_센다(self):
        _reset(['https://fcm.example/a', 'https://fcm.example/b'])
        assert main.push_status(cu=CU)['devices'] == 2

    def test_남의_구독은_세지_않는다(self):
        _reset(['https://fcm.example/a'])
        with main._db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users(user_id, email, name, pw_hash, created_at) "
                "VALUES(?,?,?,?,?)", ('other-push', 'o@t.local', 'o', 'x', '2026-10-28'))
            conn.execute(
                "INSERT OR REPLACE INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) "
                "VALUES(?,?,?,?,?)", ('other-push', 'https://fcm.example/z', 'k', 'a', main.time()))
        assert main.push_status(cu=CU)['devices'] == 1

    def test_재등록하면_되살아난다(self):
        # 자가 치유의 서버 쪽 근거: INSERT OR REPLACE 라 몇 번을 보내도 안전하다
        _reset()
        assert main.push_status(cu=CU)['devices'] == 0
        for _ in range(3):
            with main._db() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) "
                    "VALUES(?,?,?,?,?)", (UID, 'https://fcm.example/a', 'k', 'a', main.time()))
        assert main.push_status(cu=CU)['devices'] == 1   # 중복으로 쌓이지 않는다


class TestSendPushErrors:
    """실패 사유를 버리면 '등록 2대인데 발송 0건'을 설명할 수 없다 (2026-10-28)."""

    def test_실패하면_반드시_사유가_남는다(self):
        # 사유가 **무엇이든** 남아야 한다는 것이 핵심이다. 빈 손으로 0 을 돌려주면
        # 화면에서 원인을 구분할 수 없다 — 그게 이번 사고의 전부였다.
        _reset()
        errs = []
        sent = main._send_push(UID, 't', 'b', '/', errors=errs)
        assert sent == 0
        assert errs, '실패했는데 사유가 비어 있다'

    def test_errors_를_안_넘기면_예전처럼_동작한다(self):
        # 호출부 대부분은 errors 를 넘기지 않는다 — 그쪽 동작이 바뀌면 안 된다
        _reset()
        assert main._send_push(UID, 't', 'b', '/') == 0

    def test_라이브러리가_없으면_그렇게_말한다(self, monkeypatch):
        _reset(['https://fcm.example/a'])
        import builtins
        real = builtins.__import__

        def boom(name, *a, **k):
            if name == 'pywebpush':
                raise ImportError('no module named pywebpush')
            return real(name, *a, **k)

        monkeypatch.setattr(builtins, '__import__', boom)
        errs = []
        assert main._send_push(UID, 't', 'b', '/', errors=errs) == 0
        assert errs and 'pywebpush' in errs[0]

    def test_전송_예외도_사유가_남는다(self, monkeypatch):
        pywebpush = pytest.importorskip('pywebpush')   # 서버에만 있는 의존성
        _reset(['https://fcm.example/a'])
        monkeypatch.setattr(
            pywebpush, 'webpush',
            lambda **k: (_ for _ in ()).throw(RuntimeError('boom')))
        errs = []
        assert main._send_push(UID, 't', 'b', '/', errors=errs) == 0
        assert errs and 'boom' in errs[0]
        # 알 수 없는 실패로 구독을 지우지는 않는다 — 410 일 때만 지운다
        assert main.push_status(cu=CU)['devices'] == 1

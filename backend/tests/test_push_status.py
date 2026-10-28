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

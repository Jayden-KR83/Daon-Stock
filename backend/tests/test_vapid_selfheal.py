"""VAPID 키 — 있는지 묻지 말고 되는지 돌려 볼 것 (2026-10-28).

왜 회귀 보호가 필요한가:
  운영에서 푸시 발송이 전부 `ValueError: Could not deserialize key data` 로 죽고
  있었다. 그런데 `_get_vapid()` 는 **값이 있다는 이유로** 그 키를 그대로 돌려줬다.
  구독도 멀쩡하고 권한도 멀쩡한 채로 알림만 한 건도 가지 않았다.

  저장된 키가 있다는 것과 그 키를 쓸 수 있다는 것은 다른 사실이다.
"""
import main


def _set(priv, pub):
    with main._db() as conn:
        for k, v in (('vapid_private', priv), ('vapid_public', pub)):
            if v is None:
                conn.execute("DELETE FROM settings WHERE key=?", (k,))
            else:
                conn.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?,?)", (k, v))


def _subs(n):
    with main._db() as conn:
        conn.execute("DELETE FROM push_subscriptions")
        conn.execute(
            "INSERT OR IGNORE INTO users(user_id, email, name, pw_hash, created_at) "
            "VALUES(?,?,?,?,?)", ('vapid-u', 'v@t.local', 'v', 'x', '2026-10-28'))
        for i in range(n):
            conn.execute(
                "INSERT OR REPLACE INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) "
                "VALUES(?,?,?,?,?)", ('vapid-u', 'https://fcm.example/%d' % i, 'k', 'a', main.time()))


def _count_subs():
    with main._db() as conn:
        return conn.execute("SELECT COUNT(*) c FROM push_subscriptions").fetchone()['c']


class TestUsable:
    def test_쓰레기는_못_쓴다(self):
        for bad in ('', '   ', 'not a key', '-----BEGIN PRIVATE KEY-----\nxxx\n-----END PRIVATE KEY-----\n'):
            assert main._vapid_usable(bad) is False, repr(bad[:20])

    def test_None도_못_쓴다(self):
        assert main._vapid_usable(None) is False

    def test_우리가_만든_키는_쓸_수_있다(self):
        # 생성 → 검증 왕복. 이게 깨지면 키를 무한히 다시 만든다.
        _set(None, None)
        priv, pub = main._get_vapid()
        assert main._vapid_usable(priv) is True
        assert pub and len(pub) > 50


class TestSelfHeal:
    def test_못_쓰는_키는_새로_만든다(self):
        _set('이건 키가 아니다', 'bogus-public')
        priv, pub = main._get_vapid()
        assert main._vapid_usable(priv) is True
        assert pub != 'bogus-public'

    def test_재생성하면_기존_구독을_지운다(self):
        # 새 키로는 옛 구독에 보낼 수 없다. 남겨 두면 클라이언트가 "서버에 등록돼
        # 있다"고 믿어 재구독하지 않으므로, 영영 복구되지 않는다.
        _set('이건 키가 아니다', 'bogus-public')
        _subs(2)
        assert _count_subs() == 2
        main._get_vapid()
        assert _count_subs() == 0

    def test_멀쩡한_키는_건드리지_않는다(self):
        _set(None, None)
        priv1, pub1 = main._get_vapid()
        _subs(2)
        priv2, pub2 = main._get_vapid()
        assert (priv1, pub1) == (priv2, pub2)
        assert _count_subs() == 2, '멀쩡한데 구독을 지웠다'

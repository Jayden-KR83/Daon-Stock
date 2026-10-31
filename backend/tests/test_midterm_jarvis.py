"""중기 자비스 — '바뀐 날에만, 조건으로 말한다' 규율 회귀 보호 (2026-10-31).

오너 결정 두 가지가 이 기능의 전부다.
  ① 방향을 단언하지 않고 **조건**을 말한다 — 틀릴 수 있는 형태라 채점이 된다.
  ② **국면이 바뀐 날에만** 보낸다 — 매주 같은 말을 보내면 읽히지 않고,
     읽히지 않는 알림은 정작 중요한 날에도 무시당한다.

둘 다 조용히 깨지는 종류의 규율이다(알림이 늘어도 아무도 에러를 보지 않는다).
그래서 여기서 고정한다.
"""
import main
from midterm import midterm_regime


def series(n, start=100.0, daily=0.0):
    return [start * ((1 + daily) ** i) for i in range(n)]


UP = series(400, daily=0.001)
DN = series(400, daily=-0.001)


def _user(uid):
    with main._db() as conn:
        conn.execute("DELETE FROM users WHERE user_id=?", (uid,))
        conn.execute(
            "INSERT INTO users(user_id,email,name,pw_hash,created_at,status) "
            "VALUES(?,?,?,?,?,?)",
            (uid, f'{uid}@x.com', 'T', main._hash_password('pw'), 0.0, 'approved'))
        conn.execute("DELETE FROM midterm_state WHERE user_id=?", (uid,))
        conn.execute("DELETE FROM notifications WHERE user_id=?", (uid,))
    return uid


def _item(ticker, weight, closes, name=None):
    return {'ticker': ticker, 'name': name or ticker, 'weight': weight,
            'regime': midterm_regime(closes)}


def _install(monkeypatch, uid, items):
    """get_midterm_regime 을 가짜로 — 이 테스트는 시세가 아니라 규율을 본다."""
    from midterm import portfolio_regime
    payload = {'items': items, 'portfolio': portfolio_regime(items),
               'basis': {}, 'truncated': 0}

    def fake(cu):
        return payload if cu['user_id'] == uid else {'items': []}
    monkeypatch.setattr(main, 'get_midterm_regime', fake)
    monkeypatch.setattr(main, '_send_push', lambda *a, **k: {'sent': 0})


def _notifs(uid):
    with main._db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT kind, message FROM notifications WHERE user_id=? ORDER BY id",
            (uid,)).fetchall()]


class TestOnlyWhenChanged:
    def test_first_observation_is_silent(self, monkeypatch):
        """첫 관측은 '바뀐 것'이 아니다 — 기준선만 깔고 조용히 넘어간다."""
        uid = _user('u-mt-first')
        _install(monkeypatch, uid, [_item('AAA', 100, UP)])
        out = main._run_midterm_scan(1000.0)
        assert out.get('notified') == 0
        assert _notifs(uid) == []
        with main._db() as conn:
            row = conn.execute(
                "SELECT phase FROM midterm_state WHERE user_id=? AND ticker='AAA'",
                (uid,)).fetchone()
        assert row['phase'] == '상승추세', '기준선이 저장되지 않았다'

    def test_same_phase_stays_silent(self, monkeypatch):
        uid = _user('u-mt-same')
        _install(monkeypatch, uid, [_item('AAA', 100, UP)])
        main._run_midterm_scan(1000.0)
        main._run_midterm_scan(2000.0)
        main._run_midterm_scan(3000.0)
        assert _notifs(uid) == [], '국면이 그대로인데 울렸다'

    def test_phase_change_fires_once(self, monkeypatch):
        uid = _user('u-mt-change')
        _install(monkeypatch, uid, [_item('AAA', 100, UP)])
        main._run_midterm_scan(1000.0)              # 기준선
        _install(monkeypatch, uid, [_item('AAA', 100, DN)])
        main._run_midterm_scan(2000.0)              # 전환 → 1건
        main._run_midterm_scan(3000.0)              # 그대로 → 추가 없음
        rows = _notifs(uid)
        assert len(rows) == 1
        assert rows[0]['kind'] == 'midterm'

    def test_small_position_change_is_not_noise(self, monkeypatch):
        """비중이 문턱 미만인 종목의 전환은 알리지 않는다 — 그래도 상태는 갱신한다."""
        uid = _user('u-mt-small')
        big, small = _item('BIG', 95_000_000, UP), _item('TINY', 1_000_000, UP)
        _install(monkeypatch, uid, [big, small])
        main._run_midterm_scan(1000.0)
        _install(monkeypatch, uid, [big, _item('TINY', 1_000_000, DN)])
        main._run_midterm_scan(2000.0)
        assert _notifs(uid) == [], '1% 짜리 종목 때문에 울렸다'
        with main._db() as conn:
            ph = conn.execute(
                "SELECT phase FROM midterm_state WHERE user_id=? AND ticker='TINY'",
                (uid,)).fetchone()['phase']
        assert ph == '하락추세', '안 울렸다고 상태까지 안 갱신하면 다음에 중복 발화한다'

    def test_demo_account_skipped(self, monkeypatch):
        uid = _user('u-mt-demo')
        _install(monkeypatch, uid, [_item('AAA', 100, UP)])
        monkeypatch.setattr(main, '_is_demo', lambda cu: True)
        out = main._run_midterm_scan(1000.0)
        assert out.get('users') == 0

    def test_failure_is_isolated(self, monkeypatch):
        uid = _user('u-mt-fail')

        def boom(cu):
            raise RuntimeError('yf down')
        monkeypatch.setattr(main, 'get_midterm_regime', boom)
        monkeypatch.setattr(main, '_send_push', lambda *a, **k: {'sent': 0})
        out = main._run_midterm_scan(5000.0)
        assert 'error' not in out, '한 사용자의 실패가 전체를 깨뜨렸다'
        assert _notifs(uid) == []


class TestMessageSpeaksInConditions:
    def test_message_has_change_and_condition(self, monkeypatch):
        uid = _user('u-mt-msg')
        items_before = [_item('005930', 60_000_000, UP, '삼성전자'),
                        _item('AAPL', 40_000_000, DN, 'Apple')]
        _install(monkeypatch, uid, items_before)
        main._run_midterm_scan(1000.0)
        items_after = [_item('005930', 60_000_000, DN, '삼성전자'),
                       _item('AAPL', 40_000_000, DN, 'Apple')]
        _install(monkeypatch, uid, items_after)
        main._run_midterm_scan(2000.0)

        msg = _notifs(uid)[0]['message']
        assert '삼성전자 상승추세 → 하락추세' in msg
        assert '생각을 바꿀 조건' in msg, '조건 없이 현상만 말했다'
        assert '₩' in msg, '조건에 가격이 없으면 나중에 채점할 수 없다'
        # R6 — 다문장은 문장마다 줄바꿈
        assert msg.count('\n') >= 2

    def test_message_never_asserts_a_direction(self, monkeypatch):
        """오너 결정: 방향을 단언하지 않는다. 예언투의 단어가 들어가면 실패."""
        uid = _user('u-mt-noassert')
        _install(monkeypatch, uid, [_item('AAA', 100_000_000, UP)])
        main._run_midterm_scan(1000.0)
        _install(monkeypatch, uid, [_item('AAA', 100_000_000, DN)])
        main._run_midterm_scan(2000.0)
        msg = _notifs(uid)[0]['message']
        for banned in ('전망', '예상', '우위', '가능성', '추천', '매수', '매도'):
            assert banned not in msg, f"단언/권유 표현이 들어갔다: {banned}"

    def test_us_ticker_uses_dollar(self, monkeypatch):
        uid = _user('u-mt-usd')
        _install(monkeypatch, uid, [_item('AAPL', 100_000_000, UP, 'Apple')])
        main._run_midterm_scan(1000.0)
        _install(monkeypatch, uid, [_item('AAPL', 100_000_000, DN, 'Apple')])
        main._run_midterm_scan(2000.0)
        assert '$' in _notifs(uid)[0]['message']


class TestCronAuth:
    def test_wrong_secret_rejected(self):
        with main._db() as conn:
            conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
                         ('cron_secret', 'right-secret'))
        try:
            main.cron_midterm_scan(main.MidtermScanReq(cron_secret='wrong'))
            assert False, '잘못된 시크릿이 통과했다'
        except main.HTTPException as e:
            assert e.status_code == 403

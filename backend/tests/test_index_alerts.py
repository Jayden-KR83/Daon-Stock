"""지수 알림(상단 마켓바 지수의 일간 변동률) 회귀 보호 (2026-10-30).

지수는 종목과 같은 임계를 쓸 수 없다 — VIX 는 ±5% 가 평범한 날이고 USD/KRW 는
±1% 면 큰 날이다. 하나의 숫자는 둘 중 하나를 반드시 속인다. 그래서 임계가
지수별이고, 그 표가 마켓바 목록(MARKET_TICKERS)과 어긋나지 않아야 한다.
"""
import main


class TestRulesTable:
    def test_covers_every_market_ticker(self):
        # 마켓바에 뜨는 지수인데 알림 규칙이 없으면 조용히 빠진다
        missing = [t for _, t in main.MARKET_TICKERS
                   if t not in main.INDEX_ALERT_RULES]
        assert not missing, f'규칙 없는 지수: {missing}'

    def test_no_rule_for_unknown_ticker(self):
        # 반대 방향 — 마켓바에서 빠진 지수의 규칙이 남아 있으면 이름을 못 찾는다
        known = {t for _, t in main.MARKET_TICKERS}
        orphan = [t for t in main.INDEX_ALERT_RULES if t not in known]
        assert not orphan, f'마켓바에 없는 규칙: {orphan}'

    def test_names_come_from_market_tickers(self):
        # 이름 정본은 MARKET_TICKERS 하나뿐이어야 한다
        assert main.INDEX_NAMES['^VIX'] == 'VIX'
        assert main.INDEX_NAMES['KRW=X'] == 'USD/KRW'
        assert len(main.INDEX_NAMES) == len(main.MARKET_TICKERS)

    def test_thresholds_differ_by_volatility(self):
        r = main.INDEX_ALERT_RULES
        # 변동성 순서가 뒤집히면(= FX 임계가 VIX 임계보다 크면) 알림이 쓸모를 잃는다
        assert r['KRW=X']['threshold'] < r['^GSPC']['threshold']
        assert r['^GSPC']['threshold'] < r['BTC-USD']['threshold']
        assert r['BTC-USD']['threshold'] < r['^VIX']['threshold']

    def test_thresholds_within_api_range(self):
        for tkr, rule in main.INDEX_ALERT_RULES.items():
            assert main.INDEX_THRESHOLD_MIN <= rule['threshold'] \
                <= main.INDEX_THRESHOLD_MAX, tkr

    def test_owner_named_indices_on_by_default(self):
        # 오너가 이름을 댄 넷은 기본 켜짐이어야 한다 (2026-10-30 요청)
        for tkr in ('^VIX', '^KS11', 'KRW=X', 'BTC-USD'):
            assert main.INDEX_ALERT_RULES[tkr]['on'] is True, tkr


class TestValueFormat:
    def test_krw_has_won_sign_no_decimals(self):
        assert main._fmt_index_value('KRW=X', 1432.7) == '₩1,433'

    def test_usd_big_drops_decimals(self):
        assert main._fmt_index_value('BTC-USD', 109234.56) == '$109,235'
        assert main._fmt_index_value('SI=F', 31.42) == '$31.42'

    def test_yield_is_marked_as_yield(self):
        # 변동률 %와 값 %가 같은 문장에 오므로 무엇의 %인지 밝힌다
        assert main._fmt_index_value('^TNX', 4.351) == '4.35% (수익률)'

    def test_vix_keeps_two_decimals(self):
        assert main._fmt_index_value('^VIX', 21.4) == '21.40'

    def test_points_thousands_separated(self):
        assert main._fmt_index_value('^GSPC', 6812.34) == '6,812'

    def test_bad_input_is_dash(self):
        assert main._fmt_index_value('^VIX', None) == '—'
        assert main._fmt_index_value('^VIX', 'x') == '—'


def _user(uid='u-idx'):
    with main._db() as conn:
        conn.execute("DELETE FROM users WHERE user_id=?", (uid,))
        conn.execute(
            "INSERT INTO users(user_id,email,name,pw_hash,created_at,status) "
            "VALUES(?,?,?,?,?,?)",
            (uid, f'{uid}@x.com', 'T', main._hash_password('pw'), 0.0, 'approved'))
        conn.execute("DELETE FROM index_alert_rules WHERE user_id=?", (uid,))
        conn.execute("DELETE FROM index_alert_prefs WHERE user_id=?", (uid,))
        conn.execute("DELETE FROM index_alert_state WHERE user_id=?", (uid,))
        conn.execute("DELETE FROM notifications WHERE user_id=?", (uid,))
    return uid


class TestEffectiveRules:
    def test_defaults_when_no_rows(self):
        uid = _user('u-idx-def')
        with main._db() as conn:
            rules = main._index_rules_for(conn, uid)
            assert main._index_master_enabled(conn, uid) is True
        assert rules['^VIX']['threshold_pct'] == 10.0
        assert rules['^VIX']['customized'] is False
        assert rules['^DJI']['enabled'] is False      # 중복 지수는 기본 꺼짐

    def test_override_wins_and_is_marked(self):
        uid = _user('u-idx-ov')
        with main._db() as conn:
            conn.execute(
                "INSERT INTO index_alert_rules "
                "(user_id,ticker,enabled,threshold_pct,updated_at) VALUES(?,?,?,?,?)",
                (uid, '^VIX', 1, 4.0, 0.0))
            rules = main._index_rules_for(conn, uid)
        assert rules['^VIX']['threshold_pct'] == 4.0
        assert rules['^VIX']['customized'] is True
        assert rules['^VIX']['default_threshold_pct'] == 10.0

    def test_order_follows_market_bar(self):
        uid = _user('u-idx-order')
        with main._db() as conn:
            rules = main._index_rules_for(conn, uid)
        assert list(rules) == [t for _, t in main.MARKET_TICKERS]


class TestScan:
    """`_market_data` 를 가짜로 바꿔 스캔 전체를 돌린다."""

    def _scan(self, monkeypatch, market, uid, now=1000.0):
        monkeypatch.setattr(main, '_market_data', lambda: market)
        monkeypatch.setattr(main, '_send_push',
                            lambda *a, **k: {'sent': 0})
        with main._db() as conn:      # 게이트 해제 — 매번 실제 스캔
            conn.execute("DELETE FROM settings WHERE key='index_scan_at'")
        return main._run_index_scan(now)

    def _notifs(self, uid):
        with main._db() as conn:
            return [dict(r) for r in conn.execute(
                "SELECT ticker, kind, message, change_pct FROM notifications "
                "WHERE user_id=? ORDER BY id", (uid,)).fetchall()]

    def test_fires_above_threshold(self, monkeypatch):
        uid = _user('u-idx-fire')
        out = self._scan(monkeypatch, [
            {'name': 'VIX', 'ticker': '^VIX', 'price': 24.8, 'pct': 18.4},
        ], uid)
        assert out['triggered'] >= 1
        rows = self._notifs(uid)
        assert len(rows) == 1
        assert rows[0]['kind'] == 'surge'
        assert rows[0]['ticker'] == '^VIX'
        assert '[지수] VIX +18.4% 급등' in rows[0]['message']
        assert '현재 24.80' in rows[0]['message']

    def test_stock_threshold_would_be_wrong_for_vix(self, monkeypatch):
        # VIX +6% 는 평범한 날 — 종목 임계(5%)를 썼다면 울렸을 값이다
        uid = _user('u-idx-vix6')
        self._scan(monkeypatch, [
            {'name': 'VIX', 'ticker': '^VIX', 'price': 18.2, 'pct': 6.0},
        ], uid)
        assert self._notifs(uid) == []

    def test_fx_one_percent_fires(self, monkeypatch):
        # 반대로 USD/KRW -1.2% 는 큰 날 — 종목 임계였다면 영원히 조용했다
        uid = _user('u-idx-fx')
        self._scan(monkeypatch, [
            {'name': 'USD/KRW', 'ticker': 'KRW=X', 'price': 1402.0, 'pct': -1.2},
        ], uid)
        rows = self._notifs(uid)
        assert len(rows) == 1
        assert rows[0]['kind'] == 'plunge'
        assert '₩1,402' in rows[0]['message']

    def test_default_off_index_silent(self, monkeypatch):
        uid = _user('u-idx-off')
        self._scan(monkeypatch, [
            {'name': 'Dow', 'ticker': '^DJI', 'price': 44000.0, 'pct': -3.0},
        ], uid)
        assert self._notifs(uid) == []

    def test_master_switch_off_silences_all(self, monkeypatch):
        uid = _user('u-idx-master')
        with main._db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO index_alert_prefs"
                "(user_id,enabled,updated_at) VALUES(?,?,?)", (uid, 0, 0.0))
        self._scan(monkeypatch, [
            {'name': 'VIX', 'ticker': '^VIX', 'price': 30.0, 'pct': 40.0},
        ], uid)
        assert self._notifs(uid) == []

    def test_no_refire_same_band(self, monkeypatch):
        uid = _user('u-idx-refire')
        mkt = [{'name': 'VIX', 'ticker': '^VIX', 'price': 24.8, 'pct': 18.4}]
        self._scan(monkeypatch, mkt, uid)
        self._scan(monkeypatch, mkt, uid, now=2000.0)
        assert len(self._notifs(uid)) == 1, '같은 변동률에 두 번 울렸다'

    def test_refire_after_next_band(self, monkeypatch):
        uid = _user('u-idx-band')
        self._scan(monkeypatch,
                   [{'name': 'VIX', 'ticker': '^VIX', 'price': 24.8, 'pct': 12.0}], uid)
        self._scan(monkeypatch,
                   [{'name': 'VIX', 'ticker': '^VIX', 'price': 30.0, 'pct': 23.0}],
                   uid, now=2000.0)
        assert len(self._notifs(uid)) == 2

    def test_rearm_after_recovery(self, monkeypatch):
        uid = _user('u-idx-rearm')
        self._scan(monkeypatch,
                   [{'name': 'VIX', 'ticker': '^VIX', 'price': 24.8, 'pct': 18.4}], uid)
        self._scan(monkeypatch,                     # 임계 아래로 되돌림 → 재무장
                   [{'name': 'VIX', 'ticker': '^VIX', 'price': 19.0, 'pct': 2.0}],
                   uid, now=2000.0)
        with main._db() as conn:
            left = conn.execute(
                "SELECT COUNT(*) c FROM index_alert_state WHERE user_id=?",
                (uid,)).fetchone()['c']
        assert left == 0, '되돌림 후에도 상태가 남아 재알림이 막힌다'
        self._scan(monkeypatch,
                   [{'name': 'VIX', 'ticker': '^VIX', 'price': 25.0, 'pct': 19.0}],
                   uid, now=3000.0)
        assert len(self._notifs(uid)) == 2

    def test_throttled_within_interval(self, monkeypatch):
        uid = _user('u-idx-thr')
        monkeypatch.setattr(main, '_market_data', lambda: [])
        monkeypatch.setattr(main, '_send_push', lambda *a, **k: {'sent': 0})
        with main._db() as conn:
            conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
                         ('index_scan_at', '1000.0'))
        assert main._run_index_scan(1000.0 + main.INDEX_SCAN_INTERVAL - 1) \
            == {'skipped': 'throttled'}

    def test_market_failure_is_isolated(self, monkeypatch):
        uid = _user('u-idx-fail')

        def boom():
            raise RuntimeError('yf down')
        monkeypatch.setattr(main, '_market_data', boom)
        with main._db() as conn:
            conn.execute("DELETE FROM settings WHERE key='index_scan_at'")
        out = main._run_index_scan(5000.0)
        assert 'error' in out          # 예외가 cron 전체를 깨뜨리지 않는다
        assert self._notifs(uid) == []

    def test_move_prefs_save_does_not_rearm_index(self, monkeypatch):
        """급등락 설정 저장은 move_alert_state 만 지운다 — 지수 상태는 남아야 한다."""
        uid = _user('u-idx-isolate')
        self._scan(monkeypatch,
                   [{'name': 'VIX', 'ticker': '^VIX', 'price': 24.8, 'pct': 18.4}], uid)
        with main._db() as conn:
            conn.execute("DELETE FROM move_alert_state WHERE user_id=?", (uid,))
            left = conn.execute(
                "SELECT COUNT(*) c FROM index_alert_state WHERE user_id=?",
                (uid,)).fetchone()['c']
        assert left == 1


class TestApi:
    """엔드포인트 핸들러 직접 호출 — 검증·저장·되돌리기."""

    def _cu(self, uid):
        return {'user_id': uid}

    def test_get_returns_defaults_and_range(self):
        uid = _user('u-idx-api')
        out = main.get_index_prefs(cu=self._cu(uid))
        assert out['enabled'] is True
        assert len(out['items']) == len(main.MARKET_TICKERS)
        assert out['scan_interval_sec'] == main.INDEX_SCAN_INTERVAL
        assert out['threshold_range'] == [main.INDEX_THRESHOLD_MIN,
                                          main.INDEX_THRESHOLD_MAX]

    def test_unknown_ticker_rejected(self):
        uid = _user('u-idx-api2')
        req = main.IndexPrefsReq(items=[
            main.IndexRuleReq(ticker='NOT_AN_INDEX', enabled=True, threshold_pct=5)])
        try:
            main.set_index_prefs(req, cu=self._cu(uid))
            assert False, '알 수 없는 지수가 통과했다'
        except main.HTTPException as e:
            assert e.status_code == 400

    def test_out_of_range_threshold_rejected(self):
        uid = _user('u-idx-api3')
        for bad in (0.0, 99.0):
            req = main.IndexPrefsReq(items=[
                main.IndexRuleReq(ticker='^VIX', enabled=True, threshold_pct=bad)])
            try:
                main.set_index_prefs(req, cu=self._cu(uid))
                assert False, f'범위 밖 임계({bad})가 통과했다'
            except main.HTTPException as e:
                assert e.status_code == 400

    def test_save_then_reset(self):
        uid = _user('u-idx-api4')
        out = main.set_index_prefs(main.IndexPrefsReq(items=[
            main.IndexRuleReq(ticker='^VIX', enabled=True, threshold_pct=6.5)]),
            cu=self._cu(uid))
        vix = {i['ticker']: i for i in out['items']}['^VIX']
        assert vix['threshold_pct'] == 6.5 and vix['customized'] is True

        out = main.set_index_prefs(main.IndexPrefsReq(reset=True), cu=self._cu(uid))
        vix = {i['ticker']: i for i in out['items']}['^VIX']
        assert vix['threshold_pct'] == 10.0 and vix['customized'] is False

    def test_master_switch_persists_and_survives_move_prefs_save(self):
        """급등락 설정 저장이 지수 마스터 스위치를 되살리면 안 된다.

        move_alert_prefs 는 INSERT OR REPLACE 라 같은 행에 컬럼으로 붙였다면
        저장할 때마다 조용히 기본값(켜짐)으로 돌아갔을 것이다.
        """
        uid = _user('u-idx-api5')
        main.set_index_prefs(main.IndexPrefsReq(enabled=False), cu=self._cu(uid))
        main.set_move_prefs(main.MovePrefsReq(enabled=True, threshold_pct=7.0,
                                              scope='both'), cu=self._cu(uid))
        assert main.get_index_prefs(cu=self._cu(uid))['enabled'] is False

    def test_threshold_change_rearms_only_that_index(self):
        uid = _user('u-idx-api6')
        now = 100.0
        with main._db() as conn:
            for tkr in ('^VIX', '^KS11'):
                conn.execute(
                    "INSERT OR REPLACE INTO index_alert_state"
                    "(user_id,ticker,last_kind,last_pct,fired_at) VALUES(?,?,?,?,?)",
                    (uid, tkr, 'surge', 20.0, now))
        main.set_index_prefs(main.IndexPrefsReq(items=[
            main.IndexRuleReq(ticker='^VIX', enabled=True, threshold_pct=8.0)]),
            cu=self._cu(uid))
        with main._db() as conn:
            left = {r['ticker'] for r in conn.execute(
                "SELECT ticker FROM index_alert_state WHERE user_id=?",
                (uid,)).fetchall()}
        assert left == {'^KS11'}, f'재무장 범위가 틀렸다: {left}'

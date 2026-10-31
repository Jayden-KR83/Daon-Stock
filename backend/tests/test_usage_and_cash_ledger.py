"""화면 사용 로그 · 예수금 변동 이력 (2026-10-31, 오너 결정).

둘 다 **지금 기록하지 않으면 영영 복구할 수 없는** 값이다. 그래서 기록이
조용히 빠지는 경우를 고정한다.

사용 로그: 탭을 합칠 근거 — "느낌이 아니라 기록으로 정하겠다"(오너).
예수금 이력: "매달 입출금을 손으로 적지는 않겠다. 예수금을 고치면 그게 입금이다".
  단 **delta 를 입금액으로 단정하지 않는다** — 매매·배당으로도 예수금은 변한다.
"""
import main


def _user(uid, admin=0):
    with main._db() as conn:
        # 자식 행을 먼저 지운다 — accounts 가 users 를 외래키로 참조해서,
        # 순서를 뒤집으면 FOREIGN KEY constraint 로 죽는다.
        for t in ('usage_events', 'cash_ledger', 'accounts',
                  'net_worth_snapshots', 'portfolios'):
            conn.execute(f"DELETE FROM {t} WHERE user_id=?", (uid,))
        conn.execute("DELETE FROM users WHERE user_id=?", (uid,))
        conn.execute(
            "INSERT INTO users(user_id,email,name,pw_hash,created_at,status,is_admin) "
            "VALUES(?,?,?,?,?,?,?)",
            (uid, f'{uid}@x.com', 'T', main._hash_password('pw'), 0.0,
             'approved', admin))
    return {'user_id': uid, 'is_admin': bool(admin)}


class TestUsageLogging:
    def test_short_dwell_is_not_counted(self):
        cu = _user('u-use-short')
        out = main.log_usage_tab(
            main.UsageEventReq(tab='분석', dwell_ms=1500), cu=cu)
        assert out['stored'] is False
        assert main.get_usage_tabs(cu=cu)['items'] == []

    def test_normal_dwell_counted(self):
        cu = _user('u-use-ok')
        main.log_usage_tab(main.UsageEventReq(tab='분석', dwell_ms=30_000), cu=cu)
        items = main.get_usage_tabs(cu=cu)['items']
        assert len(items) == 1
        assert items[0]['tab'] == '분석' and items[0]['visits'] == 1

    def test_afk_is_capped_not_dropped(self):
        """탭을 켜 두고 자리를 비운 시간은 사용이 아니다 — 버리지 않고 상한으로 자른다."""
        cu = _user('u-use-afk')
        main.log_usage_tab(
            main.UsageEventReq(tab='시장', dwell_ms=10 * 60 * 60 * 1000), cu=cu)
        it = main.get_usage_tabs(cu=cu)['items'][0]
        assert it['total_ms'] == main.USAGE_MAX_DWELL_MS

    def test_share_sums_to_100(self):
        cu = _user('u-use-share')
        main.log_usage_tab(main.UsageEventReq(tab='분석', dwell_ms=60_000), cu=cu)
        main.log_usage_tab(main.UsageEventReq(tab='관심', dwell_ms=20_000), cu=cu)
        out = main.get_usage_tabs(cu=cu)
        assert abs(sum(i['share_pct'] for i in out['items']) - 100) < 0.2
        assert out['items'][0]['tab'] == '분석', '오래 머문 탭이 위로 와야 한다'

    def test_basis_is_shipped(self):
        """🟥 숫자 규약 — 비중의 분모와 기록 시작일을 값과 함께 보낸다."""
        cu = _user('u-use-basis')
        main.log_usage_tab(main.UsageEventReq(tab='분석', dwell_ms=10_000), cu=cu)
        b = main.get_usage_tabs(days=7, cu=cu)['basis']
        assert b['days'] == 7 and b['total_ms'] > 0
        assert b['first_event_at'] is not None
        assert b['min_dwell_ms'] == main.USAGE_MIN_DWELL_MS

    def test_other_users_are_not_mixed_in(self):
        """🟥 개인 데이터 격리 — 남의 사용 기록이 내 집계에 섞이면 안 된다."""
        a = _user('u-use-a')
        b = _user('u-use-b')
        main.log_usage_tab(main.UsageEventReq(tab='분석', dwell_ms=60_000), cu=a)
        main.log_usage_tab(main.UsageEventReq(tab='발굴', dwell_ms=60_000), cu=b)
        tabs_a = {i['tab'] for i in main.get_usage_tabs(cu=a)['items']}
        assert tabs_a == {'분석'}, f'남의 탭이 섞였다: {tabs_a}'

    def test_scope_all_requires_admin(self):
        cu = _user('u-use-noadmin')
        try:
            main.get_usage_tabs(scope='all', cu=cu)
            assert False, '관리자가 아닌데 전체 집계를 봤다'
        except main.HTTPException as e:
            assert e.status_code == 403

    def test_admin_can_see_aggregate(self):
        adm = _user('u-use-admin', admin=1)
        main.log_usage_tab(main.UsageEventReq(tab='분석', dwell_ms=10_000), cu=adm)
        assert main.get_usage_tabs(scope='all', cu=adm)['scope'] == 'all'

    def test_empty_tab_rejected(self):
        cu = _user('u-use-empty')
        assert main.log_usage_tab(
            main.UsageEventReq(tab='  ', dwell_ms=99_000), cu=cu)['stored'] is False


def _account(uid, key='KR_PERSONAL', cash=0.0):
    with main._db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO accounts "
            "(user_id, key, label, currency, sort_order, cash, cash_updated_at) "
            "VALUES (?,?,?,?,?,?,?)", (uid, key, key, 'KRW', 0, cash, 0.0))
    return key


class TestCashLedger:
    def test_change_is_recorded_with_before_and_after(self):
        cu = _user('u-cash-1')
        k = _account(cu['user_id'], cash=1_000_000)
        out = main.update_account_cash(k, main.AccountCashReq(cash=3_000_000), cu=cu)
        assert out['prev'] == 1_000_000 and out['delta'] == 2_000_000
        rows = main.get_cash_ledger(cu=cu)['items']
        assert len(rows) == 1
        assert rows[0]['prev'] == 1_000_000 and rows[0]['curr'] == 3_000_000

    def test_same_value_is_not_recorded(self):
        """같은 값 저장을 '입금 0원'으로 적으면 이력이 소음으로 찬다."""
        cu = _user('u-cash-same')
        k = _account(cu['user_id'], cash=500_000)
        main.update_account_cash(k, main.AccountCashReq(cash=500_000), cu=cu)
        assert main.get_cash_ledger(cu=cu)['items'] == []

    def test_withdrawal_is_negative(self):
        cu = _user('u-cash-neg')
        k = _account(cu['user_id'], cash=2_000_000)
        main.update_account_cash(k, main.AccountCashReq(cash=500_000), cu=cu)
        assert main.get_cash_ledger(cu=cu)['items'][0]['delta'] == -1_500_000

    def test_ledger_does_not_call_delta_a_deposit(self):
        """예수금은 입금·매매·배당으로 변한다. 응답이 delta 를 입금이라 부르면 안 된다."""
        cu = _user('u-cash-meaning')
        k = _account(cu['user_id'], cash=0)
        main.update_account_cash(k, main.AccountCashReq(cash=100_000), cu=cu)
        out = main.get_cash_ledger(cu=cu)
        assert 'meaning' in out['basis']
        assert '입금액으로 읽으면 안 된다' in out['basis']['meaning']
        for row in out['items']:
            assert 'deposit' not in row and '입금' not in str(row)

    def test_other_users_ledger_is_isolated(self):
        a = _user('u-cash-a')
        b = _user('u-cash-b')
        ka = _account(a['user_id'], cash=0)
        _account(b['user_id'], cash=0)
        main.update_account_cash(ka, main.AccountCashReq(cash=777), cu=a)
        assert main.get_cash_ledger(cu=b)['items'] == []

    def test_missing_account_still_404(self):
        cu = _user('u-cash-404')
        try:
            main.update_account_cash('NOPE', main.AccountCashReq(cash=1), cu=cu)
            assert False, '없는 계좌에 저장이 됐다'
        except main.HTTPException as e:
            assert e.status_code == 404


class TestSnapshotCost:
    def test_cost_is_stored_and_ignores_price_moves(self):
        """매입원가는 시세와 무관해야 한다 — 그래야 '매수'와 '입금'을 가를 수 있다."""
        cu = _user('u-cost')
        pf = {'KR_PERSONAL': [{'ticker': '005930', 'quantity': 10, 'avg_price': 70_000}]}
        main._capture_net_worth_snapshot(cu['user_id'], pf,
                                         {'005930': {'current_price': 90_000}}, 1380.0)
        with main._db() as conn:
            r = conn.execute(
                "SELECT total_krw, cost_krw FROM net_worth_snapshots WHERE user_id=?",
                (cu['user_id'],)).fetchone()
        assert r['cost_krw'] == 700_000      # 10 × 70,000 — 시세 90,000 과 무관
        assert r['total_krw'] == 900_000     # 평가액은 시세를 따른다

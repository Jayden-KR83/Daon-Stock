"""Tier 0/1/2 종목분석 게이팅 회귀 보호.

- 티어 판정: admin/ai_enabled/demo = unlimited, 일반 승인 = quota
- 월 신규분석 카운트: 'stock_analyze' ai_call 만, 이번 달만 집계 (캐시 열람/타 이벤트 제외)
- 쿼터 현황 계산
"""
from time import time

import main


def _clear_audit():
    with main._db() as conn:
        conn.execute("DELETE FROM audit_log")


class TestStockAnalyzeTier:
    def test_admin_and_ai_enabled_are_unlimited(self):
        assert main._stock_analyze_tier({'user_id': 'a', 'is_admin': True}) == 'unlimited'
        assert main._stock_analyze_tier({'user_id': 'b', 'ai_enabled': True}) == 'unlimited'

    def test_demo_is_unlimited(self):
        assert main._stock_analyze_tier({'user_id': main.DEMO_UID}) == 'unlimited'

    def test_plain_approved_is_quota(self):
        assert main._stock_analyze_tier(
            {'user_id': 'u1', 'is_admin': False, 'ai_enabled': False}) == 'quota'


class TestMonthlyFreshCount:
    def test_counts_only_stock_analyze_this_month(self):
        _clear_audit()
        uid = 'quotauser'
        # 이번 달 신규 종목분석 3건
        for i in range(3):
            main._log_event(uid, 'ai_call', {'kind': 'stock_analyze', 'ticker': f'T{i}'})
        # 다른 종류 ai_call (포트폴리오 전략) — 집계 제외돼야
        main._log_event(uid, 'ai_call', {'kind': 'portfolio_strategy'})
        # 다른 유저 — 제외
        main._log_event('other', 'ai_call', {'kind': 'stock_analyze', 'ticker': 'X'})
        # 지난달 stock_analyze — 제외 (ts를 이번 달 시작 이전으로 직접 삽입)
        with main._db() as conn:
            conn.execute(
                "INSERT INTO audit_log(ts,user_id,event_type,details) VALUES(?,?,?,?)",
                (main._month_start_epoch() - 86400, uid, 'ai_call',
                 '{"kind": "stock_analyze", "ticker": "OLD"}'))
        assert main._monthly_fresh_analyze_count(uid) == 3

    def test_zero_when_none(self):
        _clear_audit()
        assert main._monthly_fresh_analyze_count('nobody') == 0


class TestQuotaStatus:
    def test_unlimited_status(self):
        s = main._ai_quota_status({'user_id': 'a', 'is_admin': True})
        assert s['unlimited'] is True and s['remaining'] is None

    def test_quota_status_decrements(self):
        _clear_audit()
        uid = 'qs'
        cu = {'user_id': uid, 'is_admin': False, 'ai_enabled': False}
        s0 = main._ai_quota_status(cu)
        assert s0['tier'] == 'quota'
        assert s0['remaining'] == main.STOCK_ANALYZE_FREE_QUOTA
        main._log_event(uid, 'ai_call', {'kind': 'stock_analyze', 'ticker': 'AAPL'})
        s1 = main._ai_quota_status(cu)
        assert s1['used'] == 1
        assert s1['remaining'] == main.STOCK_ANALYZE_FREE_QUOTA - 1

    def test_quota_floor_at_zero(self):
        _clear_audit()
        uid = 'heavy'
        cu = {'user_id': uid}
        for i in range(main.STOCK_ANALYZE_FREE_QUOTA + 5):
            main._log_event(uid, 'ai_call', {'kind': 'stock_analyze', 'ticker': f'T{i}'})
        s = main._ai_quota_status(cu)
        assert s['remaining'] == 0

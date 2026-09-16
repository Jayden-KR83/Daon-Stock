"""배당 '예정' 판정 회귀 보호 (2026-09-16).
yfinance 가 지난 배당락일을 주는데 그대로 '예정'에 넣어, 받은 배당이 분기 막대에 두 번 잡혔다.
"""
import main

TODAY = '2026-09-16'


def _d(ex, past_dates=()):
    return {'ex_date': ex, 'past': [{'date': p, 'per_share': 1.0} for p in past_dates]}


def test_past_ex_date_is_not_upcoming():
    assert main._upcoming_dividend(_d('2026-06-29'), 400_000, TODAY) is None


def test_yesterday_is_not_upcoming():
    assert main._upcoming_dividend(_d('2026-09-15'), 400_000, TODAY) is None


def test_today_and_future_are_upcoming():
    assert main._upcoming_dividend(_d('2026-09-16'), 400_000, TODAY)['ex_date'] == '2026-09-16'
    assert main._upcoming_dividend(_d('2026-09-30'), 400_000, TODAY)['ex_date'] == '2026-09-30'


def test_missing_ex_date():
    assert main._upcoming_dividend(_d(None), 400_000, TODAY) is None


def test_annual_payer_gets_full_amount():
    # 연 1회 지급 → 1회 금액 = 연간 전액 (4로 나누면 1/4 로 보인다)
    up = main._upcoming_dividend(_d('2027-03-30', ['2026-04-15']), 400_000, TODAY)
    assert up['est_total_krw'] == 400_000


def test_monthly_payer_divides_by_twelve():
    months = [f'2025-{m:02d}-15' for m in (10, 11, 12)] + [f'2026-{m:02d}-15' for m in range(1, 10)]
    up = main._upcoming_dividend(_d('2026-09-30', months), 120_000, TODAY)
    assert up['est_total_krw'] == 10_000


def test_no_history_falls_back_to_quarterly():
    up = main._upcoming_dividend(_d('2026-10-01', []), 400_000, TODAY)
    assert up['est_total_krw'] == 100_000

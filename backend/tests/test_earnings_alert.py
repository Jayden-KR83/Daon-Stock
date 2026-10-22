"""실적발표 전날 알림 판정 회귀 보호 (2026-10-08).

yfinance 의 earnings_dates 는 과거 발표일도 함께 준다. '내일'만 골라야 하고,
오늘·모레·지난 분기를 섞으면 알림이 쓸모를 잃는다.
"""
import main

TODAY = '2026-10-08'


def _ev(*dates):
    return [{'ticker': 'X', 'date': d} for d in dates]


def test_tomorrow_fires():
    assert main._earnings_due_date(_ev('2026-10-09'), TODAY) == '2026-10-09'


def test_today_does_not_fire():
    # 당일 아침 알림은 이미 늦다 — 전날만 보낸다
    assert main._earnings_due_date(_ev('2026-10-08'), TODAY) is None


def test_day_after_tomorrow_does_not_fire():
    assert main._earnings_due_date(_ev('2026-10-10'), TODAY) is None


def test_past_earnings_ignored():
    assert main._earnings_due_date(_ev('2026-07-30', '2026-04-29'), TODAY) is None


def test_picks_tomorrow_among_many():
    evs = _ev('2026-07-30', '2026-10-09', '2027-01-28')
    assert main._earnings_due_date(evs, TODAY) == '2026-10-09'


def test_month_end_rollover():
    assert main._earnings_due_date(_ev('2026-11-01'), '2026-10-31') == '2026-11-01'


def test_year_rollover():
    assert main._earnings_due_date(_ev('2027-01-01'), '2026-12-31') == '2027-01-01'


def test_empty_and_malformed_are_safe():
    assert main._earnings_due_date([], TODAY) is None
    assert main._earnings_due_date(None, TODAY) is None
    assert main._earnings_due_date(_ev(''), TODAY) is None
    assert main._earnings_due_date(_ev('2026-10-09'), 'not-a-date') is None


def test_datetime_string_is_trimmed_to_date():
    # 'YYYY-MM-DD HH:MM:SS' 형태가 섞여 들어와도 날짜로 비교한다
    assert main._earnings_due_date(
        [{'ticker': 'X', 'date': '2026-10-09 06:00:00'}], TODAY) == '2026-10-09'

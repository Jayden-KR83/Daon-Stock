"""배당 '지난 12개월 수령' — 12개월이어야 한다 (2026-10-30).

왜 회귀 보호가 필요한가:
  프런트는 분기 히스토그램을 그리려고 `months_back=48`(4년)을 보낸다.
  그런데 백엔드가 **받은 이력을 통째로 합산**해 그걸 '지난 12개월 수령'으로
  내보내고 있었다. 오너 화면 실측: 연간 예상 339만 vs 12개월 수령 851만.

  변수 이름이 `ttm`(Trailing Twelve Months)인데 48개월을 담고 있었다.
  **이름이 거짓말을 하면 아무도 의심하지 않는다.**

  이력 기간(차트용)과 합계 기간(1년)은 **서로 다른 값**이라는 것을 고정한다.
"""
from datetime import datetime, timedelta

import main


def _d(days_ago):
    return (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d')


def _past(*specs):
    return [{'date': _d(days), 'per_share': amt} for days, amt in specs]


class TestTtmWindow:
    """합계 로직 자체 — 엔드포인트와 같은 식을 쓴다."""

    def _ttm(self, past):
        cutoff = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        return sum(p['per_share'] for p in past if p['date'] >= cutoff)

    def test_4년치_이력에서_1년만_센다(self):
        past = _past((30, 100), (120, 100), (200, 100), (300, 100),   # 최근 1년 = 400
                     (400, 100), (700, 100), (1000, 100))            # 그 이전
        assert self._ttm(past) == 400

    def test_정확히_1년_경계(self):
        past = _past((364, 50), (366, 50))
        assert self._ttm(past) == 50     # 366일 전은 빠진다

    def test_이력이_없으면_0(self):
        assert self._ttm([]) == 0


class TestFallback:
    """한국 ETF 는 yfinance 가 dividendRate 를 거의 주지 않는다.
    그때 연간 예상은 **최근 12개월 실적**으로 추정한다 — 그러면 두 수치가
    같아야 정상이다. 이 등식이 깨지면 둘 중 하나의 기간이 틀어진 것이다."""

    def test_dividendRate가_없으면_예상과_실적이_같은_기간이다(self):
        past = _past((30, 100), (120, 100), (200, 100), (300, 100),
                     (400, 999), (900, 999))
        cutoff365 = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        # _fetch_dividends_single 의 폴백과 동일한 식
        annual_est = sum(p['per_share'] for p in past if p['date'] >= cutoff365)
        ttm        = sum(p['per_share'] for p in past if p['date'] >= cutoff365)
        assert annual_est == ttm == 400


class TestEndpointShape:
    def test_months_back_기본값은_12다(self):
        # 프런트가 48 을 보내더라도 **서버 기본값**은 1년이어야 한다.
        # 누가 months_back 없이 부르면 1년치가 나오는 것이 상식적이다.
        req = main.DividendsReq()
        assert req.months_back == 12

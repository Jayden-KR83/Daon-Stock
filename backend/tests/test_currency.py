"""환율 환산 회귀 보호.
KR 종목: mul = 1 (원화)
US 종목: mul = usd_krw (현재 환율로 KRW 환산)
이 단순 로직이 코드 곳곳에 흩어져 있어 정규식과 함께 변경되면 영향 큼.
"""
import main


def _val(holding, prices, usd_krw):
    """프론트/백엔드 공통 평가액 계산 로직."""
    tkr = holding['ticker']
    is_us = not main.is_kr(tkr)
    cur = prices.get(tkr, {}).get('current_price') or holding['avg_price']
    mul = usd_krw if is_us else 1.0
    return holding['quantity'] * float(cur) * mul


class TestCurrencyConversion:
    def test_kr_stock_no_conversion(self):
        h = {'ticker': '005930', 'quantity': 100, 'avg_price': 70000}
        v = _val(h, {'005930': {'current_price': 75000}}, 1380)
        assert v == 100 * 75000 * 1.0  # 7,500,000원

    def test_us_stock_converted(self):
        h = {'ticker': 'AAPL', 'quantity': 10, 'avg_price': 150}
        v = _val(h, {'AAPL': {'current_price': 200}}, 1380)
        assert v == 10 * 200 * 1380  # 2,760,000원

    def test_a_prefix_treated_as_kr(self):
        # A-prefix가 잘못 US로 분류되면 환율 곱해서 ₩560억 인시던트 재현
        h = {'ticker': 'A005490', 'quantity': 100, 'avg_price': 400000}  # POSCO
        v = _val(h, {'A005490': {'current_price': 400000}}, 1380)
        # 올바른 값: 100 × 400,000 × 1 = 40,000,000원
        # 버그 시: 100 × 400,000 × 1,380 = 55,200,000,000원 (인시던트)
        assert v == 40_000_000
        assert v < 100_000_000  # 1억 미만 (인시던트 시 ~552억)

    def test_no_price_falls_back_to_avg(self):
        h = {'ticker': 'AAPL', 'quantity': 5, 'avg_price': 100}
        v = _val(h, {}, 1380)   # 가격 데이터 없음
        assert v == 5 * 100 * 1380  # avg_price로 평가

"""AI 전략 리포트 캐시 지문 회귀 보호.

핵심 불변식 (정합성 최우선 — stale 캐시가 옛 총액·비중·수익률을 반환하던 버그 방지):
  - fingerprint는 평가액을 결정하는 모든 입력(수량·평단·현재가)을 반영해야 한다.
  - 종목 목록이 같아도 수량/평단/현재가가 바뀌면 지문이 달라져 리포트가 재생성된다.
  - 입력이 완전히 동일하면 지문도 동일(캐시 적중)하고, 순서만 달라도 동일해야 한다.
"""
import main


def _h(ticker, qty, avg, manual=0):
    return {'ticker': ticker, 'quantity': qty, 'avg_price': avg, 'manual_price': manual}


class TestStrategyFingerprint:
    def test_same_inputs_same_fp(self):
        hs = [_h('NVDA', 40, 120), _h('005930', 100, 72000)]
        pr = {'NVDA': {'current_price': 1200}, '005930': {'current_price': 80000}}
        a = main._strategy_fingerprint(hs, pr, 15, 1000000)
        b = main._strategy_fingerprint(hs, pr, 15, 1000000)
        assert a == b

    def test_order_independent(self):
        pr = {'NVDA': {'current_price': 1200}, '005930': {'current_price': 80000}}
        a = main._strategy_fingerprint([_h('NVDA', 40, 120), _h('005930', 100, 72000)], pr, 15, None)
        b = main._strategy_fingerprint([_h('005930', 100, 72000), _h('NVDA', 40, 120)], pr, 15, None)
        assert a == b

    def test_quantity_change_changes_fp(self):
        pr = {'NVDA': {'current_price': 1200}}
        a = main._strategy_fingerprint([_h('NVDA', 40, 120)], pr, 15, None)
        b = main._strategy_fingerprint([_h('NVDA', 50, 120)], pr, 15, None)
        assert a != b

    def test_current_price_change_changes_fp(self):
        a = main._strategy_fingerprint([_h('NVDA', 40, 120)], {'NVDA': {'current_price': 1200}}, 15, None)
        b = main._strategy_fingerprint([_h('NVDA', 40, 120)], {'NVDA': {'current_price': 1250}}, 15, None)
        assert a != b

    def test_avg_price_change_changes_fp(self):
        pr = {'NVDA': {'current_price': 1200}}
        a = main._strategy_fingerprint([_h('NVDA', 40, 120)], pr, 15, None)
        b = main._strategy_fingerprint([_h('NVDA', 40, 130)], pr, 15, None)
        assert a != b

    def test_manual_price_used_when_no_live(self):
        # 라이브 시세가 없으면 manual_price가 현재가로 반영 → 지문에 영향
        a = main._strategy_fingerprint([_h('404610', 10, 10000, manual=11000)], {}, 15, None)
        b = main._strategy_fingerprint([_h('404610', 10, 10000, manual=12000)], {}, 15, None)
        assert a != b

    def test_timeline_change_changes_fp(self):
        pr = {'NVDA': {'current_price': 1200}}
        a = main._strategy_fingerprint([_h('NVDA', 40, 120)], pr, 15, None)
        b = main._strategy_fingerprint([_h('NVDA', 40, 120)], pr, 10, None)
        assert a != b

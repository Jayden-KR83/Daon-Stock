"""룰 기반 리밸런싱 경고 회귀 보호.
_compute_rebalance_alerts: 단일 종목 집중·섹터 집중·큰 손실·중복 노출·미분산 5가지 룰.
"""
import main


def _hold(ticker, name, qty, avg, sector='기타'):
    return {'ticker': ticker, 'name': name, 'quantity': qty,
            'avg_price': avg, 'sector': sector}

def _px(ticker, cur):
    return {ticker: {'current_price': cur}}


class TestRebalanceAlerts:
    def test_no_holdings_no_alerts(self):
        alerts = main._compute_rebalance_alerts([], {}, 1380, 30, 50, -20)
        assert alerts == []

    def test_ticker_concentration_critical(self):
        # 단일 종목 90% 집중 → 한도 30% × 1.5 = 45% 초과 → critical
        holdings = [
            _hold('AAPL', 'Apple', 100, 100),
            _hold('NVDA', 'NVIDIA', 1, 100),
        ]
        prices = {'AAPL': {'current_price': 100}, 'NVDA': {'current_price': 100}}
        alerts = main._compute_rebalance_alerts(holdings, prices, 1380, 30, 50, -20)
        ticker_alerts = [a for a in alerts if a['rule'] == 'ticker_concentration']
        assert len(ticker_alerts) >= 1
        # AAPL이 ~99%로 critical
        aapl = next(a for a in ticker_alerts if 'Apple' in a['title'])
        assert aapl['severity'] == 'critical'

    def test_large_loss_triggered(self):
        # 평단 100, 현재 50 → -50% 손실 → -20% 임계 초과 → critical (-20*1.5=-30 초과)
        holdings = [_hold('AAPL', 'Apple', 10, 100)]
        prices = {'AAPL': {'current_price': 50}}
        alerts = main._compute_rebalance_alerts(holdings, prices, 1380, 30, 50, -20)
        loss = [a for a in alerts if a['rule'] == 'large_loss']
        assert len(loss) == 1
        assert loss[0]['severity'] == 'critical'
        assert loss[0]['value'] == -50.0

    def test_loss_below_threshold_no_alert(self):
        # -10%는 임계 -20% 미달 → 알림 없음
        holdings = [_hold('AAPL', 'Apple', 10, 100)]
        prices = {'AAPL': {'current_price': 90}}
        alerts = main._compute_rebalance_alerts(holdings, prices, 1380, 30, 50, -20)
        loss = [a for a in alerts if a['rule'] == 'large_loss']
        assert loss == []

    def test_sector_concentration(self):
        # 반도체 섹터에 5종목 모두 → 100% 집중 → 한도 50% 초과
        holdings = [
            _hold('NVDA', 'NVIDIA', 10, 100, '반도체'),
            _hold('AMD',  'AMD',    10, 100, '반도체'),
            _hold('TSM',  'TSMC',   10, 100, '반도체'),
        ]
        prices = {'NVDA': {'current_price': 100}, 'AMD': {'current_price': 100},
                  'TSM':  {'current_price': 100}}
        alerts = main._compute_rebalance_alerts(holdings, prices, 1380, 99, 50, -99)
        # 단일 종목 한도 99로 ticker_concentration 미발생
        sec = [a for a in alerts if a['rule'] == 'sector_concentration']
        assert len(sec) == 1
        assert sec[0]['value'] == 100.0

    def test_too_few_holdings(self):
        # 2종목 이하 → too_few_holdings 발화
        holdings = [_hold('AAPL', 'Apple', 1, 100), _hold('NVDA', 'NV', 1, 100)]
        prices = {'AAPL': {'current_price': 100}, 'NVDA': {'current_price': 100}}
        alerts = main._compute_rebalance_alerts(holdings, prices, 1380, 99, 99, -99)
        few = [a for a in alerts if a['rule'] == 'too_few_holdings']
        assert len(few) == 1
        assert few[0]['value'] == 2

    def test_severity_sorted(self):
        # critical이 high보다 먼저 와야 함
        holdings = [
            _hold('AAPL', 'Apple', 100, 100),   # ~99% critical
            _hold('NVDA', 'NV', 1, 100),
        ]
        prices = {'AAPL': {'current_price': 50}, 'NVDA': {'current_price': 100}}  # 50% 손실
        alerts = main._compute_rebalance_alerts(holdings, prices, 1380, 30, 50, -20)
        # 첫 alert는 critical severity여야 함
        assert alerts[0]['severity'] == 'critical'

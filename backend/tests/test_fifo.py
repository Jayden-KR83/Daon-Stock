"""FIFO 실현손익 계산 회귀 보호.
거래내역(BUY/SELL)을 FIFO로 매칭해 현재 보유 수량·평균단가·실현손익 산출.
"""
import main


def _row(side, quantity, price, fee=0, tax=0):
    return {'side': side, 'quantity': quantity, 'price': price,
            'fee': fee, 'tax': tax}


class TestFifoSummary:
    def test_single_buy(self):
        s = main._compute_holding_summary([_row('BUY', 10, 100)])
        assert s['current_quantity'] == 10
        assert s['avg_cost'] == 100
        assert s['realized_pnl'] == 0

    def test_buy_then_sell_all_profit(self):
        # 100원에 10주 매수 → 120원에 10주 매도 (수익 200)
        s = main._compute_holding_summary([
            _row('BUY',  10, 100),
            _row('SELL', 10, 120),
        ])
        assert s['current_quantity'] == 0
        assert s['avg_cost'] == 0
        assert s['realized_pnl'] == 200

    def test_buy_then_sell_partial(self):
        # 100원에 10주 매수 → 5주만 120원에 매도. 남은 5주 평단 100.
        s = main._compute_holding_summary([
            _row('BUY',  10, 100),
            _row('SELL', 5,  120),
        ])
        assert s['current_quantity'] == 5
        assert s['avg_cost'] == 100
        assert s['realized_pnl'] == 100   # (120-100)*5

    def test_fifo_multiple_lots(self):
        # 100×10 + 150×10 = 평단 125. 12주 매도 시 100원 lot 10주 + 150원 lot 2주.
        # 실현손익 = (200-100)*10 + (200-150)*2 = 1000 + 100 = 1100
        s = main._compute_holding_summary([
            _row('BUY',  10, 100),
            _row('BUY',  10, 150),
            _row('SELL', 12, 200),
        ])
        assert s['current_quantity'] == 8         # 남은 150원 lot 8주
        assert s['avg_cost'] == 150
        assert s['realized_pnl'] == 1100

    def test_fees_and_taxes_deducted(self):
        # 매수 fee 10, 매도 fee 5 + tax 3 → realized -= 5+3 (매도수수료/세금만 차감)
        # 매수 fee 10은 fee_per_share=1 → 매도분 5주에 비례 5 차감
        s = main._compute_holding_summary([
            _row('BUY',  10, 100, fee=10),
            _row('SELL', 5,  120, fee=5, tax=3),
        ])
        # (120-100)*5 - 1*5 - (5+3) = 100 - 5 - 8 = 87
        assert s['realized_pnl'] == 87
        assert s['total_fee'] == 18   # 10 + 5 + 3

    def test_empty(self):
        s = main._compute_holding_summary([])
        assert s == {'current_quantity': 0, 'avg_cost': 0,
                     'realized_pnl': 0, 'total_fee': 0}

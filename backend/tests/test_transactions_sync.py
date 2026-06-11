"""거래내역 → 보유(portfolios) FIFO 동기화 회귀 보호.

add/delete transaction 시 _sync_holding_from_tx 가 보유 수량·평단을
올바르게 생성/갱신/제거하는지 검증. (전 탭 연동의 토대)
"""
import main

UID = 'test-sync-user'
ACC = 'US'


def _insert_tx(side, qty, price, fee=0, tax=0, ticker='AAPL', name='Apple'):
    with main._db() as conn:
        conn.execute(
            "INSERT INTO transactions(user_id, account, ticker, name, side, quantity, "
            "price, fee, tax, traded_at, memo, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (UID, ACC, ticker, name, side, qty, price, fee, tax,
             main.time(), '', main.time())
        )


def _holding(uid, acc, ticker):
    data = main._load_user_data(uid)
    for h in data.get('portfolios', {}).get(acc, []):
        if str(h.get('ticker', '')).upper() == ticker.upper():
            return h
    return None


class TestTxHoldingSync:
    def setup_method(self):
        # accounts·transactions 가 users(user_id) FK를 가지므로 유저부터 생성
        with main._db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users(user_id, email, name, pw_hash, created_at) "
                "VALUES (?,?,?,?,?)",
                (UID, f'{UID}@test.local', 'Test', 'x', '2026-01-01')
            )
        main._seed_default_accounts(UID)
        with main._db() as conn:
            conn.execute("DELETE FROM transactions WHERE user_id=?", (UID,))

    def test_buy_creates_holding(self):
        _insert_tx('BUY', 10, 100)
        main._sync_holding_from_tx(UID, ACC, 'AAPL', 'Apple')
        h = _holding(UID, ACC, 'AAPL')
        assert h is not None
        assert h['quantity'] == 10
        assert h['avg_price'] == 100

    def test_two_buys_average(self):
        _insert_tx('BUY', 10, 100)
        _insert_tx('BUY', 10, 200)
        main._sync_holding_from_tx(UID, ACC, 'AAPL', 'Apple')
        h = _holding(UID, ACC, 'AAPL')
        assert h['quantity'] == 20
        assert h['avg_price'] == 150  # (10*100 + 10*200)/20

    def test_partial_sell_keeps_remaining(self):
        _insert_tx('BUY', 10, 100)
        _insert_tx('SELL', 4, 130)
        main._sync_holding_from_tx(UID, ACC, 'AAPL', 'Apple')
        h = _holding(UID, ACC, 'AAPL')
        assert h['quantity'] == 6
        assert h['avg_price'] == 100  # 남은 lot 평단 유지

    def test_sell_all_removes_holding(self):
        _insert_tx('BUY', 10, 100)
        _insert_tx('SELL', 10, 120)
        main._sync_holding_from_tx(UID, ACC, 'AAPL', 'Apple')
        assert _holding(UID, ACC, 'AAPL') is None

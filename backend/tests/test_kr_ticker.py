"""한국 종목 정규식 회귀 보호.
인시던트: A-prefix 종목(A005490 POSCO)을 미국 주식으로 오인 → ₩560억 오표시.
"""
import main


class TestIsKr:
    def test_pure_6digit(self):
        assert main.is_kr('005930') is True   # 삼성전자
        assert main.is_kr('000660') is True   # 하이닉스

    def test_a_prefix(self):
        assert main.is_kr('A005490') is True  # POSCO (KRX A 접두사)
        assert main.is_kr('A000270') is True  # 기아

    def test_us_ticker(self):
        assert main.is_kr('AAPL') is False
        assert main.is_kr('NVDA') is False
        assert main.is_kr('GOOGL') is False
        assert main.is_kr('BRK.B') is False

    def test_etf_and_crypto(self):
        assert main.is_kr('QQQ') is False
        assert main.is_kr('BTC-USD') is False

    def test_edge_cases(self):
        assert main.is_kr('') is False
        assert main.is_kr('12345') is False     # 5자리
        assert main.is_kr('1234567') is False   # 7자리
        assert main.is_kr('B005930') is False   # B 접두사


class TestKrCode:
    def test_strips_a_prefix(self):
        assert main.kr_code('A005930') == '005930'
        assert main.kr_code('A000660') == '000660'

    def test_keeps_pure_6digit(self):
        assert main.kr_code('005930') == '005930'

    def test_no_change_for_us(self):
        # KR이 아닌 ticker는 변형 X
        assert main.kr_code('AAPL') == 'AAPL'

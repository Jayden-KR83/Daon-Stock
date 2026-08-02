"""KRX 영숫자 단축코드 지원 (0131V0 = 1Q 미국우주항공테크).

왜 위험한 변경인가:
  is_kr() 판정이 틀리면 그 종목이 미국 주식으로 분류되어 평가액에 환율(×1380)이
  곱해진다. 조용히 틀린 값이 나오므로 반드시 양방향(KR 포함 / US 제외)을 고정한다.
"""
import backend.main as main


class TestKrDetection:
    def test_전통적_숫자6자리(self):
        for t in ('005930', '000660', '373220', '480310'):
            assert main.is_kr(t), t

    def test_A접두_숫자6자리(self):
        for t in ('A005930', 'A003670', 'A381170'):
            assert main.is_kr(t), t

    def test_영숫자_혼합_신형코드(self):
        # 0131V0 = 1Q 미국우주항공테크. 이 지원이 이번 변경의 목적
        for t in ('0131V0', '0131v0'):
            assert main.is_kr(t), f'{t} 가 한국 종목으로 인식되지 않음'

    def test_A접두_영숫자(self):
        assert main.is_kr('A0131V0')


class TestUsNotMisclassified:
    """미국 티커가 한국으로 잘못 분류되면 환율이 안 곱해져 평가액이 1/1380 이 된다."""

    def test_일반_미국_티커(self):
        for t in ('AAPL', 'MSFT', 'NVDA', 'TSLA', 'SOXX', 'BRK-B', 'GOOGL'):
            assert not main.is_kr(t), t

    def test_숫자로_시작하지_않으면_한국_아님(self):
        # 'A12345X' 는 제외 — A접두 + 숫자시작 6자리라 형식상 정당한 KR 코드다
        for t in ('ABCDEF', 'TSMC', 'ABC123'):
            assert not main.is_kr(t), t

    def test_길이가_다르면_한국_아님(self):
        for t in ('12345', '1234567', '0131V', '0131V01'):
            assert not main.is_kr(t), t


class TestKrCode:
    def test_A접두_제거(self):
        assert main.kr_code('A005930') == '005930'
        assert main.kr_code('A0131V0') == '0131V0'

    def test_접두_없으면_그대로(self):
        assert main.kr_code('005930') == '005930'
        assert main.kr_code('0131V0') == '0131V0'

    def test_미국_티커는_손대지_않음(self):
        for t in ('AAPL', 'BRK-B'):
            assert main.kr_code(t) == t


class TestValidator:
    def test_영숫자코드도_검증_대상(self):
        main._TICKER_MASTER.clear()
        main._TICKER_MASTER[main.kr_code('0131V0')] = (
            __import__('time').time(),
            {'name': '1Q 미국우주항공테크', 'type': 'etf', 'exchange': 'KS'})
        ok, why = main.validate_ticker('0131V0')
        assert ok and '1Q' in why

    def test_형식_틀리면_거부(self):
        main._TICKER_MASTER.clear()
        ok, why = main.validate_ticker('0131V')      # 5자리
        assert not ok

"""암호화폐 보유 지원 — 티커 정규화 · 통화 판정 · 검증.

핵심 위험: 'BTC' 만 저장하면 형식 검증은 통과하지만 야후에 그 심볼이 없어
시세가 영원히 안 나온다(447180 사고와 같은 '조용한 무시세 보유').
→ 저장 시 'BTC-USD' 로 정규화하고, 정규화 못 하는 심볼은 거부해야 한다.
"""
import backend.main as main


class TestNormalize:
    def test_맨심볼을_USD쌍으로(self):
        assert main.normalize_crypto('BTC') == 'BTC-USD'
        assert main.normalize_crypto('eth') == 'ETH-USD'
        assert main.normalize_crypto(' sol ') == 'SOL-USD'

    def test_이미_USD쌍이면_그대로(self):
        assert main.normalize_crypto('BTC-USD') == 'BTC-USD'
        assert main.normalize_crypto('btc-usd') == 'BTC-USD'

    def test_주식티커는_대문자화만(self):
        assert main.normalize_crypto('aapl') == 'AAPL'
        assert main.normalize_crypto('BRK-B') == 'BRK-B'

    def test_한국코드는_손대지_않음(self):
        assert main.normalize_crypto('005930') == '005930'
        assert main.normalize_crypto('0131V0') == '0131V0'


class TestIsCrypto:
    def test_암호화폐_판정(self):
        for t in ('BTC-USD', 'ETH-USD', 'BTC', 'DOGE-USD'):
            assert main.is_crypto(t), t

    def test_주식은_아님(self):
        # BRK-B 는 하이픈이 있지만 암호화폐가 아니다
        for t in ('AAPL', 'BRK-B', 'MSFT', '005930', 'SOXX'):
            assert not main.is_crypto(t), t

    def test_한글명_매핑(self):
        assert main.crypto_name('BTC-USD') == '비트코인'
        assert main.crypto_name('ETH') == '이더리움'
        assert main.crypto_name('AAPL') == ''


class TestCurrency:
    """암호화폐는 USD 표시 → is_kr 이 False 여야 환율이 곱해진다.
    True 가 되면 평가액이 1/1400 로 줄어든다."""

    def test_암호화폐는_한국종목_아님(self):
        for t in ('BTC-USD', 'ETH-USD'):
            assert not main.is_kr(t), t

    def test_krw쌍은_채택하지_않았음(self):
        # 'BTC-KRW' 를 저장하면 is_kr=False 라 환율이 잘못 곱해진다.
        # 정규화가 USD 쌍만 만들므로 이 티커는 애초에 생기지 않아야 한다.
        assert main.normalize_crypto('BTC-KRW') == 'BTC-KRW'   # 정규화 대상 아님
        assert not main.is_crypto('BTC-KRW')                    # 암호화폐로도 안 봄


class TestValidator:
    def test_USD쌍은_통과(self):
        main._FOREIGN_EXISTS.clear()
        main._FOREIGN_EXISTS['BTC-USD'] = (__import__('time').time(), True)
        ok, why = main.validate_ticker('BTC-USD')
        assert ok, why

    def test_시세없는_티커는_거부(self):
        main._FOREIGN_EXISTS.clear()
        main._FOREIGN_EXISTS['ZZZZ'] = (__import__('time').time(), False)
        ok, why = main.validate_ticker('ZZZZ')
        assert not ok and '조회할 수 없는' in why

    def test_맨_BTC는_거부되며_힌트를_준다(self):
        main._FOREIGN_EXISTS.clear()
        main._FOREIGN_EXISTS['BTC'] = (__import__('time').time(), False)
        ok, why = main.validate_ticker('BTC')
        assert not ok
        assert 'BTC-USD' in why, f'힌트가 없다: {why}'

    def test_네트워크_실패시_통과(self):
        """조회 불가를 '없는 티커'로 단정해 정상 등록을 막으면 안 된다."""
        main._FOREIGN_EXISTS.clear()
        orig = main._yf_chart
        main._yf_chart = lambda *a, **k: (_ for _ in ()).throw(OSError('net down'))
        try:
            ok, why = main.validate_ticker('AAPL')
            assert ok and '보류' in why
        finally:
            main._yf_chart = orig


class TestKrwAvgPriceRecord:
    """원화 평단 입력(업비트 등)의 '입력 원본' 기록이 보존되는가.

    프론트는 원화 평단 ÷ 매수시점 환율 = avg_price(달러) 로 환산해 저장하고,
    원본 두 값을 krw_avg_price / krw_fx 에 남긴다. 계산에는 쓰이지 않지만
    재편집·감사에 필요해서, 모델이 이 필드를 조용히 버리면 안 된다.
    """

    def test_holding_keeps_krw_record(self):
        h = main.Holding(ticker='BTC-USD', name='비트코인', quantity=0.05,
                         avg_price=64963.77, krw_avg_price=89_000_000, krw_fx=1370)
        d = h.model_dump()
        assert d['krw_avg_price'] == 89_000_000
        assert d['krw_fx'] == 1370

    def test_krw_record_defaults_to_zero(self):
        """기존 보유(원화 입력 안 씀)는 0 — '미사용'을 뜻한다."""
        h = main.Holding(ticker='AAPL', name='Apple', quantity=10, avg_price=180.5)
        assert h.krw_avg_price == 0 and h.krw_fx == 0

    def test_conversion_is_reproducible_from_record(self):
        """기록만으로 avg_price 를 다시 만들 수 있어야 재편집이 성립한다."""
        krw, fx = 89_000_000, 1370
        h = main.Holding(ticker='BTC-USD', name='비트코인', quantity=0.05,
                         avg_price=round(krw / fx, 8), krw_avg_price=krw, krw_fx=fx)
        assert abs(h.krw_avg_price / h.krw_fx - h.avg_price) < 1e-6

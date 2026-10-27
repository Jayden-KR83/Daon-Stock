"""교차검증 반영 — 집중도·환노출·경고 등급 (2026-10-27).

외부 LLM 3곳(Gemini·Perplexity·ChatGPT)이 공통으로 지적한 것 중
**계산으로 답할 수 있는 것들**을 고정한다. 지적의 공통점은 하나였다:
"왜 위험한가를 수치로 증명하는 층이 없다."
"""
import main
from sectors import currency_of, USD_EXPOSED_KR_ETF


class TestConcentration:
    def test_한_종목에_몰리면_유효종목수가_떨어진다(self):
        # 20종을 들고 있어도 하나가 크면 분산이 아니다 — 그걸 한 숫자로 보여주는 지표
        many = main._concentration([25] + [75 / 19] * 19)
        even = main._concentration([5] * 20)
        assert many['effective_n'] < even['effective_n']
        assert even['effective_n'] == 20.0        # 완전 균등이면 종목 수와 같다

    def test_단일종목이면_HHI가_1(self):
        c = main._concentration([100])
        assert c['hhi'] == 1.0
        assert c['effective_n'] == 1.0
        assert c['top1_pct'] == 100.0

    def test_상위5종_비중(self):
        c = main._concentration([10] * 10)
        assert c['top5_pct'] == 50.0

    def test_빈_입력도_죽지_않는다(self):
        for bad in ([], [0], [0, 0], [-5]):
            assert main._concentration(bad)['hhi'] is None, bad


class TestCurrencyExposure:
    def test_국내상장_해외ETF는_USD로_센다(self):
        # 이것이 이번 지적의 핵심 — 계좌로 세면 통째로 빠진다
        assert currency_of('133690', False) == 'USD'   # TIGER 미국나스닥100
        assert currency_of('360750', False) == 'USD'   # TIGER 미국S&P500

    def test_A접두도_같게_본다(self):
        assert currency_of('A133690', False) == 'USD'

    def test_일반_국내종목은_KRW(self):
        assert currency_of('005930', False) == 'KRW'   # 삼성전자

    def test_미국종목은_USD(self):
        assert currency_of('NVDA', True) == 'USD'

    def test_숨은_환노출이_따로_집계된다(self):
        enriched = [
            {'ticker': 'NVDA',   'is_us': True,  'value_krw': 500},
            {'ticker': '133690', 'is_us': False, 'value_krw': 300},  # 원화 상장 USD 자산
            {'ticker': '005930', 'is_us': False, 'value_krw': 200},
        ]
        fx = main._currency_exposure(enriched)
        assert fx['usd_pct'] == 80.0          # 500 + 300
        assert fx['krw_pct'] == 20.0
        assert fx['hidden_usd_pct'] == 30.0   # 계좌 기준이면 놓쳤을 부분
        assert fx['note']                     # 한계를 반드시 함께 내보낸다

    def test_빈_입력(self):
        assert main._currency_exposure([])['usd_pct'] is None


class TestLossSeverity:
    """비중 0.1% 의 -64% 와 비중 24% 의 -20% 가 같은 등급이면 등급이 정보를 잃는다."""

    def _alerts(self, holdings, prices):
        return main._compute_rebalance_alerts(
            holdings, prices, 1300.0,
            max_ticker=30, max_sector=50, max_loss=-20)

    def test_작은비중_큰손실은_critical이_아니다(self):
        hs = [
            {'ticker': '005930', 'name': '삼성전자', 'quantity': 1000, 'avg_price': 70000, 'sector': '반도체'},
            {'ticker': '000660', 'name': '소형주',   'quantity': 1,    'avg_price': 100000, 'sector': '기타'},
        ]
        pr = {'005930': {'current_price': 70000}, '000660': {'current_price': 31000}}  # -69%
        loss = [a for a in self._alerts(hs, pr) if a['rule'] == 'large_loss']
        assert len(loss) == 1
        assert loss[0]['ticker'] == '000660'
        assert loss[0]['severity'] != 'critical'      # 타격은 0.04%p 수준이다
        assert loss[0]['impact_pp'] < 0.3

    def test_큰비중_손실은_critical이다(self):
        hs = [{'ticker': '005930', 'name': '삼성전자', 'quantity': 1000,
               'avg_price': 100000, 'sector': '반도체'}]
        pr = {'005930': {'current_price': 60000}}      # -40%, 비중 100%
        loss = [a for a in self._alerts(hs, pr) if a['rule'] == 'large_loss']
        assert loss[0]['severity'] == 'critical'
        assert loss[0]['impact_pp'] >= main.LOSS_IMPACT_CRITICAL

    def test_목록에서_빼지는_않는다(self):
        # 비중이 작아도 -69% 는 판단이 틀렸다는 신호다. 숨기면 같은 실수를 반복한다.
        hs = [
            {'ticker': '005930', 'name': '큰종목', 'quantity': 100000, 'avg_price': 70000, 'sector': '반도체'},
            {'ticker': '000660', 'name': '먼지',   'quantity': 1,      'avg_price': 100000, 'sector': '기타'},
        ]
        pr = {'005930': {'current_price': 70000}, '000660': {'current_price': 31000}}
        loss = [a for a in self._alerts(hs, pr) if a['rule'] == 'large_loss']
        assert [a['ticker'] for a in loss] == ['000660']

    def test_손실률과_영향도를_나눠서_말한다(self):
        hs = [{'ticker': '005930', 'name': '삼성전자', 'quantity': 100,
               'avg_price': 100000, 'sector': '반도체'}]
        pr = {'005930': {'current_price': 60000}}
        d = [a for a in self._alerts(hs, pr) if a['rule'] == 'large_loss'][0]['detail']
        assert '영향도' in d and '비중' in d
        # 행동을 지시하지 않는다 — 손실이 크다는 것과 투자 가치가 낮다는 것은 다른 사실이다
        assert '손절' not in d


class TestMetricsBasis:
    def test_산출조건이_리포트에_실린다(self):
        mb = main.METRICS_BASIS
        assert mb['risk_free_rate'] == 0.04
        assert mb['annualization'] == 252
        assert mb['benchmark'] is None        # 없는 것을 있다고 적지 않는다
        assert '평균단가' in mb['return_basis']

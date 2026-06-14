"""GARP 발굴 스코어 회귀 보호.

순수함수(_garp_gate / _garp_score)의 핵심 불변식:
  - 게이트는 정적 기준(PEG≤1.5 · EPS성장>0 · 부채<200), 데이터 없음(None)은 면제.
  - 백분위는 시장 내 상대순위, 낮을수록 좋은 신호(PEG·부채)는 역순.
  - KR처럼 일부 축이 N/A면 가용 축만 가중치 재정규화(가짜값 0 채우기 금지).
"""
import main


class TestGarpGate:
    def test_gate_pass(self):
        ok, reason = main._garp_gate({'peg': 1.2, 'eps_growth': 15, 'debt_to_equity': 80})
        assert ok is True and reason == ''

    def test_gate_fail_peg(self):
        ok, reason = main._garp_gate({'peg': 2.0, 'eps_growth': 15, 'debt_to_equity': 80})
        assert ok is False and reason == 'PEG>1.5'

    def test_gate_fail_eps(self):
        ok, reason = main._garp_gate({'peg': 1.0, 'eps_growth': -5, 'debt_to_equity': 80})
        assert ok is False and reason == 'EPS성장≤0'

    def test_gate_fail_debt(self):
        ok, reason = main._garp_gate({'peg': 1.0, 'eps_growth': 10, 'debt_to_equity': 250})
        assert ok is False and reason == '부채비율≥200'

    def test_kr_debt_none_exempt(self):
        # KR은 부채비율 미제공(None) → 해당 조건 면제, 나머지 통과 시 pass (정직성)
        ok, reason = main._garp_gate({'peg': 1.0, 'eps_growth': 10, 'debt_to_equity': None})
        assert ok is True and reason == ''

    def test_missing_peg_not_failed(self):
        # PEG 데이터 없음 → 탈락 아님 (다른 조건만 평가)
        ok, _ = main._garp_gate({'peg': None, 'eps_growth': 10, 'debt_to_equity': 50})
        assert ok is True

    def test_gate_value_trap_revenue_plunge(self):
        # 2-C: 싸도 매출 급감(≤-15%)이면 가치 함정 → 제외
        ok, reason = main._garp_gate({'peg': 0.8, 'eps_growth': 10,
                                      'debt_to_equity': 50, 'rev_growth': -20})
        assert ok is False and reason == '매출 급감'

    def test_gate_mild_revenue_dip_ok(self):
        # 소폭 감소(-10%)는 통과 (사양산업만 거름)
        ok, _ = main._garp_gate({'peg': 0.8, 'eps_growth': 10,
                                 'debt_to_equity': 50, 'rev_growth': -10})
        assert ok is True


class TestGarpScore:
    def test_percentile_inverts_low_is_better(self):
        # PEG는 낮을수록 우수 → [1.0,1.5,2.0]의 Value 백분위 = [100,50,0]
        rows = [{'market': 'US', 'peg': 1.0},
                {'market': 'US', 'peg': 1.5},
                {'market': 'US', 'peg': 2.0}]
        out = main._garp_score(rows)
        assert [r['pct_value'] for r in out] == [100, 50, 0]

    def test_market_separated_percentile(self):
        # US/KR 백분위는 시장별 분리 — 혼합 순위가 아님
        rows = [{'market': 'US', 'peg': 1.0}, {'market': 'US', 'peg': 2.0},
                {'market': 'KR', 'peg': 0.5}, {'market': 'KR', 'peg': 0.9}]
        out = {(r['market'], r['peg']): r['pct_value'] for r in main._garp_score(rows)}
        assert out[('US', 1.0)] == 100 and out[('US', 2.0)] == 0
        assert out[('KR', 0.5)] == 100 and out[('KR', 0.9)] == 0

    def test_kr_reweight_no_phantom_zero(self):
        # KR 단일종목: 가용 3축(value/growth/quality)만 → 재정규화 분모 0.75.
        # 백분위 전부 50(단일표본)이면 composite도 50이어야(가중치 0.75로 나눔).
        # 만약 phantom 0으로 5축을 채우면 composite=30으로 깨짐 → 회귀 검출.
        rows = [{'market': 'KR', 'peg': 1.0, 'eps_growth': 10, 'roe': 12}]
        out = main._garp_score(rows)[0]
        assert out['pct_momentum'] is None and out['pct_sentiment'] is None
        assert out['data_completeness'] == 3
        assert out['composite_score'] == 50.0

    def test_full_axes_completeness_five(self):
        rows = [{'market': 'US', 'peg': 1.0, 'trailing_pe': 10, 'eps_growth': 10,
                 'rev_growth': 8, 'roe': 15, 'debt_to_equity': 50,
                 'near_52w_high': 0.9, 'analyst_upside': 12}]
        out = main._garp_score(rows)[0]
        assert out['data_completeness'] == 5
        assert 0 <= out['composite_score'] <= 100

    def test_gate_applied_in_score(self):
        rows = [{'market': 'US', 'peg': 3.0, 'eps_growth': 10}]
        out = main._garp_score(rows)[0]
        assert out['gate_pass'] == 0 and out['gate_fail_reason'] == 'PEG>1.5'

    def test_sector_relative_value(self):
        # 2-B: rel_per은 '같은 섹터' median 대비 — 고PER 섹터 종목도 불이익 없음.
        # 섹터A PER[10,14] median12, 섹터B PER[30,42] median36.
        # 각 섹터 최저가(10, 30)는 모두 rel_per≈0.833 → 절대 PER 30이어도 공평.
        rows = [
            {'market': 'US', 'sector': 'A', 'trailing_pe': 10},
            {'market': 'US', 'sector': 'A', 'trailing_pe': 14},
            {'market': 'US', 'sector': 'B', 'trailing_pe': 30},
            {'market': 'US', 'sector': 'B', 'trailing_pe': 42},
        ]
        out = {(r['sector'], r['trailing_pe']): r['rel_per'] for r in main._garp_score(rows)}
        assert out[('A', 10)] == out[('B', 30)]      # 섹터 내 동일 상대위치 → 동일 rel_per
        assert out[('A', 14)] == out[('B', 42)]
        assert out[('A', 10)] < 1.0 and out[('B', 30)] < 1.0   # 섹터 median보다 쌈


class TestGrowthHelpers:
    def test_ttm_yoy_basic(self):
        # 직전 4분기 합 100, 최근 4분기 합 120 → +20%
        vals = [20, 30, 25, 25, 30, 30, 30, 30]   # prior=100, recent=120
        assert main._ttm_yoy(vals) == 20.0

    def test_ttm_yoy_insufficient(self):
        assert main._ttm_yoy([10, 20, 30]) is None

    def test_eps_yoy_negative_base_none(self):
        # 적자(음수) 기준연도는 성장률 왜곡 → None
        trend = {'eps': [
            {'actual': -1.0, 'is_future': False}, {'actual': 1, 'is_future': False},
            {'actual': 1, 'is_future': False}, {'actual': 1, 'is_future': False},
            {'actual': 2.0, 'is_future': False}]}
        assert main._eps_yoy_from_trend(trend) is None

    def test_eps_yoy_basic(self):
        # 4분기 전 actual 2.0, 최신 actual 3.0 → +50%
        trend = {'eps': [
            {'actual': 2.0, 'is_future': False}, {'actual': 2, 'is_future': False},
            {'actual': 2, 'is_future': False}, {'actual': 2, 'is_future': False},
            {'actual': 3.0, 'is_future': False}]}
        assert main._eps_yoy_from_trend(trend) == 50.0

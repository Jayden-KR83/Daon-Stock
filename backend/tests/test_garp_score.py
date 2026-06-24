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

    def test_kr_reweight_with_missing_penalty(self):
        # KR 단일종목: 가용 3축(value/growth/quality)만. 재정규화 base=50, 결측 패널티 ×3/5 → 30.
        # phantom 0으로 5축을 채우면 base 30이 되어 또 다른 값 → 재정규화+패널티 분리 검증.
        rows = [{'market': 'KR', 'peg': 1.0, 'eps_growth': 10, 'roe': 12}]
        out = main._garp_score(rows)[0]
        assert out['pct_momentum'] is None and out['pct_sentiment'] is None
        assert out['data_completeness'] == 3
        assert out['composite_score'] == 30.0   # 50(재정규화) × 3/5(결측 패널티)

    def test_full_axes_completeness_five(self):
        rows = [{'market': 'US', 'peg': 1.0, 'trailing_pe': 10, 'eps_growth': 10,
                 'rev_growth': 8, 'roe': 15, 'debt_to_equity': 50,
                 'near_52w_high': 0.9, 'analyst_upside': 12}]
        out = main._garp_score(rows)[0]
        assert out['data_completeness'] == 5
        assert 0 <= out['composite_score'] <= 100

    def test_gate_applied_in_score(self):
        # 현재가+3축 있는 정상 데이터에서 PEG 초과로 탈락 (데이터부족 아님)
        rows = [{'market': 'US', 'peg': 3.0, 'eps_growth': 10, 'roe': 12, 'current_price': 100}]
        out = main._garp_score(rows)[0]
        assert out['gate_pass'] == 0 and out['gate_fail_reason'] == 'PEG>1.5'

    def test_gate_excludes_dead_ticker(self):
        # 현재가 없음(상폐/죽은 티커) → 평가 불가 → 데이터 부족으로 제외
        out = main._garp_score([{'market': 'US', 'peg': 1.0, 'eps_growth': 10, 'roe': 12}])[0]
        assert out['gate_pass'] == 0 and out['gate_fail_reason'] == '데이터 부족'

    def test_gate_excludes_sparse_data(self):
        # 현재가 있어도 2축(<3)뿐 → 제외
        out = main._garp_score([{'market': 'KR', 'peg': 1.0, 'eps_growth': 10, 'current_price': 1000}])[0]
        assert out['gate_pass'] == 0 and out['gate_fail_reason'] == '데이터 부족'

    def test_gate_pass_with_enough_data(self):
        # 현재가 + 3축(가치·성장·안정) → 통과
        out = main._garp_score([{'market': 'KR', 'peg': 1.0, 'eps_growth': 10, 'roe': 12, 'current_price': 1000}])[0]
        assert out['gate_pass'] == 1

    def test_market_differentiated_weights(self):
        # 한국은 모멘텀 가중이 미국보다 낮아야(reversal 연구 반영). 같은 지표라도
        # KR 종합점수에서 모멘텀 기여가 작다.
        assert main._weights_for('KR')['momentum'] < main._weights_for('US')['momentum']
        assert abs(sum(main._weights_for('KR').values()) - 1.0) < 1e-9
        # 2종목(최악 가치·최고 모멘텀 vs 반대), value·momentum 축만 → 가중 차이가 드러남
        def grp(mkt):
            return [{'market': mkt, 'peg': 2.0, 'near_52w_high': 0.99},
                    {'market': mkt, 'peg': 1.0, 'near_52w_high': 0.50}]
        us = main._garp_score(grp('US'))[0]   # value pct 0, momentum pct 100, 2/5축
        kr = main._garp_score(grp('KR'))[0]
        # base=(.30*0+.15*100)/.45=33.3 → ×2/5(결측 패널티)=13.3 / KR base 12.5 → ×0.4=5.0
        assert round(us['composite_score'], 1) == 13.3
        assert round(kr['composite_score'], 1) == 5.0
        assert kr['composite_score'] < us['composite_score']

    def test_estimate_revision_feeds_sentiment(self):
        # 3-B: 추정치 상향 신호(magnitude·breadth)가 센티먼트 축에 반영(목표가 없어도)
        rows = [{'market': 'US', 'est_rev_mag': 12.0, 'est_rev_breadth': 0.8},
                {'market': 'US', 'est_rev_mag': -5.0, 'est_rev_breadth': -0.2}]
        out = main._garp_score(rows)
        assert out[0]['pct_sentiment'] is not None     # 신호가 센티먼트로 들어감
        assert out[0]['pct_sentiment'] > out[1]['pct_sentiment']  # 상향 종목이 더 높음

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


class TestInnovScore:
    def _base(self, **over):
        r = {'market': 'US', 'sector': 'AI 신약', 'psr': 4.0, 'rnd_intensity': 1.0,
             'pct_momentum': 50.0, 'runway_years': 5.0, 'current_price': 10.0}
        r.update(over)
        return r

    def test_modval_uses_capped_rnd(self):
        # Gemini #1: mod_val(PSR÷R&D)은 *캡 적용된* R&D집중도(상한 3.0)로 계산해야.
        # 무모한 소각(R&D 600%)을 캡 전 값으로 나누면 변형밸류가 비정상적으로 낮아져 저평가 오인.
        out = main._innov_score([self._base(psr=30.0, rnd_intensity=6.0)])[0]
        assert out['rnd_intensity'] == 3.0          # 캡 적용
        assert out['mod_val'] == 10.0               # 30 ÷ 3.0 (캡 후), 30÷6=5.0 아님

    def test_bio_clinical_runway_gate_15(self):
        # Gemini #2: 임상 바이오는 유증 희석 위험 커 런웨이 게이트 1.5년. 1.2년이면 탈락.
        bio = main._innov_score([self._base(sector='유전자치료', runway_years=1.2)])[0]
        assert bio['gate_pass'] == 0 and bio['gate_fail_reason'] == '현금소진 위험'

    def test_non_bio_runway_gate_10(self):
        # AI 소프트웨어 등 비임상은 1.0년 유지 → 런웨이 1.2년 통과.
        sw = main._innov_score([self._base(sector='AI 플랫폼', runway_years=1.2)])[0]
        assert sw['gate_pass'] == 1 and sw['gate_fail_reason'] == ''

    def test_runway_below_one_always_fails(self):
        sw = main._innov_score([self._base(sector='AI 플랫폼', runway_years=0.5)])[0]
        assert sw['gate_pass'] == 0 and sw['gate_fail_reason'] == '현금소진 위험'


class TestEtfEquity:
    def test_kr_etf_no_structural_cost_penalty(self):
        # Gemini #3: 한국 ETF는 보수율(저비용)이 구조적 미제공 → 결측 패널티 분모를 2(추세+규모)로.
        # 2/2축을 갖춘 최상위 KR ETF는 강등되면 안 됨(구 /3 패널티면 100→66.7로 부당 강등).
        rows = [
            {'market': 'KR', 'near_52w_high': 0.95, 'ret_6m': 20, 'avg_volume': 2e6,
             'expense_ratio': None, 'aum': None, 'current_price': 100},
            {'market': 'KR', 'near_52w_high': 0.50, 'ret_6m': -5, 'avg_volume': 1e6,
             'expense_ratio': None, 'aum': None, 'current_price': 100},
        ]
        out = main._etf_score(rows)
        top = max(out, key=lambda r: r['composite_score'])
        assert top['data_completeness'] == 2           # 추세+규모만(저비용 구조적 결측)
        assert top['composite_score'] == 100.0         # 패널티 없음(구 코드면 66.67)

    def test_us_etf_keeps_three_axis_penalty(self):
        # 미국 ETF는 3축 기준 유지 — 저비용 진짜 결측이면 패널티.
        rows = [{'market': 'US', 'near_52w_high': 0.95, 'ret_6m': 20, 'avg_volume': 2e6,
                 'expense_ratio': None, 'aum': 5e9, 'current_price': 100}]
        out = main._etf_score(rows)[0]
        assert out['composite_score'] < 100.0          # 저비용 결측 → /3 패널티 잔존


class TestSectorReclassification:
    def test_shipbuilders_split_from_defense(self):
        # Gemini #4: 조선 시클리컬을 '방산·우주'에서 분리(섹터중립 밸류 오적용 방지).
        assert '조선·중공업' in main.KR_SECTOR_TOP
        ship = dict(main.KR_SECTOR_TOP['조선·중공업'])
        assert '009540' in ship and ship['009540'] == 'HD한국조선해양'
        defense = dict(main.KR_SECTOR_TOP['방산·우주'])
        assert '009540' not in defense and '329180' not in defense   # 조선주 빠짐
        assert '012450' in defense                                    # 한화에어로는 잔류


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

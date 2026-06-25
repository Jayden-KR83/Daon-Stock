"""목표 달성 필요 CAGR 역산 회귀 보호.

_required_cagr(현재가·월납입·기간·목표)은 적립식 미래가치=목표를 만족하는 연수익률을 이분법으로 푼다.
순수함수(사용자 입력만 사용 — 개인값 하드코딩 없음, 멀티테넌트). 핵심 불변식:
  - 단조성: 월납입↑ 또는 기간↑ → 필요 CAGR↓
  - 경계: 이미 목표 초과면 ≤0, 연 100%로도 불가하면 None
"""
import main


class TestRequiredCagr:
    def test_basic_double_in_10y(self):
        # 1억 · 월납입0 · 120개월 · 목표 2억 → 연 ~7.2% (2^(1/10)-1)
        r = main._required_cagr(1e8, 0, 120, 2e8)
        assert r is not None and 0.06 < r < 0.08

    def test_already_met_is_nonpositive(self):
        # 현재가가 이미 목표 이상 → 필요 수익률 ≤ 0
        r = main._required_cagr(3e8, 0, 120, 2e8)
        assert r is not None and r <= 0

    def test_impossible_returns_none(self):
        # 1만원으로 1년 뒤 1조 → 도달 불가
        assert main._required_cagr(1e4, 0, 12, 1e12) is None

    def test_monthly_contrib_lowers_required_cagr(self):
        no_contrib   = main._required_cagr(1e8, 0,    120, 5e8)
        with_contrib = main._required_cagr(1e8, 2e6,  120, 5e8)
        assert no_contrib is not None and with_contrib is not None
        assert with_contrib < no_contrib

    def test_longer_horizon_lowers_required_cagr(self):
        short = main._required_cagr(1e8, 1e6, 60,  5e8)
        long  = main._required_cagr(1e8, 1e6, 180, 5e8)
        assert short is not None and long is not None
        assert long < short

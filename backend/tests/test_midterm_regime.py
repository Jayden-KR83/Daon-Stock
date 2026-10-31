"""중기 국면(regime) — 사실 계산 회귀 보호 (2026-10-31, 오너 요청 #12의 바닥).

이 층은 예측이 아니라 산수다. 그래서 전부 결정론적으로 고정할 수 있다.
가장 중요한 것: **데이터가 모자라면 None 이어야 한다.** 짧은 이력을 긴 창인 척
채우는 순간 숫자가 거짓말을 시작하고, 그 위에 올라갈 AI 는 그걸 그대로 믿는다.
"""
import math

from midterm import (midterm_regime, portfolio_regime, PHASES, MIDTERM_BASIS)


def series(n, start=100.0, daily=0.0):
    """일정 비율로 움직이는 n개 종가."""
    return [start * ((1 + daily) ** i) for i in range(n)]


class TestShortHistory:
    def test_empty_is_all_none(self):
        r = midterm_regime([])
        assert r['samples'] == 0 and r['price'] is None
        assert r['phase'] is None and r['ma'] is None

    def test_none_and_garbage_dropped(self):
        r = midterm_regime([100, None, 'x', 0, -5, 110])
        assert r['samples'] == 2          # 100, 110 만 남는다
        assert r['price'] == 110

    def test_too_short_for_ma_leaves_ma_none(self):
        r = midterm_regime(series(150))   # 200일선에 못 미친다
        assert r['ma'] is None and r['ma_gap_pct'] is None
        assert r['phase'] is None, '이력이 모자란데 국면을 단정했다'

    def test_ma_without_slope_still_no_phase(self):
        # 200일선은 나오지만 기울기(추가 60일)를 볼 수 없는 구간
        r = midterm_regime(series(210))
        assert r['ma'] is not None
        assert r['ma_rising'] is None
        assert r['phase'] is None

    def test_samples_always_reported(self):
        assert midterm_regime(series(37))['samples'] == 37


class TestPhases:
    def test_uptrend(self):
        r = midterm_regime(series(400, daily=0.001))      # 꾸준한 상승
        assert r['ma_gap_pct'] > 0 and r['ma_rising'] is True
        assert r['phase'] == '상승추세'

    def test_downtrend(self):
        r = midterm_regime(series(400, daily=-0.001))
        assert r['ma_gap_pct'] < 0 and r['ma_rising'] is False
        assert r['phase'] == '하락추세'

    def test_rebound_attempt(self):
        # 길게 내리다 최근 반등 → 선 위로 올라왔지만 선 자체는 아직 내림.
        # 반등은 **완만해야** 한다. 70일 +1.2%/일 같은 폭등은 200일선까지
        # 끌어올려 ma_rising 이 True 가 된다(첫 픽스처가 그래서 틀렸다).
        px = series(330, daily=-0.0015)
        last = px[-1]
        px += [last * (1 + 0.005) ** i for i in range(1, 31)]
        r = midterm_regime(px)
        assert r['ma_gap_pct'] > 0 and r['ma_rising'] is False
        assert r['phase'] == '반등 시도'

    def test_trend_break(self):
        # 길게 오르다 최근 하락 → 선 아래로 떨어졌지만 선은 아직 오름.
        # 같은 이유로 하락도 완만해야 한다 — 반토막은 200일선도 함께 꺾는다.
        px = series(330, daily=0.0015)
        last = px[-1]
        px += [last * (1 - 0.005) ** i for i in range(1, 31)]
        r = midterm_regime(px)
        assert r['ma_gap_pct'] < 0 and r['ma_rising'] is True
        assert r['phase'] == '추세 이탈'

    def test_every_phase_label_reachable(self):
        assert set(PHASES.values()) == {'상승추세', '반등 시도', '추세 이탈', '하락추세'}


class TestReturnsAndBand:
    def test_returns_use_trading_day_windows(self):
        px = series(400, daily=0.0)        # 완전 횡보
        r = midterm_regime(px)
        assert r['ret_3m'] == 0.0 and r['ret_6m'] == 0.0 and r['ret_12m'] == 0.0

    def test_known_6m_return(self):
        px = [100.0] * 300
        px[-1] = 100.0
        px[-127] = 80.0                   # 126거래일 전 = 80 → +25%
        assert midterm_regime(px)['ret_6m'] == 25.0

    def test_band_at_high_and_low(self):
        up = series(300, daily=0.002)
        assert midterm_regime(up)['band_pct'] == 100.0      # 신고가
        assert midterm_regime(up)['drawdown_pct'] == 0.0
        dn = series(300, daily=-0.002)
        assert midterm_regime(dn)['band_pct'] == 0.0        # 신저가
        # 252거래일 창 안의 고점 대비다 — 300일치를 다 보지 않는다
        assert midterm_regime(dn)['drawdown_pct'] < -35

    def test_flat_series_band_is_middle(self):
        # 고가=저가면 0으로 나눌 수 없다. 위도 아래도 아니므로 50.
        assert midterm_regime([100.0] * 300)['band_pct'] == 50.0

    def test_volatility_zero_when_flat(self):
        assert midterm_regime([100.0] * 300)['vol_annual_pct'] == 0.0

    def test_volatility_positive_when_choppy(self):
        px = [100 * (1.03 if i % 2 else 0.97) for i in range(300)]
        assert midterm_regime(px)['vol_annual_pct'] > 30


class TestBasisIsShipped:
    """🟥 숫자 규약 — 계산 조건을 값과 함께 내보낸다."""

    def test_basis_and_rule_always_present(self):
        for px in ([], series(10), series(400, daily=0.001)):
            r = midterm_regime(px)
            assert r['basis']['trend_ma'] == 200
            assert r['basis']['slope_window'] == 60
            assert r['phase_rule'] and '200일선' in r['phase_rule']

    def test_basis_override_is_reflected(self):
        r = midterm_regime(series(400, daily=0.001), basis={'trend_ma': 50})
        assert r['basis']['trend_ma'] == 50, '바꾼 창이 응답에 안 실렸다'
        assert r['ma'] is not None


def _item(w, phase_px, ticker='X'):
    return {'ticker': ticker, 'name': ticker, 'weight': w,
            'regime': midterm_regime(phase_px)}


class TestPortfolioRollup:
    UP = series(400, daily=0.001)
    DN = series(400, daily=-0.001)

    def test_weighted_not_counted(self):
        # 금액 가중이다 — 종목 수로 세면 9천만원짜리와 1천만원짜리가 같아진다
        out = portfolio_regime([_item(90_000_000, self.UP, 'BIG'),
                                _item(10_000_000, self.DN, 'SMALL')])
        assert out['phases']['상승추세'] == 90.0
        assert out['phases']['하락추세'] == 10.0

    def test_unknown_excluded_from_denominator_but_reported(self):
        # 이력이 짧아 국면을 모르는 종목을 '중립'으로 채우지 않는다
        out = portfolio_regime([_item(50_000_000, self.UP, 'KNOWN'),
                                _item(50_000_000, series(30), 'NEW')])
        assert out['phases']['상승추세'] == 100.0      # 아는 것 안에서의 비중
        assert out['covered_weight_pct'] == 50.0
        assert out['unknown_weight_pct'] == 50.0
        assert out['holdings'] == 2 and out['holdings_known'] == 1

    def test_all_unknown_is_safe(self):
        out = portfolio_regime([_item(1_000_000, series(10))])
        assert out['covered_weight_pct'] == 0.0
        assert out['unknown_weight_pct'] == 100.0
        assert out['ma_gap_pct'] is None

    def test_empty_is_safe(self):
        out = portfolio_regime([])
        assert out['holdings'] == 0 and out['ma_gap_pct'] is None
        assert out['unknown_weight_pct'] == 0.0

    def test_weighted_ma_gap(self):
        out = portfolio_regime([_item(90_000_000, self.UP),
                                _item(10_000_000, self.DN)])
        gaps = [midterm_regime(self.UP)['ma_gap_pct'],
                midterm_regime(self.DN)['ma_gap_pct']]
        expect = round((gaps[0] * 9 + gaps[1] * 1) / 10, 2)
        assert math.isclose(out['ma_gap_pct'], expect, abs_tol=0.02)

    def test_phase_shares_sum_to_100(self):
        out = portfolio_regime([_item(30_000_000, self.UP),
                                _item(70_000_000, self.DN)])
        assert math.isclose(sum(out['phases'].values()), 100.0, abs_tol=0.2)

    def test_negative_weight_treated_as_zero(self):
        out = portfolio_regime([_item(-5_000_000, self.UP, 'BAD'),
                                _item(10_000_000, self.DN, 'OK')])
        assert out['phases']['하락추세'] == 100.0

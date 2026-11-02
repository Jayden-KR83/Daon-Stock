"""기술적 지표 정본 — 2026-11-02.

왜 생겼나
---------
① 같은 계산이 **두 곳에 복붙**돼 있었다(미국 `_chart_to_full` · 한국 `_kr_history`).
   한쪽만 고치면 같은 종목이 어느 경로로 오느냐에 따라 값이 달라진다.
② RSI 가 `rolling(14).mean()` — **단순이동평균** 버전이었다. 세상이 'RSI' 라고
   부르는 것은 Wilder(1978)의 **지수가중 평활** 버전이고, 둘은 같은 이름으로
   다른 값을 낸다. 증권사 앱과 나란히 놓으면 다온만 다른 숫자를 말했다.

기준값 출처
-----------
Wilder 가 『New Concepts in Technical Trading Systems』(1978)에 실은 예제 수열을
쓴다. 이 수열은 RSI 구현을 검증할 때 널리 쓰이는 사실상의 표준 픽스처다.
14일 첫 RSI ≈ 70.53 이 나와야 한다.
"""
import indicators as ind


# Wilder 1978 예제 종가 (첫 RSI 가 70.53 즈음 나오는 수열)
WILDER = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
          45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00,
          46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45,
          45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13]


class TestRsiIsWilder:
    def test_matches_wilder_reference(self):
        """표준 예제와 맞아야 한다 — 틀리면 증권사 앱과 숫자가 어긋난다."""
        r = ind.rsi_series(WILDER)
        assert r[14] is not None
        assert abs(r[14] - 70.53) < 0.5, f'첫 RSI 가 {r[14]} — Wilder 기준 70.53'

    def test_later_values_decline_with_the_price(self):
        r = ind.rsi_series(WILDER)
        assert r[-1] < r[14], '가격이 꺾였는데 RSI 가 안 내려갔다'
        assert 0 <= r[-1] <= 100

    def test_warmup_is_none_not_guessed(self):
        """앞 14개를 '있는 데까지'로 채우면 선이 거짓말을 한다."""
        r = ind.rsi_series(WILDER)
        assert all(v is None for v in r[:14])

    def test_too_short_is_all_none(self):
        assert ind.rsi_series([1, 2, 3]) == [None, None, None]
        assert ind.rsi_series([]) == []

    def test_only_gains_is_100(self):
        r = ind.rsi_series([100 + i for i in range(30)])
        assert r[-1] == 100.0

    def test_only_losses_is_0(self):
        r = ind.rsi_series([100 - i for i in range(30)])
        assert r[-1] == 0.0

    def test_flat_series_is_neutral_not_crash(self):
        """완전 횡보는 0 으로 나누는 자리다 — 터지지 않고 중립이어야 한다."""
        r = ind.rsi_series([100.0] * 30)
        assert r[-1] == 50.0

    def test_differs_from_simple_moving_average_version(self):
        """옛 구현(단순이동평균)과 **다른 값**이어야 한다. 같으면 안 고쳐진 것이다."""
        period = 14
        deltas = [WILDER[i] - WILDER[i - 1] for i in range(1, len(WILDER))]
        g = sum(max(d, 0) for d in deltas[-period:]) / period
        l = sum(max(-d, 0) for d in deltas[-period:]) / period
        cutler = 100 - 100 / (1 + g / l)
        wilder = ind.rsi_series(WILDER)[-1]
        assert abs(wilder - cutler) > 0.5, \
            f'Wilder({wilder}) 와 단순평균({cutler:.2f}) 이 같다 — 평활이 안 걸렸다'


class TestMovingAverages:
    def test_simple_average_is_correct(self):
        s = ind.sma_series([1, 2, 3, 4, 5], 3)
        assert s[:2] == [None, None]
        assert s[2] == 2.0 and s[3] == 3.0 and s[4] == 4.0

    def test_warmup_is_none(self):
        """20일선이 5일치 평균으로 그려지면 선이 거짓말을 한다."""
        s = ind.sma_series(list(range(10)), 20)
        assert all(v is None for v in s)

    def test_rolling_window_actually_slides(self):
        s = ind.sma_series([10, 10, 10, 100], 3)
        assert s[2] == 10.0
        assert abs(s[3] - 40.0) < 1e-9

    def test_200_is_available(self):
        """오너 요청(2026-11-02) — 200일선. 중기 국면 판정도 200 을 쓴다."""
        assert 200 in ind.MA_PERIODS
        s = ind.sma_series([float(i) for i in range(250)], 200)
        assert s[199] is not None and s[198] is None


class TestAttach:
    def _rows(self, n=260):
        return [{'date': f'2026-01-{i:03d}', 'close': 100 + (i % 7)} for i in range(n)]

    def test_every_period_and_rsi_attached(self):
        rows = ind.attach_indicators(self._rows())
        last = rows[-1]
        for p in ind.MA_PERIODS:
            assert last[f'ma{p}'] is not None, f'ma{p} 가 비었다'
        assert last['rsi'] is not None

    def test_rows_without_close_get_none_not_crash(self):
        rows = [{'date': 'x', 'close': None}, {'date': 'y', 'close': 100}]
        out = ind.attach_indicators(rows)
        assert out[0]['rsi'] is None and out[0]['ma20'] is None

    def test_empty_is_safe(self):
        assert ind.attach_indicators([]) == []

    def test_short_history_leaves_long_ma_none(self):
        rows = ind.attach_indicators(self._rows(30))
        assert rows[-1]['ma20'] is not None
        assert rows[-1]['ma200'] is None, '30일치로 200일선을 그렸다'

    def test_basis_is_shipped(self):
        """🟥 숫자 규약 — 계산 조건을 값과 함께 보낸다."""
        b = ind.INDICATOR_BASIS
        assert b['rsi_period'] == 14
        assert 'Wilder' in b['rsi_method']
        assert 200 in b['ma_periods']
        assert '판정이 아니다' in b['note'], 'RSI 70/30 을 단정하지 않는다는 선언이 빠졌다'


class TestOneSourceOfTruth:
    def test_main_does_not_recompute_indicators(self):
        """main.py 에 계산식이 다시 생기면 두 벌이 되고 반드시 어긋난다."""
        import io
        import os
        p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         'main.py')
        src = io.open(p, encoding='utf-8').read()
        for banned in ("rolling(14).mean()", "rolling(20).mean()",
                       "rolling(60).mean()", "rolling(120).mean()"):
            assert banned not in src, f'main.py 에 지표 계산이 다시 생겼다: {banned}'

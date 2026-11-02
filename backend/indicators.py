"""기술적 지표 — 종가 하나로 계산되는 **산수**. 네트워크도 DB 도 없다.

왜 모듈을 나눴나 (2026-11-02)
-----------------------------
같은 계산이 **두 곳에 복붙**돼 있었다 — 미국 경로(`_chart_to_full`)와 한국 경로
(`_kr_history`). 한쪽만 고치면 같은 종목을 어느 나라 코드로 보느냐에 따라
RSI 가 달라진다. 🟦 섹터 규약 1번과 같은 이유로 정본을 하나로 모은다.

왜 RSI 를 바꿨나
----------------
옛 코드는 `delta.rolling(14).mean()` — **단순이동평균**이었다. 그런데 세상이
'RSI' 라고 부르는 것은 Wilder(1978)의 **지수가중(평활) 이동평균** 버전이다.
둘은 같은 이름으로 **다른 값**을 낸다. 증권사 앱·트레이딩뷰와 나란히 놓으면
다온만 다른 숫자를 말하게 된다(🟥 숫자 규약 — 같은 이름은 같은 것을 가리킨다).

Wilder 평활: 첫 14개는 단순평균, 이후 `avg = (avg*13 + 오늘) / 14`.

판정하지 않는다
---------------
RSI 70/30 을 '과매수·과매도'라고 **단정하지 않는다**. 다온은 숫자를 주고
해석은 사람이 한다(RADAR 2026-09 에서 복권형 편향 진단을 그렇게 정했다).
그래서 이 모듈은 값만 돌려주고, 기준선은 화면이 '선'으로만 그린다.
"""

# 화면에 그릴 이동평균 기간. 20·60 은 단기·중기, 120 은 한국 시장에서 널리 쓰고,
# 200 은 전 세계 공통 추세선이다(중기 국면 판정도 200 을 쓴다 — backend/midterm.py).
MA_PERIODS = (20, 60, 120, 200)
RSI_PERIOD = 14

INDICATOR_BASIS = {
    'ma_periods':  list(MA_PERIODS),
    'rsi_period':  RSI_PERIOD,
    'rsi_method':  'Wilder 평활(지수가중) — 증권사·트레이딩뷰와 같은 방식',
    'source':      '일봉 종가(배당 미조정)',
    'note':        'RSI 70/30 은 기준선일 뿐 과매수·과매도 판정이 아니다',
}


def sma_series(closes, n):
    """단순이동평균 수열. 데이터가 모자라는 앞부분은 None 이다.

    모자란 구간을 '있는 데까지의 평균'으로 채우지 않는다 — 그러면 20일선이
    5일치 평균으로 그려지면서 선이 거짓말을 한다.
    """
    out, total = [], 0.0
    for i, c in enumerate(closes):
        total += c
        if i >= n:
            total -= closes[i - n]
        out.append(round(total / n, 4) if i >= n - 1 else None)
    return out


def rsi_series(closes, period=RSI_PERIOD):
    """Wilder RSI 수열. 앞 `period` 개는 None.

    - 하락이 하나도 없는 구간(loss=0)은 100 이다. 0 으로 나누지 않는다.
    - 상승이 하나도 없으면 0.
    """
    n = len(closes)
    out = [None] * n
    if n <= period:
        return out

    gains = losses = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    avg_g, avg_l = gains / period, losses / period
    out[period] = _rsi_from(avg_g, avg_l)

    for i in range(period + 1, n):
        d = closes[i] - closes[i - 1]
        avg_g = (avg_g * (period - 1) + max(d, 0.0)) / period
        avg_l = (avg_l * (period - 1) + max(-d, 0.0)) / period
        out[i] = _rsi_from(avg_g, avg_l)
    return out


def _rsi_from(avg_gain, avg_loss):
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0   # 둘 다 0 = 완전 횡보
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def attach_indicators(rows, close_key='close'):
    """일봉 행 리스트에 ma*/rsi 를 **제자리에서** 채워 넣고 그 리스트를 돌려준다.

    rows: [{'date':..., 'close':...}, ...] — 종가가 없는 행은 지표도 None.
    호출부(main.py)는 이 함수만 부른다. 계산식을 다시 쓰지 않는다.
    """
    if not rows:
        return rows
    closes, idx = [], []
    for i, r in enumerate(rows):
        c = r.get(close_key)
        if c is None:
            continue
        try:
            closes.append(float(c))
            idx.append(i)
        except (TypeError, ValueError):
            continue

    mas = {p: sma_series(closes, p) for p in MA_PERIODS}
    rsi = rsi_series(closes)

    for r in rows:
        for p in MA_PERIODS:
            r[f'ma{p}'] = None
        r['rsi'] = None
    for j, i in enumerate(idx):
        for p in MA_PERIODS:
            rows[i][f'ma{p}'] = mas[p][j]
        rows[i]['rsi'] = rsi[j]
    return rows

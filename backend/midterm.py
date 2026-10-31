"""중기 국면(regime) — 일봉 종가 하나로 계산되는 **사실**만 담는다.

왜 모듈을 나눴나
----------------
'중기 예측 자비스'(오너 요청 #12)의 바닥이다. 예측을 말하기 전에 **지금 어디에
서 있는지**가 먼저 있어야 하고, 그 층은 AI 가 아니라 산수여야 한다.
같은 입력이면 같은 답이 나오고, 테스트로 고정할 수 있고, 틀렸을 때 왜 틀렸는지
짚을 수 있다. main.py 에 두면 이 성질이 금방 흐려진다(시세 호출·DB·캐시가 섞인다).

여기 있는 함수는 **네트워크도 DB 도 건드리지 않는다.** 종가 리스트를 받아 숫자를
돌려줄 뿐이다. 호출부(main.py)가 시세를 가져오고 캐시한다.

판정이 아니라 분류다
--------------------
`phase` 는 "오를 것/내릴 것"이 아니라 **"지금 추세의 위/아래 중 어디인가"** 다.
규칙이 두 줄로 적히고(`PHASE_RULE`), 응답에 그 규칙과 계산 조건을 같이 실어 보낸다.
🟥 숫자 규약 1번 — 요청 파라미터가 계산 기간을 바꾸면 그 기간을 응답에 담는다.

다온은 "판정하지 않고 숫자만" 을 지켜 왔다(RADAR 2026-09: 복권형 편향 진단에서도
비중만 보여주고 판정은 하지 않기로 했다). 국면 라벨은 그 선을 넘지 않는다 —
**규칙이 보이면 사용자가 동의하지 않을 수 있기 때문이다.** 보이지 않는 판정만이
잔소리가 된다.
"""

MIDTERM_BASIS = {
    'interval':      '일봉',
    'trend_ma':      200,     # 추세선 = 200일 단순이동평균 (중기의 관습적 기준)
    'slope_window':  60,      # 추세선이 '오르는 중'인지 보는 창 (약 3개월)
    'band_window':   252,     # 52주 밴드 (거래일 기준)
    'vol_window':    60,      # 연율 변동성 창
    'annualization': 252,
    'source':        '종가(배당 미조정) — 수익률은 가격 기준이다',
}

PHASE_RULE = (
    '현재가가 200일선 위/아래 × 200일선이 최근 60일간 올랐는가/아니는가 — '
    '네 칸으로 나눈 것일 뿐, 앞으로의 방향에 대한 말이 아니다'
)

# (price_above_ma, ma_rising) -> 라벨
PHASES = {
    (True,  True):  '상승추세',
    (True,  False): '반등 시도',
    (False, True):  '추세 이탈',
    (False, False): '하락추세',
}


def _clean(closes) -> list:
    """None·0·음수·숫자가 아닌 것을 걷어낸다. 순서는 유지한다."""
    out = []
    for c in closes or []:
        try:
            v = float(c)
        except (TypeError, ValueError):
            continue
        if v > 0:
            out.append(v)
    return out


def _pct(a, b):
    """b 대비 a 의 변화율 %. 분모가 없으면 None."""
    if not b:
        return None
    return round((a / b - 1) * 100, 2)


def _sma(vals: list, n: int):
    if len(vals) < n:
        return None
    return sum(vals[-n:]) / n


def midterm_regime(closes, basis: dict | None = None) -> dict:
    """일봉 종가 리스트 → 중기 국면 지표.

    데이터가 모자라면 **그 항목만 None** 이다. 짧은 이력을 긴 창인 척 채우지 않는다
    (🟥 숫자 규약 3번 — 과거에 없던 값을 소급해 지어내지 않는다).
    `samples` 와 `basis` 를 늘 함께 돌려주므로 호출부가 신뢰도를 판단할 수 있다.
    """
    b = {**MIDTERM_BASIS, **(basis or {})}
    px = _clean(closes)
    out = {
        'samples':        len(px),
        'price':          px[-1] if px else None,
        'ma':             None,   # 200일선
        'ma_gap_pct':     None,   # 현재가가 200일선 대비 몇 % 위/아래
        'ma_rising':      None,   # 200일선이 최근 60일 동안 올랐나
        'ret_3m':         None,
        'ret_6m':         None,
        'ret_12m':        None,
        'band_pct':       None,   # 52주 저가(0)~고가(100) 사이 위치
        'drawdown_pct':   None,   # 52주 고가 대비 현재 낙폭(음수)
        'vol_annual_pct': None,
        'phase':          None,
        'phase_rule':     PHASE_RULE,
        'basis':          b,
    }
    if not px:
        return out

    cur = px[-1]

    # ── 추세선 ──
    ma = _sma(px, b['trend_ma'])
    if ma:
        out['ma'] = round(ma, 4)
        out['ma_gap_pct'] = _pct(cur, ma)
        # 60일 전 시점의 200일선과 비교 — 선 자체가 오르는 중인지
        back = b['slope_window']
        if len(px) >= b['trend_ma'] + back:
            ma_then = _sma(px[:-back], b['trend_ma'])
            if ma_then:
                out['ma_rising'] = ma > ma_then

    # ── 기간 수익률 (거래일 근사: 3개월=63, 6개월=126, 12개월=252) ──
    for key, n in (('ret_3m', 63), ('ret_6m', 126), ('ret_12m', 252)):
        if len(px) > n:
            out[key] = _pct(cur, px[-(n + 1)])

    # ── 52주 밴드 · 낙폭 ──
    win = px[-b['band_window']:] if len(px) >= 20 else []
    if win:
        lo, hi = min(win), max(win)
        if hi > lo:
            out['band_pct'] = round((cur - lo) / (hi - lo) * 100, 1)
        elif hi == lo:
            out['band_pct'] = 50.0      # 완전 횡보 — 위도 아래도 아니다
        if hi > 0:
            out['drawdown_pct'] = _pct(cur, hi)

    # ── 연율 변동성 (일간 로그수익률 표준편차) ──
    vw = b['vol_window']
    if len(px) > vw:
        seg = px[-(vw + 1):]
        rets = [(seg[i] / seg[i - 1] - 1) for i in range(1, len(seg))]
        if len(rets) > 1:
            mean = sum(rets) / len(rets)
            var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
            out['vol_annual_pct'] = round((var ** 0.5) * (b['annualization'] ** 0.5)
                                          * 100, 1)

    # ── 국면: 추세선 위/아래 × 추세선 방향 ──
    if out['ma_gap_pct'] is not None and out['ma_rising'] is not None:
        out['phase'] = PHASES[(out['ma_gap_pct'] >= 0, out['ma_rising'])]

    return out


def portfolio_regime(items: list) -> dict:
    """종목별 국면 → 포트폴리오 한 장.

    items: [{'ticker','name','weight','regime'}] — weight 는 평가액(KRW).
    **금액 가중**이다. 종목 수로 세면 100만원짜리와 5천만원짜리가 같은 표를 던진다.
    국면을 모르는 종목(이력 부족)은 분모에서 뺀다 — 모르는 것을 '중립'으로 채우면
    없는 사실을 지어내는 것이다. 대신 `unknown_weight_pct` 로 얼마나 못 봤는지 밝힌다.
    """
    total = sum(max(0.0, float(i.get('weight') or 0)) for i in items)
    known = [i for i in items if (i.get('regime') or {}).get('phase')]
    known_w = sum(max(0.0, float(i.get('weight') or 0)) for i in known)

    out = {
        'phases':              {k: 0.0 for k in PHASES.values()},
        'covered_weight_pct':  0.0,
        'unknown_weight_pct':  100.0 if total > 0 else 0.0,
        'ma_gap_pct':          None,    # 금액가중 평균 이격도
        'phase_rule':          PHASE_RULE,
        'basis':               dict(MIDTERM_BASIS),
        'holdings':            len(items),
        'holdings_known':      len(known),
    }
    if total <= 0 or known_w <= 0:
        return out

    for i in known:
        w = max(0.0, float(i.get('weight') or 0))
        out['phases'][i['regime']['phase']] += w / known_w * 100

    out['phases'] = {k: round(v, 1) for k, v in out['phases'].items()}
    out['covered_weight_pct'] = round(known_w / total * 100, 1)
    out['unknown_weight_pct'] = round(100 - known_w / total * 100, 1)

    gaps = [(max(0.0, float(i.get('weight') or 0)), i['regime']['ma_gap_pct'])
            for i in known if i['regime'].get('ma_gap_pct') is not None]
    gw = sum(w for w, _ in gaps)
    if gw > 0:
        out['ma_gap_pct'] = round(sum(w * g for w, g in gaps) / gw, 2)

    return out


# ─── "무엇이 바뀌면 생각을 바꾸나" ────────────────────────────────────
# 오너 결정(2026-10-31): 자비스는 **방향을 단언하지 않고 조건을 말한다**.
# 단언은 틀렸을 때 책임질 방법이 없고, 다온이 지켜온 '판정하지 않고 숫자만'을 깬다.
# 조건은 **틀릴 수 있는 형태**라서 나중에 채점이 된다 — 그게 자비스답기도 하다.
#
# 조건은 반드시 **가격 수치**로 말한다. "회복하면"은 검증할 수 없고
# "200일선 78,400원을 회복하면"은 검증된다.

def change_trigger(regime: dict) -> dict | None:
    """이 종목의 국면이 뒤집히는 조건 — 결정론적.

    국면 규칙이 '200일선 위/아래'이므로, 뒤집히는 지점도 200일선 하나다.
    위에 있으면 이탈이, 아래에 있으면 회복이 조건이 된다.
    """
    if not regime or not regime.get('phase'):
        return None
    ma, gap = regime.get('ma'), regime.get('ma_gap_pct')
    if ma is None or gap is None:
        return None
    above = gap >= 0
    return {
        'direction': 'down' if above else 'up',
        'level':     round(float(ma), 2),      # 그 가격이 경계다
        'gap_pct':   gap,                      # 지금 거기서 몇 % 떨어져 있나
        'verb':      '이탈하면' if above else '회복하면',
        'becomes':   '추세 아래' if above else '추세 위',
    }


# 네 칸을 둘로 묶는다 — 조건을 말할 때는 '선 위냐 아래냐' 한 축만 쓴다.
ABOVE_PHASES = ('상승추세', '반등 시도')
BELOW_PHASES = ('추세 이탈', '하락추세')


def flip_requirement(items: list) -> dict | None:
    """포트폴리오의 우세한 쪽이 뒤집히려면 무엇이 필요한가.

    "보유 59%가 추세 아래" 다음에 와야 할 문장은 "그래서 어떻게 되면 바뀌는가" 다.
    평가액이 큰 종목부터 세어, **과반을 잃게 만드는 최소 묶음**을 돌려준다.
    종목 수가 아니라 금액으로 센다 — 1천만원짜리 셋이 뒤집혀도 9천만원은 그대로다.

    과반이 아니면(=팽팽하면) None. 뒤집을 것이 없는 상태에 조건을 지어내지 않는다.
    """
    known = [i for i in items if (i.get('regime') or {}).get('phase')]
    tot = sum(max(0.0, float(i.get('weight') or 0)) for i in known)
    if tot <= 0:
        return None

    def side_of(i):
        return 'above' if i['regime']['phase'] in ABOVE_PHASES else 'below'

    w = {'above': 0.0, 'below': 0.0}
    for i in known:
        w[side_of(i)] += max(0.0, float(i.get('weight') or 0))

    side = 'above' if w['above'] > w['below'] else 'below'
    side_w = w[side]
    if side_w <= tot / 2:
        return None                      # 과반이 없다 — 뒤집을 '우세'가 없다

    # 큰 것부터 뒤집어 과반을 잃는 순간까지
    members = sorted((i for i in known if side_of(i) == side),
                     key=lambda i: -max(0.0, float(i.get('weight') or 0)))
    moved, need = 0.0, []
    for i in members:
        need.append(i)
        moved += max(0.0, float(i.get('weight') or 0))
        if side_w - moved <= tot / 2:
            break

    return {
        'side':        '추세 위' if side == 'above' else '추세 아래',
        'side_pct':    round(side_w / tot * 100, 1),
        'need_count':  len(need),
        'need':        [{'ticker': i['ticker'], 'name': i.get('name') or i['ticker'],
                         'level': (i['regime'].get('ma') or 0) and
                                  round(float(i['regime']['ma']), 2)}
                        for i in need],
        'direction':   'down' if side == 'above' else 'up',
        'rule':        ('평가액이 큰 종목부터 세어 과반(50%)을 잃게 만드는 최소 묶음. '
                        '종목 수가 아니라 금액 기준이다'),
    }

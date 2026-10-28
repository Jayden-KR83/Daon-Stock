"""보유 종목 대비 AI 분석 공백·노후도 리포트 (운영 DB 읽기전용).

두 곳에서 쓴다:
  1. 사람이 보는 표   : python3 analysis_gap.py
  2. 자동화가 먹는 JSON: python3 analysis_gap.py --json --limit 6

⚠️ 반드시 읽기전용(mode=ro)으로 연다. 운영 daon.db 는 코드로 조작하지 않는다는
   프로젝트 규칙(CLAUDE.md)을 스크립트 수준에서 강제하기 위해서다.
"""
import argparse
import json
import os
import sqlite3
import sys
import time

DB_URI = 'file:/home/ubuntu/portfolio/daon.db?mode=ro'

# ── ETF 판별 ──────────────────────────────────────────────────────
# 2026-10-28: 일일 분석이 다시 0종목으로 실패하고 있었다. 대상 6종목 중 5개가
# ETF 였고, 검증기가 요구하는 company_overview·earnings_ir·backlog·analyst_views 는
# **ETF 에 존재할 수 없는 항목**이다(ETF 는 회사가 아니라 바구니다. 수주잔고도
# 실적 발표도 애널리스트 목표주가도 없다). 그래서 전부 비어서 나오고, 하나라도
# 비면 그 종목이 떨어지므로 결국 통과 0종목이 된다.
#
# 2026-10-17 에 TDF 를 걸렀던 것과 **같은 종류의 고장이 더 큰 범위로** 남아 있었다.
# 그때는 '펀드'라는 이름 키워드만 걸렀고, ETF 는 이름에 'ETF' 가 없는 것이 많다
# (TIGER 미국나스닥100채권혼합50 · ACE 미국배당다우존스).
#
# 판별 정본은 backend/sectors.py 의 ETF 표다. 목록을 여기 다시 적지 않는다 —
# 두 벌이 되면 반드시 어긋난다. 못 읽으면 이름 패턴으로 폴백한다(표에 없는 신규
# ETF 도 있으므로, 폴백은 중복이 아니라 보조 수단이다).
def _load_etf_tickers():
    here = os.path.dirname(os.path.abspath(__file__))
    for d in ('/home/ubuntu/portfolio/backend', os.path.join(here, '..', 'backend')):
        try:
            if d not in sys.path:
                sys.path.insert(0, d)
            from sectors import KR_ETF_SECTOR, US_ETF_SECTOR
            return {t.upper() for t in KR_ETF_SECTOR} | {t.upper() for t in US_ETF_SECTOR}
        except Exception:
            continue
    return set()


ETF_TICKERS = _load_etf_tickers()

# 국내 ETF 브랜드 접두 — 표에 없는 신규 상품 대비. startswith 로만 본다
# ('ACE' 같은 짧은 이름이 일반 단어와 부딪히지 않게).
ETF_BRANDS = ('tiger', 'kodex', 'ace', 'kbstar', 'arirang', 'hanaro', 'sol',
              'plus', 'rise', 'kiwoom', 'timefolio', '1q', 'heroes', 'focus',
              'wooribank', 'mastro', 'bnk', 'daishin')


def is_etf(ticker, name):
    """이 종목이 ETF 인가 — 개별 기업 분석을 적용할 수 없는 대상인가."""
    t = str(ticker or '').strip().upper().lstrip('A')
    if t in ETF_TICKERS or str(ticker or '').strip().upper() in ETF_TICKERS:
        return True
    nm = str(name or '').replace(' ', '').lower()
    if not nm:
        return False
    if 'etf' in nm or 'etn' in nm:
        return True
    return nm.startswith(ETF_BRANDS)


def collect(db_uri=DB_URI):
    c = sqlite3.connect(db_uri, uri=True)
    c.row_factory = sqlite3.Row

    # 분석이 **원리적으로 불가능한** 보유분은 대상에서 뺀다.
    # 2026-10-17: 공모펀드(404610 TDF)가 대상에 섞여 있었다. 거래소에 없으니 웹에
    # 실적·목표주가·애널리스트 의견이 있을 수 없고, 프롬프트는 "출처 없으면 넣지 말라"고
    # 지시하므로 그 종목은 항상 비어서 나온다. 그런데 검증기는 요청한 종목이 전부
    # 채워져야 통과하므로 **한 종목 때문에 나머지 5종목까지 버려졌다.**
    # (실측: 35회 실행 중 주입 성공 2회 = 5.7%)
    SKIP = ('투자신탁', 'tdf', '펀드', 'mmf', '예수금', '현금성자산', '발행어음')

    held = {}
    for r in c.execute('SELECT ticker,name,sector,quantity,avg_price FROM portfolios'):
        t = str(r['ticker']).upper()
        nm = str(r['name'] or '').replace(' ', '').lower()
        if any(k in nm for k in SKIP):
            continue
        # ETF 는 개별 기업 분석의 대상이 아니다(위 '── ETF 판별' 주석 참조).
        # 섞여 들어오면 그 종목만 떨어지는 게 아니라 그날 분석이 통째로 비어 나온다.
        if is_etf(r['ticker'], r['name']):
            continue
        if t not in held:
            held[t] = {'ticker': t, 'name': r['name'] or '', 'sector': r['sector'] or '',
                       'cost': 0.0}
        held[t]['cost'] += (r['quantity'] or 0) * (r['avg_price'] or 0)

    # 캐시 키는 A접두 정규화를 하지 않는다 — 앱의 _get_stock_cache_by_ticker 가
    # 티커를 그대로 접두 매칭하므로, 여기서 정규화하면 실제와 어긋난 리포트가 나온다.
    cached = {}
    for r in c.execute("SELECT cache_key,computed_at FROM ai_cache "
                       "WHERE cache_key LIKE 'stock_v2:%'"):
        tk = r['cache_key'].split(':')[1].upper()
        if tk not in cached or r['computed_at'] > cached[tk]:
            cached[tk] = r['computed_at']

    now = time.time()
    rows = []
    for t, h in held.items():
        ts = cached.get(t, 0)
        h['age_days'] = None if ts == 0 else round((now - ts) / 86400, 1)
        h['cost'] = round(h['cost'])
        rows.append(h)

    # 분석 없는 것 먼저 → 오래된 순
    rows.sort(key=lambda r: (r['age_days'] is not None, r['age_days'] or 0), reverse=True)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', action='store_true', help='자동화용 JSON 출력')
    ap.add_argument('--limit', type=int, default=0, help='상위 N건만 (0=전체)')
    ap.add_argument('--min-age', type=float, default=0.0,
                    help='이 일수보다 오래된 것만 (분석 없음은 항상 포함)')
    ap.add_argument('--db', default=DB_URI)
    args = ap.parse_args()

    rows = collect(args.db)
    if args.min_age > 0:
        rows = [r for r in rows if r['age_days'] is None or r['age_days'] >= args.min_age]
    if args.limit > 0:
        rows = rows[:args.limit]

    if args.json:
        print(json.dumps(rows, ensure_ascii=False))
        return

    missing = sum(1 for r in rows if r['age_days'] is None)
    print('대상 %d종목 (분석 없음 %d)' % (len(rows), missing))
    print('%-9s %-30s %14s %9s' % ('티커', '이름', '원가', '분석경과'))
    for r in rows:
        print('%-9s %-30s %14.0f %9s' % (
            r['ticker'], (r['name'] or '')[:28], r['cost'],
            '없음' if r['age_days'] is None else '%.0f일' % r['age_days']))


if __name__ == '__main__':
    main()

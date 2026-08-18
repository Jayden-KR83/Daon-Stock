"""보유 종목 대비 AI 분석 공백·노후도 리포트 (운영 DB 읽기전용).

두 곳에서 쓴다:
  1. 사람이 보는 표   : python3 analysis_gap.py
  2. 자동화가 먹는 JSON: python3 analysis_gap.py --json --limit 6

⚠️ 반드시 읽기전용(mode=ro)으로 연다. 운영 daon.db 는 코드로 조작하지 않는다는
   프로젝트 규칙(CLAUDE.md)을 스크립트 수준에서 강제하기 위해서다.
"""
import argparse
import json
import sqlite3
import time

DB_URI = 'file:/home/ubuntu/portfolio/daon.db?mode=ro'


def collect(db_uri=DB_URI):
    c = sqlite3.connect(db_uri, uri=True)
    c.row_factory = sqlite3.Row

    held = {}
    for r in c.execute('SELECT ticker,name,sector,quantity,avg_price FROM portfolios'):
        t = str(r['ticker']).upper()
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

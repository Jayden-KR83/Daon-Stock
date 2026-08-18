import sqlite3, time, json

c = sqlite3.connect('file:/home/ubuntu/portfolio/daon.db?mode=ro', uri=True)
c.row_factory = sqlite3.Row
now = time.time()

# 보유: 티커별 원가 기준 규모(시세 없이도 상대 비중 파악 가능)
held = {}
for r in c.execute('SELECT ticker,name,quantity,avg_price,sector FROM portfolios'):
    t = str(r['ticker']).upper()
    cost = (r['quantity'] or 0) * (r['avg_price'] or 0)
    if t in held:
        held[t]['cost'] += cost
    else:
        held[t] = {'name': r['name'], 'cost': cost, 'sector': r['sector']}

# 캐시: 정확히 어떤 키 형태로 들어있는지 (A접두 정규화 안 함 — 앱이 정규화하지 않으므로)
cached = {}
for r in c.execute("SELECT cache_key,computed_at,source FROM ai_cache WHERE cache_key LIKE 'stock_v2:%'"):
    tk = r['cache_key'].split(':')[1].upper()
    if tk not in cached or r['computed_at'] > cached[tk][0]:
        cached[tk] = (r['computed_at'], r['source'])

rows = []
for t, h in held.items():
    ent = cached.get(t)
    age = None if not ent else round((now - ent[0]) / 86400, 1)
    rows.append({'t': t, 'name': h['name'], 'cost': h['cost'],
                 'age': age, 'src': ent[1] if ent else None})

rows.sort(key=lambda r: -r['cost'])
print('보유 티커 %d개 — 원가 규모 순 (KRW 환산 전, USD는 달러값)' % len(rows))
print('%-9s %-30s %14s %8s %s' % ('티커', '이름', '원가', '분석경과', '소스'))
for r in rows:
    print('%-9s %-30s %14.0f %8s %s' % (
        r['t'], (r['name'] or '')[:28], r['cost'],
        '없음' if r['age'] is None else ('%.0f일' % r['age']), r['src'] or '-'))

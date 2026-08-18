import sqlite3, time, json

c = sqlite3.connect('file:/home/ubuntu/portfolio/daon.db?mode=ro', uri=True)
c.row_factory = sqlite3.Row

held = {}
for r in c.execute('SELECT ticker,name,quantity,avg_price,sector,account FROM portfolios'):
    t = str(r['ticker']).upper()
    if t not in held:
        held[t] = dict(r)

cached = {}
for r in c.execute("SELECT cache_key,computed_at FROM ai_cache WHERE cache_key LIKE 'stock_v2:%'"):
    tk = r['cache_key'].split(':')[1].upper()
    cached[tk] = max(cached.get(tk, 0), r['computed_at'])

now = time.time()
norm = lambda t: t[1:] if len(t) == 7 and t[0] == 'A' else t

rows = []
for t, h in held.items():
    ts = max(cached.get(t, 0), cached.get(norm(t), 0))
    age = None if ts == 0 else round((now - ts) / 86400, 1)
    rows.append({'ticker': t, 'name': h['name'], 'sector': h['sector'],
                 'qty': h['quantity'], 'age_days': age})

rows.sort(key=lambda r: (r['age_days'] is not None, r['age_days'] or 0), reverse=True)
missing = [r for r in rows if r['age_days'] is None]
stale = [r for r in rows if r['age_days'] is not None]

print('=== 분석 없음: %d 종목 ===' % len(missing))
for r in missing:
    print('  %-8s %s' % (r['ticker'], r['name']))
print()
print('=== 분석 있음: %d 종목 (오래된 순) ===' % len(stale))
for r in stale[:60]:
    print('  %-8s %-32s %6.1f일' % (r['ticker'], (r['name'] or '')[:30], r['age_days']))

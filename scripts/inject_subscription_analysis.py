"""구독(Claude Code)으로 생성한 종목 분석을 ai_cache 에 주입.

scripts/inject_aicache.py 와 같은 패턴이되 source='claude_code' 로 남긴다
(런북의 비용 버킷 구분 — API 종량제로 만든 것과 구분되어야 나중에 집계가 된다).
같은 티커의 기존 stock_v2 행은 이름 변형으로 갈린 중복을 막기 위해 지우고 1건만 남긴다.
"""
import json, sqlite3, sys, time

DB = '/home/ubuntu/portfolio/daon.db'
REQUIRED = ('recommendation', 'summary')

payload = json.load(open(sys.argv[1], encoding='utf-8'))

# 1) 사전 검증 — 하나라도 어긋나면 아무것도 넣지 않는다
errs = []
for o in payload:
    t = str(o.get('ticker') or '').upper()
    d = o.get('data') or {}
    if not t:
        errs.append('ticker 없음')
        continue
    miss = [k for k in REQUIRED if not d.get(k)]
    if miss:
        errs.append('%s: 필수 누락 %s' % (t, miss))
    if d.get('recommendation') not in ('매수', '보유', '매도'):
        errs.append('%s: recommendation 값 이상 (%r)' % (t, d.get('recommendation')))
    if not d.get('sources'):
        errs.append('%s: 출처 없음 — 근거 없는 분석은 넣지 않는다' % t)
if errs:
    print('검증 실패:')
    for e in errs:
        print('  -', e)
    sys.exit(1)

now = time.time()
conn = sqlite3.connect(DB)
done = []
for o in payload:
    t = str(o['ticker']).upper()
    name = o.get('name', '')
    key = 'stock_v2:%s:%s' % (t, name)
    conn.execute("DELETE FROM ai_cache WHERE cache_key LIKE ?", ('stock_v2:%s:%%' % t,))
    conn.execute(
        "INSERT OR REPLACE INTO ai_cache (cache_key, value_json, computed_at, source) "
        "VALUES (?,?,?,?)",
        (key, json.dumps(o['data'], ensure_ascii=False), now, 'claude_code'))
    done.append(t)
conn.commit()

n = conn.execute("SELECT COUNT(*) FROM ai_cache WHERE source='claude_code'").fetchone()[0]
print('주입 완료: %d 종목 — %s' % (len(done), ', '.join(done)))
print('claude_code 소스 캐시 총계: %d' % n)
conn.close()

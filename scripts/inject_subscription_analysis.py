"""구독(Claude Code)으로 생성한 종목 분석을 ai_cache 에 주입.

scripts/inject_aicache.py 와 같은 패턴이되 source='claude_code' 로 남긴다
(런북의 비용 버킷 구분 — API 종량제로 만든 것과 구분되어야 나중에 집계가 된다).
같은 티커의 기존 stock_v2 행은 이름 변형으로 갈린 중복을 막기 위해 지우고 1건만 남긴다.
"""
import json, re, sqlite3, sys, time

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

SENT_END = re.compile(r'(?<=[.!?])\s+')


def first_sentence(text, limit=160):
    """근거 1문장. backend/main.py 의 _first_sentence 와 같은 규칙(소수점 보존)."""
    t = ' '.join(str(text or '').split())
    if not t:
        return ''
    first = SENT_END.split(t, 1)[0]
    return first if len(first) <= limit else first[:limit - 1] + '…'


def prev_recommendation(conn, ticker):
    """덮어쓰기 **전**의 추천. 캐시는 티커별 최신 1건만 남기므로 지금 읽어둬야 한다."""
    row = conn.execute(
        "SELECT value_json FROM ai_cache WHERE cache_key LIKE ? "
        "ORDER BY computed_at DESC LIMIT 1", ('stock_v2:%s:%%' % ticker,)).fetchone()
    if not row:
        return ''
    try:
        return str((json.loads(row[0]) or {}).get('recommendation') or '')
    except Exception:
        return ''


now = time.time()
conn = sqlite3.connect(DB)
done, signals = [], []
for o in payload:
    t = str(o['ticker']).upper()
    name = o.get('name', '')
    data = o['data']
    key = 'stock_v2:%s:%s' % (t, name)

    prev = prev_recommendation(conn, t)

    conn.execute("DELETE FROM ai_cache WHERE cache_key LIKE ?", ('stock_v2:%s:%%' % t,))
    conn.execute(
        "INSERT OR REPLACE INTO ai_cache (cache_key, value_json, computed_at, source) "
        "VALUES (?,?,?,?)",
        (key, json.dumps(data, ensure_ascii=False), now, 'claude_code'))
    done.append(t)

    # 투자 나침반 신호 — 판단이 뒤집힌 순간만 남긴다.
    # ⚠️ 이 블록이 없으면 무료(구독) 경로로 갱신할 때 배너가 영원히 안 뜬다.
    #    API cron 경로(_record_compass_signal)에만 있던 것을 여기에도 맞춰 넣은 것이며,
    #    두 경로가 같은 규칙을 쓰도록 조건(변경 + 출처 URL 필수)도 동일하게 맞췄다.
    new = str(data.get('recommendation') or '').strip()
    srcs = data.get('sources') or []
    url = ''
    if isinstance(srcs, list) and srcs and isinstance(srcs[0], dict):
        url = str(srcs[0].get('url') or '')
    if new and new != prev.strip() and url:
        conn.execute(
            "INSERT OR REPLACE INTO compass_signals"
            "(ticker,changed_at,name,prev_reco,new_reco,headline,source_url) "
            "VALUES (?,?,?,?,?,?,?)",
            (t, now, name, prev, new, first_sentence(data.get('summary')), url))
        signals.append('%s %s→%s' % (t, prev or '분석없음', new))

conn.commit()

n = conn.execute("SELECT COUNT(*) FROM ai_cache WHERE source='claude_code'").fetchone()[0]
print('주입 완료: %d 종목 — %s' % (len(done), ', '.join(done)))
if signals:
    print('나침반 신호 %d건 — %s' % (len(signals), ', '.join(signals)))
print('claude_code 소스 캐시 총계: %d' % n)
conn.close()

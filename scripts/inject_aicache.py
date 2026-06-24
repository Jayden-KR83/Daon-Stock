#!/usr/bin/env python3
# 발굴 추천 종목 AI 심층 분석(stock_v2)을 daon.db ai_cache에 주입.
# cache_key = stock_v2:{TICKER}:{name}, source='discovery'. 같은 티커 기존행은 정리 후 삽입.
import json, sqlite3, time, sys, os

DB = os.path.expanduser('~/portfolio/daon.db')
payload = json.load(open(sys.argv[1], encoding='utf-8'))
now = time.time()
conn = sqlite3.connect(DB)
ins = upd = 0
for o in payload:
    tkr = str(o['ticker']).upper()
    name = o.get('name', '')
    data = o['data']
    key = f"stock_v2:{tkr}:{name}"
    # 같은 티커의 기존 stock_v2 행 제거(이름 변형으로 갈린 중복 방지) → 최신 1건만 유지
    conn.execute("DELETE FROM ai_cache WHERE cache_key LIKE ?", (f"stock_v2:{tkr}:%",))
    conn.execute(
        "INSERT OR REPLACE INTO ai_cache (cache_key, value_json, computed_at, source) VALUES (?,?,?,?)",
        (key, json.dumps(data, ensure_ascii=False), now, 'discovery'))
    ins += 1
conn.commit()
n = conn.execute("SELECT COUNT(*) FROM ai_cache WHERE source='discovery'").fetchone()[0]
print(f"injected {ins} rows; discovery rows in cache = {n}")
conn.close()

#!/bin/bash
# 다온 일별 자동 자산 추이 캡처 — 매일 KST 17:00 (장 마감 후)
# 모든 approved 사용자에 대해 portfolio + 최신 가격으로 Net Worth + 종목별 P/L 스냅샷 저장
# 사용자가 앱에 접속하지 않아도 누적됨.
set -e
LOG=/home/ubuntu/portfolio_backups/snapshot-cron.log
echo "[$(date +%Y-%m-%d\ %H:%M)] === Daily snapshot started ===" >> "$LOG"

python3 <<'PYEOF' >> "$LOG" 2>&1
import sys, os, sqlite3, requests, json, re
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '/home/ubuntu/portfolio/backend')

DB = '/home/ubuntu/portfolio/daon.db'
API_BASE = 'http://localhost:8501/api'

# KST 오늘 날짜
kst = timezone(timedelta(hours=9))
today = datetime.now(kst).strftime('%Y-%m-%d')

c = sqlite3.connect(DB)
c.row_factory = sqlite3.Row

# 1) 모든 approved 사용자 조회
users = c.execute("SELECT user_id, email FROM users WHERE status='approved'").fetchall()
print(f"  Users to process: {len(users)}")

for u in users:
    uid = u['user_id']
    # 2) 사용자 portfolios
    holdings_rows = c.execute(
        "SELECT account, ticker, name, avg_price, quantity FROM portfolios WHERE user_id=?", (uid,)
    ).fetchall()
    if not holdings_rows:
        print(f"  [{u['email']}] no holdings, skip")
        continue

    # 3) portfolios dict 구성
    portfolios = {}
    tickers = set()
    for r in holdings_rows:
        acc = r['account']
        portfolios.setdefault(acc, []).append({
            'ticker': r['ticker'], 'name': r['name'],
            'avg_price': r['avg_price'], 'quantity': r['quantity'],
        })
        tickers.add(r['ticker'])

    # 4) 가격 batch fetch — local API 사용 (인증 우회를 위해 sqlite로 임시 세션 발행)
    try:
        import secrets, time as _time
        tmp_token = 'CRON_' + secrets.token_hex(16)
        c.execute("INSERT INTO sessions(token, user_id, expires) VALUES(?,?,?)",
                  (tmp_token, uid, _time.time() + 600))
        c.commit()
        headers = {'Authorization': f'Bearer {tmp_token}'}

        # 가격 batch
        r = requests.get(f"{API_BASE}/prices",
                         params={'tickers': ','.join(tickers)},
                         headers=headers, timeout=60)
        prices = r.json() if r.status_code == 200 else {}

        # 환율
        r2 = requests.get(f"{API_BASE}/usdkrw", timeout=10)
        usd_krw = r2.json().get('rate', 1380) if r2.status_code == 200 else 1380

        # NetWorth 캡처
        requests.post(f"{API_BASE}/snapshots/capture",
                      json={'portfolios': portfolios, 'prices': prices, 'usd_krw': usd_krw},
                      headers=headers, timeout=30)

        # 종목별 P/L 캡처
        requests.post(f"{API_BASE}/snapshots/pnl/capture",
                      json={'portfolios': portfolios, 'prices': prices, 'usd_krw': usd_krw},
                      headers=headers, timeout=30)

        # 캐시된 NetWorth 확인
        snap = c.execute(
            "SELECT total_krw FROM net_worth_snapshots WHERE user_id=? AND snapshot_date=?",
            (uid, today)
        ).fetchone()
        total = snap['total_krw'] if snap else 0
        print(f"  [{u['email']}] {len(tickers)}종 → ₩{total:,}")
    except Exception as e:
        print(f"  [{u['email']}] ERROR: {e}")
    finally:
        # 임시 토큰 삭제
        try:
            c.execute("DELETE FROM sessions WHERE token LIKE 'CRON_%'")
            c.commit()
        except: pass

print(f"  Done at {datetime.now(kst).strftime('%H:%M')}")
PYEOF

# 30일 이상 된 로그 정리
find /home/ubuntu/portfolio_backups -name 'snapshot-cron.log' -size +5M -delete 2>/dev/null

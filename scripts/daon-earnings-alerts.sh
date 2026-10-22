#!/bin/bash
# 다온 실적발표 전날 알림 — 매일 KST 08:00 (UTC 23:00)
# 보유·관심 종목 중 '내일' 실적을 발표하는 것이 있으면 알림 + 웹푸시.
# AI 미사용(비용 0). 중복 발송은 earnings_alert_state(user_id,ticker,earn_date)가 막는다.
#
# 상한은 서버 코드에 있다 — EARNINGS_SCAN_MAX_USERS=50 / MAX_TICKERS=200.
# cron 을 늘릴 때 상한부터 확인할 것(사용자가 늘면 그 한 줄이 하루 비용을 정한다).
set -e
LOG=/home/ubuntu/portfolio_backups/earnings-cron.log
DB=/home/ubuntu/portfolio/daon.db
API=http://localhost:8501/api/cron/earnings_alerts
echo "[$(date +%Y-%m-%d\ %H:%M)] === Earnings alert scan started ===" >> "$LOG"

# 서버에 sqlite3 CLI 가 없어 python3 로 조회 (다른 cron 스크립트와 같은 패턴)
SECRET=$(python3 -c "import sqlite3; c=sqlite3.connect('$DB'); r=c.execute(\"SELECT value FROM settings WHERE key='cron_secret'\").fetchone(); print(r[0] if r else '')")
if [ -z "$SECRET" ]; then
  echo "  cron_secret 미설정 — /api/cron/check_alerts 1회 호출로 초기화 필요" >> "$LOG"
  exit 0
fi

# 최대 200종목 × yfinance earnings_dates(동시 16) → 넉넉히 5분
curl -s -m 300 -X POST "$API" \
  -H 'Content-Type: application/json' \
  -d "{\"cron_secret\":\"$SECRET\"}" >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "  Done at $(date +%H:%M)" >> "$LOG"

find /home/ubuntu/portfolio_backups -name 'earnings-cron.log' -size +5M -delete 2>/dev/null || true

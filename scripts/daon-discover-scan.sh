#!/bin/bash
# 다온 신규 종목 발굴 일배치 스캔 — 매일 KST 18:00 (장 마감·스냅샷 후)
# universe(US/KR 섹터 대표주) 전체를 GARP 5축으로 스코어링해 discovery_scores 테이블에 저장.
# 결과는 사용자 무관 공용 캐시 → /api/discover 가 즉시 read (AI 비용 0, 사용자 수와 무관).
set -e
LOG=/home/ubuntu/portfolio_backups/discover-cron.log
DB=/home/ubuntu/portfolio/daon.db
API=http://localhost:8501/api/cron/discover_scan
echo "[$(date +%Y-%m-%d\ %H:%M)] === Discovery scan started ===" >> "$LOG"

# settings 테이블에서 cron_secret 조회 (check_alerts와 동일 키)
# 주의: 서버에 sqlite3 CLI가 없어 python3로 조회 (스냅샷 cron과 동일 패턴)
SECRET=$(python3 -c "import sqlite3; c=sqlite3.connect('$DB'); r=c.execute(\"SELECT value FROM settings WHERE key='cron_secret'\").fetchone(); print(r[0] if r else '')")
if [ -z "$SECRET" ]; then
  echo "  cron_secret 미설정 — /api/cron/check_alerts 1회 호출로 초기화 필요" >> "$LOG"
  exit 0
fi

# ~185종목 yfinance 수집(동시성 4) → 스캔이 길어질 수 있어 타임아웃 넉넉히(15분)
curl -s -m 900 -X POST "$API" \
  -H 'Content-Type: application/json' \
  -d "{\"cron_secret\":\"$SECRET\"}" >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "  Done at $(date +%H:%M)" >> "$LOG"

# 로그 5MB 초과 시 정리
find /home/ubuntu/portfolio_backups -name 'discover-cron.log' -size +5M -delete 2>/dev/null || true

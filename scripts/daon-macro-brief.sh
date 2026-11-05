#!/bin/bash
# 다온 거시 시황 브리핑 — 하루 2회 (2026-11-05)
#
#   KST 07:00 (UTC 22:00)  장 전 — 간밤의 미국 장. **웹 검색 1회 포함**(CPI·기준금리).
#   KST 16:00 (UTC 07:00)  장 후 — 한국 장 마감. 검색 없음(시세만).
#
# 세션 구분은 **서버가 시각으로 판단한다**(_macro_session_key: 15시 경계).
# cron 쪽에서 세션 이름을 넘기지 않는 이유: 두 곳에서 정하면 어긋난다.
# 서머타임으로 UTC-KST 가 틀어져도 서버 시각 하나만 보므로 결과가 갈리지 않는다.
#
# 같은 세션을 두 번 부르면 서버가 'already_exists' 로 건너뛴다 — cron 이 겹쳐
# 실행돼도 **돈이 두 번 나가지 않는다**. 재시도를 겁내지 않아도 된다.
#
# 비용(2026-11-05 기준 단가로 산정, 사용자 1명):
#   장 전  Sonnet 5.5 + 웹 검색 3회   ≈ $0.04/일
#   장 후  Sonnet 5.5 (검색 없음)      ≈ $0.014/일
#   개인 한 줄  Haiku 5.5 × 사용자 수   ≈ $0.0005/일/인
#   합계 월 $1.6 안팎. 사용자가 늘면 마지막 줄만 는다.
set -e
LOG=/home/ubuntu/portfolio_backups/macro-brief.log
DB=/home/ubuntu/portfolio/daon.db
API=http://localhost:8501/api/cron/macro_brief
echo "[$(date +%Y-%m-%d\ %H:%M)] === Macro brief started ===" >> "$LOG"

# 서버에 sqlite3 CLI 가 없어 python3 로 조회 (다른 cron 스크립트와 같은 패턴)
SECRET=$(python3 -c "import sqlite3; c=sqlite3.connect('$DB'); r=c.execute(\"SELECT value FROM settings WHERE key='cron_secret'\").fetchone(); print(r[0] if r else '')")
if [ -z "$SECRET" ]; then
  echo "  cron_secret 미설정 — /api/cron/check_alerts 1회 호출로 초기화 필요" >> "$LOG"
  exit 0
fi

# 시세 19종 병렬(20s) + 웹 검색 3회 포함 모델 호출(180s) + 사용자별 한 줄 → 넉넉히 6분
curl -s -m 360 -X POST "$API" \
  -H 'Content-Type: application/json' \
  -d "{\"cron_secret\":\"$SECRET\"}" >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "  Done at $(date +%H:%M)" >> "$LOG"

find /home/ubuntu/portfolio_backups -name 'macro-brief.log' -size +5M -delete 2>/dev/null || true

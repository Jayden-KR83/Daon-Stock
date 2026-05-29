#!/bin/bash
# 다온 daon.db 자동 백업 — 매일 19:00 UTC (KST 04:00), 30일 보관
set -e
BACKUP_DIR=/home/ubuntu/portfolio_backups
DB=/home/ubuntu/portfolio/daon.db
DATE=$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR"
# DB 백업 (tar.gz)
if [ -f "$DB" ]; then
  tar -czf "$BACKUP_DIR/daon-db-$DATE.tar.gz" -C /home/ubuntu/portfolio daon.db 2>/dev/null
fi
# 30일 이상 된 백업 자동 정리
find "$BACKUP_DIR" -name 'daon-db-*.tar.gz' -mtime +30 -delete 2>/dev/null
# 가장 최근 백업만 로그
LATEST=$(ls -t "$BACKUP_DIR"/daon-db-*.tar.gz 2>/dev/null | head -1)
echo "[$(date +%Y-%m-%d\ %H:%M)] backup ok: $LATEST ($(du -h "$LATEST" | cut -f1))"

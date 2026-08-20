#!/bin/bash
# 다온 daon.db 자동 백업 — 매일 19:00 UTC (KST 04:00), 30일 보관
#
# 2026-08-20: 백업 파일을 공개키로 암호화한다.
#   서버에는 인증서(공개키)만 있고 **복호화 개인키는 오너 PC 에만** 있다
#   (`C:\Users\user\.daon-backup-key\daon-backup-private.pem`).
#   따라서 서버가 통째로 털려도 과거 30일치 스냅샷은 읽히지 않으며,
#   백업을 서버 밖으로 복사해 보관해도 안전하다.
#   복원 절차는 docs/backup-restore.md 참조.
set -euo pipefail

BACKUP_DIR=/home/ubuntu/portfolio_backups
DB=/home/ubuntu/portfolio/daon.db
CERT=/home/ubuntu/portfolio/backup-cert.pem
DATE=$(date +%Y%m%d-%H%M)

umask 077                      # 새로 만드는 파일은 전부 600 (예전 백업은 664 였다)
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB" ]; then
  echo "[$(date +%Y-%m-%d\ %H:%M)] backup FAIL: DB 없음 ($DB)" >&2
  exit 1
fi

# fail-closed — 인증서가 없으면 평문 백업으로 흘러가지 않고 그냥 실패한다.
# (조용히 평문을 만들면 암호화했다고 착각한 채로 몇 달이 지나간다)
if [ ! -f "$CERT" ]; then
  echo "[$(date +%Y-%m-%d\ %H:%M)] backup FAIL: 인증서 없음 ($CERT) — 평문 백업은 만들지 않음" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1) tar.gz 로 묶고
tar -czf "$TMP/daon-db-$DATE.tar.gz" -C /home/ubuntu/portfolio daon.db
# 2) 곧바로 암호화 (평문은 tmpfs 성격의 임시 디렉터리에만 잠깐 존재하고 trap 으로 삭제)
openssl cms -encrypt -aes-256-cbc -binary -outform DER \
  -in  "$TMP/daon-db-$DATE.tar.gz" \
  -out "$BACKUP_DIR/daon-db-$DATE.tar.gz.enc" \
  "$CERT"
chmod 600 "$BACKUP_DIR/daon-db-$DATE.tar.gz.enc"

# 3) 30일 이상 된 백업 정리 — 암호화본과 (혹시 남아 있을) 구 평문본 양쪽 다
find "$BACKUP_DIR" -name 'daon-db-*.tar.gz.enc' -mtime +30 -delete
find "$BACKUP_DIR" -name 'daon-db-*.tar.gz'     -mtime +30 -delete

LATEST="$BACKUP_DIR/daon-db-$DATE.tar.gz.enc"
echo "[$(date +%Y-%m-%d\ %H:%M)] backup ok (encrypted): $LATEST ($(du -h "$LATEST" | cut -f1))"

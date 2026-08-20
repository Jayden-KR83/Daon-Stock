#!/bin/bash
# 암호화된 daon.db 백업 복원 — **오너 PC 의 Git Bash 에서** 실행한다.
# 복호화 개인키가 오너 PC 에만 있으므로 서버에서는 복원할 수 없다(그게 설계 의도다).
#
# 사용법:
#   bash scripts/daon-backup-restore.sh                 # 최신 백업 복원
#   bash scripts/daon-backup-restore.sh 20260819-1900   # 특정 시각 백업 복원
#   bash scripts/daon-backup-restore.sh list            # 서버 백업 목록만 보기
#
# 결과물: ./restored/<날짜>/daon.db  (운영 DB 를 자동으로 덮어쓰지 않는다)
set -euo pipefail

SERVER=ubuntu@168.107.13.20
REMOTE_DIR=/home/ubuntu/portfolio_backups
KEY="C:/Users/user/.daon-backup-key/daon-backup-private.pem"
OUT_ROOT="./restored"

# ⚠️ Git Bash 의 /usr/bin/ssh 는 Windows ssh-agent 를 보지 못한다.
#    SSH 키에 패스프레이즈가 걸려 있으므로 Git Bash ssh 로는 Permission denied (publickey) 가 난다.
#    반드시 Windows OpenSSH 를 직접 호출할 것.
WIN_SSH=/c/Windows/System32/OpenSSH/ssh.exe
WIN_SCP=/c/Windows/System32/OpenSSH/scp.exe
sshx() { "$WIN_SSH" "$@"; }
scpx() { "$WIN_SCP" "$@"; }

ssl() { MSYS_NO_PATHCONV=1 openssl "$@"; }   # Git Bash 가 /CN=... 같은 인자를 경로로 바꾸는 것 방지

if [ ! -f "/c/Users/user/.daon-backup-key/daon-backup-private.pem" ]; then
  echo "개인키가 없다: $KEY" >&2
  echo "이 키가 없으면 백업은 복호화할 수 없다. 오프라인 사본에서 되돌려 놓을 것." >&2
  exit 1
fi

TARGET="${1:-latest}"

if [ "$TARGET" = "list" ]; then
  sshx "$SERVER" "ls -la $REMOTE_DIR/daon-db-*.tar.gz.enc"
  exit 0
fi

if [ "$TARGET" = "latest" ]; then
  NAME=$(sshx "$SERVER" "ls -t $REMOTE_DIR/daon-db-*.tar.gz.enc | head -1 | xargs -n1 basename" | tr -d '\r')
else
  NAME="daon-db-$TARGET.tar.gz.enc"
fi
echo "복원 대상: $NAME"

STAMP=${NAME#daon-db-}; STAMP=${STAMP%.tar.gz.enc}
OUT="$OUT_ROOT/$STAMP"
mkdir -p "$OUT"

echo "[1/4] 내려받기"
scpx "$SERVER:$REMOTE_DIR/$NAME" "$(cygpath -w "$OUT/$NAME")"

echo "[2/4] 복호화"
ssl cms -decrypt -inform DER -binary -in "$OUT/$NAME" -inkey "$KEY" -out "$OUT/backup.tar.gz"

echo "[3/4] 압축 해제"
tar -xzf "$OUT/backup.tar.gz" -C "$OUT"

echo "[4/4] 무결성 확인"
python -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print('  integrity_check:', c.execute('PRAGMA integrity_check').fetchone()[0]); print('  tables:', c.execute('SELECT COUNT(*) FROM sqlite_master').fetchone()[0])" "$OUT/daon.db"

rm -f "$OUT/backup.tar.gz"
echo
echo "완료: $OUT/daon.db"
echo "운영 반영은 수동이다 —  scp \"$OUT/daon.db\" $SERVER:/home/ubuntu/portfolio/daon.db  후 서비스 재시작."

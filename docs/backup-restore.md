# 백업 · 복원 (암호화)

> 2026-08-20 도입. 그 전까지 백업은 **평문 tar.gz, 권한 664** 로 서버에 쌓이고 있었다.

## 1. 한 장 요약

| 무엇 | 어디 |
|---|---|
| 백업 생성 | 서버 cron 매일 19:00 UTC(KST 04:00) → `/home/ubuntu/daon-backup.sh` |
| 백업 위치 | 서버 `~/portfolio_backups/daon-db-<YYYYMMDD-HHMM>.tar.gz.enc` (600, 30일 보관) |
| 암호화 방식 | CMS(PKCS#7) · 콘텐츠 AES-256-CBC · 키 전달 RSA-4096 |
| **공개키(인증서)** | 서버 `~/portfolio/backup-cert.pem` — 암호화만 가능 |
| **개인키** | **오너 PC** `C:\Users\user\.daon-backup-key\daon-backup-private.pem` — 복호화 가능 |
| 복원 | 오너 PC Git Bash → `bash scripts/daon-backup-restore.sh` |

인증서 지문(SHA-256):
`9A:73:B2:C2:52:3C:44:F7:58:5E:19:EA:12:68:3C:CF:56:86:D8:F7:F3:01:E6:65:79:FA:E4:C7:33:DD:CF:1F`

## 2. 왜 비대칭인가

대칭 암호(패스프레이즈 하나)로 하면 **서버가 그 암호를 들고 있어야** 매일 백업을 만들 수 있다.
서버가 털리는 시나리오에서는 백업도 같이 털린다 — `docs/security-review.md` R2 가 지적한
"이득이 제한적" 이 바로 이 얘기다.

공개키 방식은 서버에 **암호화 능력만** 준다. 서버 전체가 장악돼도 과거 30일치 스냅샷은
읽히지 않는다. 대신 복호화는 개인키를 가진 오너 PC 에서만 가능하다.

**이 방식이 실제로 막는 것**과 못 막는 것을 분명히 해 둔다.

- 막는다: 과거 30일치 이력 유출, 백업 파일이 서버 밖(다른 PC·클라우드)에 복사됐을 때의 유출,
  서버 내 다른 계정의 열람(664 → 600 동반 수정).
- **못 막는다**: 서버가 장악된 시점의 **현재** `daon.db`. 이건 평문 600 으로 그대로 있다.
  백업 암호화는 현재 데이터를 지키는 수단이 아니다.

## 3. 복원

```bash
# Git Bash 에서 (PowerShell 아님 — openssl 이 Git Bash 에 있다)
cd /c/Users/user/AgentDev/daon

bash scripts/daon-backup-restore.sh list          # 서버에 남은 백업 목록
bash scripts/daon-backup-restore.sh               # 최신 백업 복원
bash scripts/daon-backup-restore.sh 20260819-1900 # 특정 시각 복원
```

결과는 `restored/<시각>/daon.db` 에 나오고 `PRAGMA integrity_check` 까지 자동으로 돈다.
**운영 DB 를 자동으로 덮어쓰지 않는다.** 반영은 수동:

```bash
scp restored/20260819-1900/daon.db ubuntu@168.107.13.20:/home/ubuntu/portfolio/daon.db
ssh ubuntu@168.107.13.20 'sudo systemctl restart daon'
```

⚠️ 스크립트는 **Windows OpenSSH**(`C:\Windows\System32\OpenSSH\ssh.exe`)를 명시적으로 부른다.
Git Bash 의 `/usr/bin/ssh` 는 Windows ssh-agent 를 못 봐서 `Permission denied (publickey)` 가 난다.

## 4. 개인키 관리 — 가장 중요한 부분

**이 키를 잃으면 백업은 영구히 복호화 불가다.** 암호화의 대가로 생긴 유일한 새 위험이다.

- 현재 위치: `C:\Users\user\.daon-backup-key\daon-backup-private.pem`
- 파일 권한: 상속 제거 + 본인 계정 단독(`user:(F)`) — SSH 키와 동일 기준
- 패스프레이즈: **없음.** 백업 키는 "잊어버리면 백업이 죽는" 물건이라 의도적으로 걸지 않았다.
  파일 자체를 안전하게 보관하는 쪽으로 방어한다.

> ✅ **오너 직접 할 일**: 이 두 파일(`daon-backup-private.pem`, `daon-backup-cert.pem`)을
> **오프라인 사본**으로 하나 더 두기 — 비밀번호 관리자 첨부파일이나 USB.
> PC 가 죽으면 백업 전부가 못 쓰는 파일이 된다.

패스프레이즈를 굳이 걸고 싶다면:
```bash
MSYS_NO_PATHCONV=1 openssl rsa -aes256 \
  -in  C:/Users/user/.daon-backup-key/daon-backup-private.pem \
  -out C:/Users/user/.daon-backup-key/daon-backup-private.enc.pem
```
(이후 복원 시마다 암호 입력. 서버 쪽은 바꿀 게 없다.)

## 5. fail-closed 동작

인증서가 없으면 백업 스크립트는 **평문으로 흘러가지 않고 그냥 실패한다**(exit 1).
조용히 평문을 만들면 암호화됐다고 착각한 채 몇 달이 지나가기 때문이다. 2026-08-20 실측 검증됨.

```
[2026-08-20 14:48] backup FAIL: 인증서 없음 (...) — 평문 백업은 만들지 않음
```

cron 로그는 `~/portfolio_backups/cron.log`.

## 6. 아직 안 한 것

- **백업이 서버 한 대에만 있다.** 서버가 사라지면 백업도 같이 사라진다.
  암호화를 해 두었으므로 이제 `.enc` 파일을 오너 PC 나 클라우드에 그대로 복사해도 안전하다.
  (다음 후보: 일일 분석 갱신 작업 스케줄러에 `scp` 한 줄 얹기)
- `~/portfolio/backup/*.db` 의 배포 전 스냅샷은 평문 600 유지. 롤백 긴급성 때문에 일부러
  암호화하지 않았다 — 어차피 같은 서버의 `daon.db` 도 평문 600 이라 추가로 잃는 게 없다.

## 7. 검증 기록 (2026-08-20)

| 검증 | 결과 |
|---|---|
| 기존 평문 백업 31건 암호화 → 평문 제거 | 완료, 평문 잔존 0 |
| 암호화본 다운로드 → 로컬 복호화 → sha256 대조 | **원본과 바이트 동일** |
| 복원 DB `PRAGMA integrity_check` | `ok` (25 테이블) |
| 인증서 제거 후 실행(fail-closed) | exit 1, 파일 생성 안 됨 |
| 신규 백업 권한 | 600 (기존 664 에서 수정) |

# ============================================================
#  deploy.ps1 — 다온 포트폴리오 Oracle Cloud 배포 스크립트
#  실행: .\scripts\deploy.ps1  (프로젝트 루트에서)
#  또는: VS Code Ctrl+Shift+B → "Deploy to Oracle"
# ============================================================

$KEY     = "C:\Users\user\Downloads\oracle-key.key"
$SERVER  = "ubuntu@168.107.13.20"
$REMOTE  = "~/portfolio"
$APP_DIR = Split-Path -Parent $PSScriptRoot
$BACKEND = Join-Path $APP_DIR "backend"
$STATIC  = Join-Path $BACKEND "static"
$SSH     = "ssh -i `"$KEY`" -o StrictHostKeyChecking=no"
$SCP     = "scp -i `"$KEY`" -o StrictHostKeyChecking=no"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  다온 포트폴리오 — Oracle Cloud 배포 시작" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── 0. React 빌드 확인 ──
if (-not (Test-Path (Join-Path $STATIC "index.html"))) {
    Write-Host "[ ! ] React 빌드 없음. npm run build 실행 중..." -ForegroundColor Yellow
    Push-Location (Join-Path $APP_DIR "frontend")
    npm run build
    Pop-Location
    if (-not (Test-Path (Join-Path $STATIC "index.html"))) {
        Write-Host "  ERROR: 빌드 실패." -ForegroundColor Red; exit 1
    }
}
Write-Host "[ 0/4 ] React 빌드 확인 OK" -ForegroundColor Green

# ── 1. 서버 디렉터리 준비 ──
Write-Host "[ 1/4 ] 서버 디렉터리 준비 중..." -ForegroundColor Yellow
Invoke-Expression "$SSH $SERVER 'mkdir -p ~/portfolio/backend/static/assets'"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: SSH 연결 실패" -ForegroundColor Red; exit 1 }
Write-Host "  OK" -ForegroundColor Green

# ── 2. 백엔드 소스 업로드 ──
Write-Host "[ 2/4 ] 백엔드 파일 업로드 중..." -ForegroundColor Yellow
Invoke-Expression "$SCP `"$BACKEND\main.py`" `"$BACKEND\requirements.txt`" ${SERVER}:${REMOTE}/backend/"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: 백엔드 업로드 실패" -ForegroundColor Red; exit 1 }
Write-Host "  OK — main.py, requirements.txt" -ForegroundColor Green

# ── 3. React 빌드 결과 업로드 ──
Write-Host "[ 3/4 ] React 빌드 파일 업로드 중..." -ForegroundColor Yellow
Invoke-Expression "$SCP `"$STATIC\index.html`" `"$STATIC\presentation.html`" ${SERVER}:${REMOTE}/backend/static/"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: HTML 업로드 실패" -ForegroundColor Red; exit 1 }

# PWA 런타임 — 2026-08-18 사고: 이 블록이 없어서 index.html 만 갱신되고 sw.js 는 서버에
# 남아 있었다. 서비스워커가 **구버전 번들을 프리캐시**한 채로 계속 서빙 → 설치형(PWA)
# 사용자만 옛 화면을 보는, 브라우저 새로고침으로는 안 고쳐지는 유형의 버그.
# workbox-*.js 는 해시가 붙어 파일명이 바뀌므로 와일드카드로 전부 올린다.
Invoke-Expression "$SCP `"$STATIC\sw.js`" `"$STATIC\push-sw.js`" `"$STATIC\manifest.webmanifest`" ${SERVER}:${REMOTE}/backend/static/"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: PWA 런타임 업로드 실패" -ForegroundColor Red; exit 1 }
Invoke-Expression "$SCP `"$STATIC\workbox-*.js`" ${SERVER}:${REMOTE}/backend/static/"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: workbox 업로드 실패" -ForegroundColor Red; exit 1 }
Invoke-Expression "$SCP -r `"$STATIC\assets`" ${SERVER}:${REMOTE}/backend/static/"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: assets 업로드 실패" -ForegroundColor Red; exit 1 }
Write-Host "  OK — index.html, presentation.html, assets/, sw.js, workbox, manifest" -ForegroundColor Green

# ── 4. 서버 설정 & 재시작 ──
Write-Host "[ 4/4 ] 서버 서비스 구성 및 재시작 중..." -ForegroundColor Yellow

$REMOTE_CMD = @'
set -e
cd ~/portfolio/backend

# Python 패키지 설치
pip3 install -r requirements.txt -q 2>/dev/null || pip install -r requirements.txt -q

# systemd 서비스 파일 업데이트 (FastAPI, PORT=8501)
sudo tee /etc/systemd/system/portfolio.service > /dev/null << 'EOF'
[Unit]
Description=다온 포트폴리오 FastAPI
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/portfolio/backend
Environment=PORT=8501
ExecStart=/usr/bin/python3 /home/ubuntu/portfolio/backend/main.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable portfolio
sudo systemctl restart portfolio
sleep 3
sudo systemctl is-active portfolio
'@

# 원격 bash 에 보내기 전 CR 제거 — 2026-08-18 사고:
# 이 파일이 CRLF 로 저장되자 here-string 내용에 \r 이 섞여 원격에서
#   bash: $'\r': command not found / Invalid unit name "portfolio\r"
# 가 나고 **systemctl restart 가 실패**했다. 파일은 업로드됐는데 서비스는 구버전으로
# 계속 돌아, 배포가 끝난 것처럼 보이는 게 최악이었다. 줄바꿈에 의존하지 않게 만든다.
$REMOTE_CMD = $REMOTE_CMD -replace "`r", ""
Invoke-Expression "$SSH $SERVER '$REMOTE_CMD'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: 서비스 시작 실패" -ForegroundColor Red
    Write-Host "  로그: ssh -i $KEY $SERVER 'journalctl -u portfolio -n 30'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  배포 완료!" -ForegroundColor Green
Write-Host "  메인 앱:   http://168.107.13.20:8501" -ForegroundColor Cyan
Write-Host "  발표 자료: http://168.107.13.20:8501/presentation.html" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

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
# 2026-10-11 사고 직전에 막은 것: 이 줄이 `main.py` 만 올리고 있었다.
# main.py 가 sectors.py 를 import 하게 된 순간, 배포하면 서버에서 ImportError 가 나고
# systemd 가 재시작을 반복하며 **앱 전체가 죽는다**. 파일을 하나 추가했다는 이유로.
# 그래서 목록을 손으로 적지 않는다 — backend 의 .py 를 전부 올린다.
Write-Host "[ 2/4 ] 백엔드 파일 업로드 중..." -ForegroundColor Yellow
$pyFiles = Get-ChildItem -Path $BACKEND -Filter *.py -File | Sort-Object Name
if ($pyFiles.Count -eq 0) { Write-Host "  ERROR: backend 에 .py 가 없음" -ForegroundColor Red; exit 1 }
$pyArgs = ($pyFiles | ForEach-Object { "`"$($_.FullName)`"" }) -join ' '
Invoke-Expression "$SCP $pyArgs `"$BACKEND\requirements.txt`" ${SERVER}:${REMOTE}/backend/"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: 백엔드 업로드 실패" -ForegroundColor Red; exit 1 }
Write-Host ("  OK — " + (($pyFiles | ForEach-Object { $_.Name }) -join ', ') + ", requirements.txt") -ForegroundColor Green

# ── 3. React 빌드 결과 업로드 ──
Write-Host "[ 3/4 ] React 빌드 파일 업로드 중..." -ForegroundColor Yellow
# 2026-10-11: 여기도 **손으로 적은 목록**이었다. index.html·presentation.html·sw.js·
# push-sw.js·manifest·workbox·assets 만 올렸고 `apple-touch-icon.png` 는 빠져 있었다.
# 그 결과 서비스워커 프리캐시가 404 를 만나 **설치가 매번 실패**했고, 활성 워커가 없어
# 푸시 구독이 불가능했다(사람 눈엔 앱이 멀쩡해서 몇 주를 못 찾았다).
# backend/*.py 때와 같은 병이다 — 목록을 손으로 적으면 언젠가 하나가 빠진다.
# static 폴더를 통째로 올린다. 새 파일이 생겨도 배포 스크립트는 건드릴 일이 없다.
#
# (2026-08-18 사고 기록: sw.js 를 안 올려 구버전 번들을 프리캐시한 채 서빙한 적이 있다.
#  통째 업로드는 그 사고도 같이 막는다.)
Invoke-Expression "$SCP -r `"$STATIC\*`" ${SERVER}:${REMOTE}/backend/static/"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: static 업로드 실패" -ForegroundColor Red; exit 1 }
Write-Host ("  OK — static 전체 " +
  ((Get-ChildItem -Path $STATIC -Recurse -File).Count) + "개 파일") -ForegroundColor Green
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

# ── 5. 배포 후 스모크 ─────────────────────────────────────────────
# `systemctl is-active` 는 프로세스가 떠 있다는 뜻일 뿐 앱이 동작한다는 뜻이 아니다.
# 2026-10-11: 로컬에서 고치고 "고쳤다"고 보고했는데 서버는 구버전이었다.
# 이제 배포 스크립트가 **서버에 직접 물어보고**, 아니면 실패로 끝낸다.
Write-Host "[ 5/5 ] 배포 후 확인 중..." -ForegroundColor Yellow
# 사용자가 실제로 쓰는 주소로 확인한다. 8501 은 외부에서 닫혀 있어(리버스 프록시 뒤)
# 그 주소로 때리면 스모크가 늘 실패한다 — 늘 실패하는 검사는 없는 것만 못하다.
$BASE  = "https://daonwealth.com"
$fail  = $false
# 재시도를 두는 이유: 첫 배포에서 502 가 났는데 앱은 멀쩡했다.
# systemd 가 restart 한 뒤 uvicorn 이 준비되기까지 약 6초가 걸리는데 sleep 3 뒤에 때렸다.
# 멀쩡한 배포를 실패로 보고하면 다음 사람이 스모크를 지운다 — 기다릴 줄 알아야 한다.
foreach ($probe in @(
    @{ path = "/";             what = "앱 첫 화면" },
    @{ path = "/api/sectors";  what = "섹터 정본(sectors.py 가 올라갔는지)" }
)) {
    $ok = $false; $last = ""
    foreach ($try in 1..6) {
        try {
            $r = Invoke-WebRequest -Uri ($BASE + $probe.path) -UseBasicParsing -TimeoutSec 20
            if ($r.StatusCode -eq 200) { $ok = $true; break }
            $last = "HTTP $($r.StatusCode)"
        } catch {
            $last = $_.Exception.Message
        }
        Start-Sleep -Seconds 5
    }
    if ($ok) { Write-Host "  OK  $($probe.what)" -ForegroundColor Green }
    else { Write-Host "  FAIL  $($probe.what) — $last" -ForegroundColor Red; $fail = $true }
}
# 서비스워커 프리캐시 전수 검사 — 2026-10-11 사고의 재발 방지.
# 워크박스는 install 중 프리캐시 URL 을 **전부** 받는다. 하나라도 200이 아니면
# 설치가 실패하고 워커가 redundant 가 된다 -> 활성 워커가 없어 푸시 구독 불가.
# 앱 화면은 멀쩡해 보이므로 사람 눈으로는 절대 못 잡는다. 기계가 세야 한다.
#
# 주의: 이 블록은 파서에 민감하다. 메서드 호출 뒤 파이프라인(| ForEach-Object)과
# 문자열 안 $(...) 보간을 쓰다가 스크립트 전체가 파싱 실패했다. 단순하게 유지할 것.
if (-not $fail) {
    $swTxt = ''
    try { $swTxt = (Invoke-WebRequest -Uri ($BASE + '/sw.js') -UseBasicParsing -TimeoutSec 20).Content } catch { }
    $urls = @()
    foreach ($m in [regex]::Matches($swTxt, '\{url:.(.*?).,revision:')) { $urls += $m.Groups[1].Value }
    if ($urls.Count -eq 0) {
        Write-Host '  경고: sw.js 에서 프리캐시 목록을 읽지 못했다' -ForegroundColor Yellow
    } else {
        $bad = @()
        foreach ($u in $urls) {
            $probe = $BASE + '/' + $u.TrimStart('/')
            $ok = $false
            try { if ((Invoke-WebRequest -Uri $probe -UseBasicParsing -TimeoutSec 20).StatusCode -eq 200) { $ok = $true } } catch { }
            if (-not $ok) { $bad += $u }
        }
        if ($bad.Count -gt 0) {
            Write-Host ('  FAIL  서비스워커 프리캐시 ' + $bad.Count + '건 실패 - PWA 설치가 죽는다') -ForegroundColor Red
            foreach ($b in $bad) { Write-Host ('          ' + $b) -ForegroundColor Red }
            $fail = $true
        } else {
            Write-Host ('  OK  서비스워커 프리캐시 ' + $urls.Count + '건 전부 200') -ForegroundColor Green
        }
    }
}


# 실제 렌더 검사 — 2026-10-12 사고의 재발 방지.
# 그날 스모크는 / 200, /api/sectors 200, 프리캐시 36건 200 을 전부 통과했는데
# **홈 화면 앱은 열리지 않았다.** 파일이 서빙되는 것과 앱이 동작하는 것은 다르다.
# 진짜 브라우저로 로그인 전·후 + 모든 탭 + 서비스워커 활성까지 확인한다.
if (-not $fail) {
    Push-Location (Join-Path $APP_DIR 'frontend')
    try {
        $out = & node scripts\smoke-render.mjs $BASE 2>&1
        $out | ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  FAIL  앱이 실제로 뜨지 않는다 — 배포 실패 처리" -ForegroundColor Red
            $fail = $true
        }
    } catch {
        # 브라우저가 없는 PC 에서도 배포는 되게 — 다만 '검사 안 했음'을 분명히 알린다
        Write-Host "  경고: 렌더 검사를 건너뛴다(playwright 미설치?) - $($_.Exception.Message)" -ForegroundColor Yellow
    } finally { Pop-Location }
}

if ($fail) {
    Write-Host ""
    Write-Host "  배포가 끝났지만 앱이 응답하지 않는다. 구버전으로 돌고 있을 수 있다." -ForegroundColor Red
    Write-Host "  로그: ssh -i $KEY $SERVER 'journalctl -u portfolio -n 50'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  배포 완료!" -ForegroundColor Green
# 8501 은 127.0.0.1 바인딩이라 외부에서 안 닿는다(위 124행에서 이미 그렇게 적어 두고도
# 여기서는 그 주소를 안내하고 있었다). 사람이 복사해 여는 주소는 공개 주소여야 한다.
Write-Host "  메인 앱:   $BASE" -ForegroundColor Cyan
Write-Host "  발표 자료: $BASE/presentation.html" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

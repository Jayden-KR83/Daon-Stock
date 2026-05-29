# ============================================================
#  dev.ps1 — 로컬 개발 서버 실행
#  실행: .\scripts\dev.ps1  (프로젝트 루트에서)
#  또는: VS Code Ctrl+Shift+B → "Run Local Dev Server"
# ============================================================

$APP_DIR = Split-Path -Parent $PSScriptRoot
Set-Location $APP_DIR

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  로컬 개발 서버 시작" -ForegroundColor Cyan
Write-Host "  http://localhost:8502" -ForegroundColor Green
Write-Host "  종료: Ctrl+C" -ForegroundColor Gray
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

streamlit run portfolio.py `
    --server.port 8502 `
    --browser.serverAddress localhost `
    --server.headless false

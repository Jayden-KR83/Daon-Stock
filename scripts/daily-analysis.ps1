# ============================================================
#  daily-analysis.ps1 — 보유 종목 AI 분석 일일 갱신 (구독 사용, API 비용 0)
#
#  실행: .\scripts\daily-analysis.ps1 [-Count 6] [-MinAge 14]
#  자동: Windows 작업 스케줄러에 등록 (아래 §등록 방법)
#
#  왜 이 구조인가
#  --------------
#  기계적인 일(어느 종목이 낡았는지 조회 → 결과 검증 → 주입)은 전부 이 스크립트가
#  결정론적으로 처리하고, 판단이 필요한 '조사와 작성'만 claude -p 에 맡긴다.
#  LLM 을 결정론적 작업에까지 쓰면 느리고 비싸고 재현이 안 된다.
#
#  왜 서버 cron 이 아니라 PC 작업 스케줄러인가
#  -----------------------------------------
#  구독(Claude Code)은 이 PC 의 클라이언트에 딸린 것이라 서버가 빌려 쓸 수 없다.
#  서버에서 돌리려면 API 키가 필요하고 그건 종량제(월 $79 수준)다.
#  '무료 + 자동'의 유일한 조합이 이 방식이며, 대가는 PC 가 켜져 있어야 한다는 것.
#  ⚠️ 이 파일은 **UTF-8 with BOM** 으로 저장해야 한다. Windows PowerShell 5.1 은
#     BOM 이 없으면 ANSI(cp949)로 읽어 한글 문자열이 전부 깨진다(2026-08-18 확인).
# ============================================================
param(
    [int]$Count  = 6,     # 1회 갱신할 종목 수. 조사 품질을 위해 6 이하 권장
    [double]$MinAge = 14, # 이 일수보다 오래된 것만 대상 (분석 없음은 항상 포함)
    [switch]$DryRun       # 생성까지만 하고 주입은 건너뜀
)

$ErrorActionPreference = 'Stop'
$APP_DIR = Split-Path -Parent $PSScriptRoot
$KEY     = "C:\Users\user\Downloads\oracle-key.key"
$SERVER  = "ubuntu@168.107.13.20"
$SSH     = @('-i', $KEY, '-o', 'StrictHostKeyChecking=no')
$WORK    = Join-Path $env:TEMP "daon-daily-analysis"
$LOG     = Join-Path $APP_DIR "scripts\daily-analysis.log"

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    Add-Content -Path $LOG -Value $line -Encoding utf8
}

New-Item -ItemType Directory -Force -Path $WORK | Out-Null
Log "=== 일일 분석 갱신 시작 (Count=$Count, MinAge=$MinAge) ==="

# ── 1. 갱신 대상 조회 (서버 DB 읽기전용) ─────────────────────────
scp @SSH "$APP_DIR\scripts\analysis_gap.py" "${SERVER}:/tmp/analysis_gap.py" | Out-Null
$targetsJson = ssh @SSH $SERVER "python3 /tmp/analysis_gap.py --json --limit $Count --min-age $MinAge"
if (-not $targetsJson) { Log "대상 조회 실패"; exit 1 }

$targets = $targetsJson | ConvertFrom-Json
if ($targets.Count -eq 0) {
    Log "갱신할 종목 없음 — 전부 최신입니다. 종료."
    exit 0
}
$list = ($targets | ForEach-Object { "- $($_.ticker) : $($_.name)" }) -join "`n"
Log "대상 $($targets.Count)종목`n$list"

# ── 2. 프롬프트 조립 ──────────────────────────────────────────────
# 스키마는 backend/main.py 의 _build_stock_analysis_prompt 와 같은 형태를 요구한다.
# 여기서 다시 적는 이유는 claude -p 가 서버 코드를 읽지 않기 때문이며,
# 스키마가 바뀌면 이 파일도 같이 고쳐야 한다(주의).
$outFile = Join-Path $WORK "payload.json"
if (Test-Path $outFile) { Remove-Item $outFile }

$promptTemplate = Get-Content (Join-Path $PSScriptRoot "daily-analysis-prompt.md") -Raw -Encoding utf8
$prompt = $promptTemplate -replace '\{\{TARGETS\}\}', $list -replace '\{\{OUTFILE\}\}', ($outFile -replace '\\','/')

# ── 3~4. 생성 + 검증 (실패 시 1회 재시도) ─────────────────────────
# --tools 로 Bash 를 빼서 파일 쓰기와 웹 조사만 가능하게 제한한다.
# 무인 실행이므로 권한 프롬프트가 뜨면 그대로 멈춘다 → acceptEdits 로 파일 쓰기 허용.
#
# 재시도를 두는 이유: 2026-08-20 실행에서 생성 결과가 필드명을 camelCase 로 바꾸고
# (analystViews) 절반을 누락해 검증에 걸렸다. 검증기가 막아 데이터는 안전했지만
# 그날 갱신이 통째로 버려졌다. 무인 작업에서는 한 번의 흔들림으로 하루를 날리지 않게
# 재시도가 필요하다. 단 2회까지만 — 계속 실패하면 프롬프트나 스키마 문제이므로
# 조용히 반복하기보다 로그를 남기고 멈추는 편이 낫다.
$maxTry = 2
$ok = $false
for ($try = 1; $try -le $maxTry; $try++) {
    if (Test-Path $outFile) { Remove-Item $outFile }
    Log "분석 생성 중... (시도 $try/$maxTry · 종목당 1~2분 소요)"

    $p = $prompt
    if ($try -gt 1) {
        $p = $prompt + "`n`n[재시도] 직전 시도는 필수 키를 빠뜨리거나 이름을 camelCase 로 바꿔 거부됐습니다. 13개 키 이름을 snake_case 그대로 전부 넣었는지 저장 후 Read 로 반드시 확인하세요."
    }
    $claudeArgs = @(
        '-p', $p,
        '--tools', 'WebSearch,WebFetch,Write,Read',
        '--permission-mode', 'acceptEdits',
        '--add-dir', $WORK,
        '--model', 'sonnet'
    )
    & claude @claudeArgs 2>&1 | Out-Null

    if (-not (Test-Path $outFile)) { Log "  payload.json 이 생성되지 않음"; continue }

    # 검증기는 UTF-8 파일로 분리해 둔다 — here-string 에 한글을 심으면 리터럴이 깨져
    # 정상 payload 를 불합격 처리한다(2026-08-18 실제 발생).
    $vr = & python (Join-Path $PSScriptRoot "validate_analysis_payload.py") $outFile 2>&1
    Log ($vr -join "`n")
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    Log "  검증 실패 (시도 $try/$maxTry)"
}
if (-not $ok) { Log "검증 실패 — 주입하지 않고 종료"; exit 1 }

if ($DryRun) { Log "DryRun — 주입 생략. 결과: $outFile"; exit 0 }

# ── 5. 주입 ───────────────────────────────────────────────────────
scp @SSH "$APP_DIR\scripts\inject_subscription_analysis.py" "${SERVER}:/tmp/inject.py" | Out-Null
scp @SSH $outFile "${SERVER}:/tmp/payload.json" | Out-Null
$injectOut = ssh @SSH $SERVER "cp ~/portfolio/daon.db ~/portfolio/backup/daon-preinject-`$(date +%Y%m%d).db && python3 /tmp/inject.py /tmp/payload.json"
Log ($injectOut -join "`n")
Log "=== 완료 ==="

# ============================================================
#  § 작업 스케줄러 등록 (관리자 PowerShell 에서 1회)
#
#  $act = New-ScheduledTaskAction -Execute "powershell.exe" `
#      -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\user\AgentDev\daon\scripts\daily-analysis.ps1"'
#  $trg = New-ScheduledTaskTrigger -Daily -At 6:00AM
#  $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries `
#             -AllowStartIfOnBatteries -MultipleInstances IgnoreNew `
#             -ExecutionTimeLimit (New-TimeSpan -Hours 2)
#  Register-ScheduledTask -TaskName "다온 일일 분석 갱신" -Action $act -Trigger $trg -Settings $set
#
#  ⚠️ -AllowStartIfOnBatteries 가 **반드시** 필요하다. 이걸 빼면 기본값이
#     DisallowStartIfOnBatteries=True 라 노트북이 배터리 상태면 아예 시작하지 않는다.
#     2026-08-20 확인: 이 옵션 없이 등록한 작업이 6시 창을 두 번 넘기고도 한 번도
#     실행되지 않았다(LastRunTime 없음). -DontStopIfGoingOnBatteries 만으로는 부족하다.
#  -StartWhenAvailable: PC 가 꺼져 있어 놓친 실행을 켜진 뒤 따라잡는다.
#  로그: scripts\daily-analysis.log
# ============================================================

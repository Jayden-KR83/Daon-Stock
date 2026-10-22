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

# 2026-10-10: 작업스케줄러 실행이 "잘못된 개체가 전달되었습니다. ':' 또는 '}'가 필요합니다"
# 로 죽었다. 원인은 분석이나 인증이 아니라 **콘솔 코드페이지**다.
#   스케줄러는 시스템 ANSI(한글 Windows = CP949)로 뜨고, PowerShell 은 네이티브 명령
#   (ssh)의 stdout 바이트를 그 코드페이지로 디코딩한다. 서버는 UTF-8 JSON 을 주므로
#   한글이 깨지고, 'LG에너지솔루션' 처럼 특정 바이트열은 **닫는 따옴표까지 먹어** JSON 을
#   깨뜨린다 → ConvertFrom-Json 폭사. 대화형 셸은 CP65001 이라 멀쩡해서 재현이 안 됐다.
#   이 종목이 10-08 임포트로 분석 대상에 들어오면서 드러났다.
# 네이티브 출력을 UTF-8 로 못 박는다. 터미널 출력이 아니라 **파싱 정확성** 문제다.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8

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

# 2026-10-08: 9/2~10/8 실행 대부분이 "시작" 한 줄만 남기고 죽어 있었다. 마지막 주입 성공은
# 8/20 — 7주간 분석이 멈춰 있었는데 로그만 봐서는 이유를 알 수 없었다.
# 원인 두 겹:
#  ① 작업이 06:00 이 아니라 PC 가 깨어난 시각(22:10·23:29·16:01)에 밀려 실행된다
#     (-StartWhenAvailable). 그때는 네트워크가 아직 안 올라와 ssh/scp 가 실패한다.
#  ② $ErrorActionPreference='Stop' + PowerShell 5.1 에서는 네이티브 명령의 stderr 가
#     종료 오류로 바뀌어, Log 한 줄 남기지 못하고 스크립트가 끝난다.
# → 네이티브 호출은 전부 이 함수를 통과시킨다. 실패하면 이유를 남기고 기다렸다 다시 한다.
function Invoke-Native([string]$What, [scriptblock]$Block, [int]$Tries = 3, [int]$WaitSec = 60) {
    for ($i = 1; $i -le $Tries; $i++) {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'    # stderr 한 줄에 스크립트가 죽지 않게
        $global:LASTEXITCODE = 0
        try {
            $out = & $Block
            $code = $LASTEXITCODE
        } catch {
            $out = $null; $code = -1
            Log "  $What 예외: $($_.Exception.Message)"
        } finally {
            $ErrorActionPreference = $prev
        }
        if ($code -eq 0) { return $out }
        Log "  $What 실패(exit=$code) — 시도 $i/$Tries"
        if ($i -lt $Tries) { Start-Sleep -Seconds $WaitSec }
    }
    return $null
}

# 네트워크가 올라올 때까지 기다린다 — 깨어난 직후 실행되는 경우 때문이다.
# ⚠ ICMP(ping)로 재지 말 것. 서버가 핑을 막아 두어 늘 False 가 나오고, 멀쩡한 서버를
#   영원히 기다린다(2026-10-08 실제로 밟았다). **실제로 쓰는 포트(ssh 22)** 로 확인한다.
function Wait-Server([int]$Tries = 10, [int]$WaitSec = 30) {
    for ($i = 1; $i -le $Tries; $i++) {
        try {
            $c = New-Object System.Net.Sockets.TcpClient
            $ok = $c.ConnectAsync('168.107.13.20', 22).Wait(5000)
            $c.Close()
            if ($ok) { return $true }
        } catch { }
        Log "서버 22번 포트에 닿지 않음 — 네트워크 대기 $i/$Tries"
        Start-Sleep -Seconds $WaitSec
    }
    return $false
}

# 어떤 경로로 끝나든 마지막 줄을 남긴다. 침묵은 '안 돌았다'와 '돌다 죽었다'를 구분 못 한다.
trap {
    Log "예기치 못한 오류로 종료: $($_.Exception.Message)"
    exit 1
}

New-Item -ItemType Directory -Force -Path $WORK | Out-Null
Log "=== 일일 분석 갱신 시작 (Count=$Count, MinAge=$MinAge) ==="

# ── 1. 갱신 대상 조회 (서버 DB 읽기전용) ─────────────────────────
if (-not (Wait-Server)) { Log "서버에 끝내 닿지 못함 — 종료(다음 회차에 재시도)"; exit 1 }
$null = Invoke-Native "검사기 전송(scp)" { scp @SSH "$APP_DIR\scripts\analysis_gap.py" "${SERVER}:/tmp/analysis_gap.py" }
$targetsJson = Invoke-Native "대상 조회(ssh)" { ssh @SSH $SERVER "python3 /tmp/analysis_gap.py --json --limit $Count --min-age $MinAge" }
if (-not $targetsJson) { Log "대상 조회 실패 — 종료"; exit 1 }

# 파싱 실패를 try 로 감싸는 이유: 위 인코딩 고정이 뚫리거나 서버 출력 형식이 바뀌면
# ConvertFrom-Json 이 $ErrorActionPreference='Stop' 때문에 스크립트를 통째로 죽인다.
# 그러면 "예기치 못한 오류" 한 줄만 남아 무엇이 왔는지 알 수 없다 — 받은 문자열을 남긴다.
try {
    $targets = $targetsJson | ConvertFrom-Json
} catch {
    Log "대상 JSON 파싱 실패 — 종료. 받은 문자열 앞 300자:"
    Log ("  " + ($targetsJson -join ' ').Substring(0, [Math]::Min(300, ($targetsJson -join ' ').Length)))
    Log "  한글이 깨져 보이면 콘솔 코드페이지 문제다(이 스크립트 상단 OutputEncoding 참고)."
    exit 1
}
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
    # claude 의 출력은 파일로 받는다. 예전엔 `2>&1 | Out-Null` 이라 실패 이유가 사라졌다 —
    # 인증 만료("OAuth session expired")처럼 사람이 조치해야 하는 오류도 로그에 안 남았다.
    $claudeLog = Join-Path $WORK "claude-last.log"
    $null = Invoke-Native "분석 생성(claude)" { & claude @claudeArgs *> $claudeLog } -Tries 1

    if (-not (Test-Path $outFile)) {
        Log "  payload.json 이 생성되지 않음"
        if (Test-Path $claudeLog) {
            $tail = (Get-Content $claudeLog -Tail 5) -join ' / '
            Log "  claude 출력 끝부분: $tail"
            if ($tail -match 'OAuth|authenticate|login|credit') {
                Log "  ⚠ 인증·크레딧 문제로 보인다 — 이 PC 에서 `claude /login` 또는 잔액 확인이 필요하다."
            }
        }
        continue
    }

    # 검증기는 UTF-8 파일로 분리해 둔다 — here-string 에 한글을 심으면 리터럴이 깨져
    # 정상 payload 를 불합격 처리한다(2026-08-18 실제 발생).
    # --prune: 통과한 종목만 남기고 나머지는 이름을 불러 제외한다.
    # 2026-10-17 이전에는 하나라도 어긋나면 전체를 버렸다. 공모펀드처럼 웹에 자료가
    # 없는 종목이 섞이면 멀쩡한 5종목까지 함께 버려져, 35회 실행 중 2회만 주입됐다.
    $vr = & python (Join-Path $PSScriptRoot "validate_analysis_payload.py") $outFile --prune 2>&1
    Log ($vr -join "`n")
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    Log "  검증 실패 (시도 $try/$maxTry)"
}
if (-not $ok) { Log "검증 실패 — 주입하지 않고 종료"; exit 1 }

if ($DryRun) { Log "DryRun — 주입 생략. 결과: $outFile"; exit 0 }

# ── 5. 주입 ───────────────────────────────────────────────────────
$null = Invoke-Native "주입기 전송(scp)" { scp @SSH "$APP_DIR\scripts\inject_subscription_analysis.py" "${SERVER}:/tmp/inject.py" }
$null = Invoke-Native "payload 전송(scp)" { scp @SSH $outFile "${SERVER}:/tmp/payload.json" }
$injectOut = Invoke-Native "주입(ssh)" { ssh @SSH $SERVER "cp ~/portfolio/daon.db ~/portfolio/backup/daon-preinject-`$(date +%Y%m%d).db && python3 /tmp/inject.py /tmp/payload.json" }
if (-not $injectOut) { Log "주입 실패 — 서버에 반영되지 않았다"; exit 1 }
Log ($injectOut -join "`n")

# ── 6. 신선도 점검 ────────────────────────────────────────────────
# 2026-10-18 'A안' 이후 **이 작업이 종목분석의 유일한 경로**다.
# 서버 주간 cron(daon-weekly-refresh.sh)을 껐으므로, 여기가 멈추면
# 분석이 통째로 늙는데 아무도 모른다. 그래서 돌 때마다 가장 오래된 분석을 보고한다.
# (조용히 멈추는 것이 가장 나쁘다 — 집현전 정지 감지에서 이미 겪은 유형이다)
$stale = Invoke-Native "신선도 점검(ssh)" {
    ssh @SSH $SERVER "cd ~/portfolio && python3 /tmp/analysis_gap.py --json --limit 3 --min-age 0"
} -Tries 1
if ($stale) {
    try {
        $worst = ($stale | ConvertFrom-Json)[0]
        if ($worst.age_days -eq $null) {
            Log "⚠ 신선도: 분석이 한 번도 없는 종목이 있다 ($($worst.ticker))"
        } elseif ($worst.age_days -gt 21) {
            Log "⚠ 신선도: 가장 오래된 분석이 $($worst.age_days)일 — 이 작업이 며칠 멈춘 것으로 보인다"
        } else {
            Log "신선도 OK — 가장 오래된 분석 $($worst.age_days)일 ($($worst.ticker))"
        }
    } catch { Log "신선도 점검 결과를 읽지 못했다" }
}

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

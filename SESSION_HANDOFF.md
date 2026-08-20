# 세션 핸드오프 노트

> **새 CLI 세션은 이 파일부터 읽는다.** 아래 "복구 순서"가 세션 연속성의 정본.

> **📍 2026-08-20 현재 상태는 바로 아래 "현재 운영 구조" 한 블록만 읽으면 된다.**
> 그 아래 세션 블록들(5차·4차…)은 이력이며 다시 읽을 필요 없다.

## 🔁 복구 순서 (CLI가 닫혔거나 새로 열었을 때)

1. `git status` · `git log --oneline -5` · `git rev-list --left-right --count origin/main...HEAD`
   → **미푸시 커밋 수**가 곧 "지난 세션이 어디까지 갔나". 작업트리가 dirty면 그게 중단 지점.
2. 이 파일의 **최신 세션 블록**(맨 위) 읽기 → 무엇을 했고 다음 후보가 뭔지.
3. [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) 최신 세션 항목 → 왜 그렇게 했는지(설계 근거·트레이드오프).
4. 배포 상태 확인: `backend/static/index.html`과 `sw.js`가 같은 번들 해시를 가리키는지 → 다르면 재빌드.
5. 재개 전 `git fetch && git merge origin/main` (다른 기기/CLI 작업분 클로버 방지).

**세션 종료 시 남길 것(다음 세션이 복구하는 근거)**: ① 이 파일 맨 위에 세션 블록 추가 ② DEVELOPMENT_LOG에 상세 ③ 로컬 커밋(+ 가능하면 `git push`) ④ 미결 항목을 "다음 후보"로 명시.
✅ **2026-08-18 GitHub 로그인 복구 — 밀린 18커밋 푸시 완료.** 원격 백업 정상.
✅ **집현전(`knowledge/`)도 원격 백업 정상** — `Jayden-KR83/jiphyeonjeon` (private), 브랜치 `main`.
2026-08-20 실측: origin 대비 0 ahead / 0 behind, 미커밋 0건. `.gitignore` 가 제외하는
`vault/00-private/` 는 실제로 비어 있어 누락분도 없다.
❌ **2026-08-18 기록 정정**: 이 자리에 "remote 미설정(브랜치 master)"이라 적었던 것은
**오진이었다.** 다른 디렉터리에서 `git branch -vv` 를 돌린 결과를 집현전으로 착각했다.
교훈 — 저장소 상태를 볼 때는 `git -C <경로>` 로 대상을 명시할 것. Bash 툴은 작업 디렉터리가
호출 간에 유지돼, `cd` 한 줄이 빠지면 엉뚱한 저장소를 보고도 눈치채기 어렵다.
⚠️ 대화 원문(transcript)은 저장하지 않는다 — 토큰만 먹고 검색이 안 된다. **결론·근거·다음 할 일**만 위 3곳에 남긴다. 직전 대화 자체를 되살리려면 CLI에서 `claude --continue`(마지막 세션) / `claude --resume`(목록에서 선택).

---

# 📍 현재 운영 구조 (2026-08-20 기준) — 새 세션은 여기까지만 읽으면 된다

## 분석 갱신은 **서버 cron 이 아니다**

보유 종목 AI 분석은 **오너 PC 의 Windows 작업 스케줄러 + Claude Code 구독**으로
매일 06:00 자동 갱신된다. **API 비용 0원.**
서버 cron(`daon-refresh-holdings.sh`)은 **2026-08-20 삭제됨** — 종량제로 돌리면 월 $79.

| 경로 | 무엇 | 비용 |
|---|---|---|
| **주 경로** | `scripts/daily-analysis.ps1` (스케줄러가 매일 06:00 실행) | 0원 |
| 보조 경로 | 앱 설정 탭 → "분석 관리" 카드 (admin 전용, 반자동) | 0원 |
| (봉인) | `/api/cron/refresh_holdings_analysis` 엔드포인트는 살아 있음 | 종량제 |

**왜 서버가 못 하나**: 구독은 PC 의 Claude Code 클라이언트에 딸린 것이라 서버가 빌려 쓸 수 없다.
서버가 AI 를 부르려면 API 키=종량제다. 원리상 앱 화면에서 완전 자동은 불가능하다.

**분석이 안 갱신된다는 얘기가 나오면** 서버가 아니라 이 둘을 먼저 본다:
`Get-ScheduledTask "다온 일일 분석 갱신"` · `scripts/daily-analysis.log`

## 완료 — 다시 확인할 필요 없음
- 보유 **52종목 분석 전량 최신**(구독으로 생성, 평균 2일)
- 로그인 무차별 대입 차단(계정 5회 / IP 20회, 15분) — 운영 실측 검증
- **admin 2FA 켜짐**(복구코드 8개 발급)
- 집현전 원격 백업 정상(`Jayden-KR83/jiphyeonjeon` private, 완전 동기화)
- 투자 나침반 A안(판단 변경 배너) — 무료 경로에도 신호 기록 배선 완료

## 남은 것 (우선순위)
1. **`/api/cron/*` 외부 차단** — Cloudflare 규칙. 오너 작업.
   실측: 4개 엔드포인트 전부 공개 도달(403), **`warm_prices` 는 인증 없이 200**.
   cron 은 전부 `127.0.0.1` 로 부르므로 **막아도 지장 없다.**
2. 백업 암호화 · `gitleaks` 히스토리 스캔 · PBKDF2 100k→상향 · 세션 30일 만료 단축
   (근거: `docs/security-review.md`)
3. R5 앱폭(360~400px) 실기기 육안 확인 — 분석 탭
4. R1ب 전수 정리 80건 (borderRadius 8+/boxShadow/gradient) — 시각 변화 커서 승인 필요
5. 투자 나침반 B안(매크로 탭) — 미착수. 설계는 `docs/investment-compass-design.md`

## 🚫 하지 말 것
- **중복 보유 지적 금지.** 나스닥100 3중(QQQ·QQQM·133690) 등은 **오너가 의도한 장기 배분**이며
  은퇴 시점까지 보유 예정(2026-08-20 확인). 매일 같은 지적이 반복되면 새 정보가 묻힌다.
  단 기초지수 변경·상장폐지·보수 인상 등 **새 위험**은 계속 알린다.
- **서버 cron 으로 분석 갱신 되살리지 말 것** — 오너가 비용 때문에 명시적으로 삭제했다.

## ⚠️ 반복해서 밟은 함정 (같은 실수 방지)
1. **보유 원가 열은 통화가 섞여 있다**(한국=원, 미국=달러). 이걸 놓쳐 미국 종목을 소액으로
   착각했다. 실제로는 **GOOGL ≈ 3,670만원이 최대 보유 종목**이었다.
2. **작업 스케줄러는 `-AllowStartIfOnBatteries` 없으면 배터리일 때 아예 안 돈다.**
   이것 때문에 이틀간 한 번도 실행되지 않았다. `-DontStopIfGoingOnBatteries` 만으로는 부족.
3. **PowerShell here-string 에 한글 코드를 심으면 리터럴이 깨진다** → 정상 데이터를 불합격
   처리했다. 한글 코드는 UTF-8 파일로 분리(`validate_analysis_payload.py`).
4. **`.ps1` 은 UTF-8 with BOM 으로 저장.** BOM 없으면 PowerShell 5.1 이 ANSI 로 읽어 한글이 깨진다.
5. **저장소 상태는 `git -C <경로>` 로 대상을 명시**한다. Bash 툴은 작업 디렉터리가 호출 간
   유지돼, `cd` 가 빠지면 엉뚱한 저장소를 보고도 눈치채기 어렵다(집현전 오진의 원인).
6. **`is-active` 만 보고 배포 완료로 판단 금지.** 배포한 코드에만 있는 엔드포인트를 실제로
   때려본다(없는 경로 404 대비 신규 경로 401/403/405).

---

## ✅ 세션 (2026-08-18, 5차) — 전 종목 분석 최신화 + 구독 파이프라인 2경로

### 분석 51/52 최신화 완료 (API 비용 0원)
구독(Claude Code)으로 직접 조사·작성해 주입. 종량제였다면 약 $11.
나머지 1개(CRSP)는 어제 갱신돼 이미 최신.
산출물: `scripts/generated-analysis-20260818-batch{1..5}.json`

**⚠️ 중간에 있었던 판단 오류**: 보유 원가 열은 **통화가 섞여 있다**(한국=원, 미국=달러).
이걸 놓쳐 미국 종목을 소액으로 착각하고 후순위로 뒀다. 실제로는 **GOOGL $26,455 ≈
3,670만원이 최대 보유 종목**이었다. 발견 즉시 빅테크 8종을 최우선 처리.
→ `scripts/analysis_priority.py` 로 규모 순 조회 시 이 점을 유의할 것.

### 🔴 52종목을 다 보고 나온 결론 — 중복 노출
같은 지수를 한국·미국 상장으로 겹쳐 보유 중:
- 나스닥100 **3중**(QQQ+QQQM+133690) · S&P500 **2중**(SPY+360750)
- 반도체 2중(SOXX+381180) · 미국테크TOP10 **3중**(381170+A381170+472170)
- 배당다우존스 2중(402970+A458730)
- 2차전지 7중 · 우주방산 4중 · 암호화폐 3중
- 그룹 이중: 현대차+기아 / POSCO홀딩스+포스코퓨처엠 / LG화학+LG엔솔 / 에코프로+비엠
**종목이 52개인 것과 분산이 52갈래인 것은 다르다.** 오너 정리 판단 필요.

### 구독 파이프라인 2경로 구축 (`0fd26ef`)
**경로1 — PC 작업 스케줄러 + `claude -p` (무료·자동)**: `scripts/daily-analysis.ps1`
대상조회→프롬프트→생성→검증→주입. 기계적인 일은 스크립트가, 조사·작성만 LLM.
등록 명령은 파일 하단 주석. **전 구간 실제 실행 검증 완료**.
**경로2 — 앱 내 분석 관리 화면(admin)**: `/api/admin/analysis/{gap,prompt}` +
`AnalysisAdminCard`. 프롬프트 복사 → 클로드 → 결과 붙여넣기 → 검증·저장.

⚠️ **왜 앱에서 완전 자동이 안 되나**: 구독은 PC 의 Claude Code 클라이언트에 딸린 것이라
서버가 빌려 쓸 수 없다. 서버가 AI 를 부르려면 API 키=종량제다. 원리상 불가.

### 인코딩 함정 2건 (재발 방지)
1. PowerShell here-string 에 한글 파이썬 코드를 심으면 리터럴이 깨진다 →
   **한글 코드는 UTF-8 파일로 분리**(`validate_analysis_payload.py`)
2. `.ps1` 은 **UTF-8 with BOM** 으로 저장해야 한다. BOM 없으면 PowerShell 5.1 이
   ANSI(cp949)로 읽어 한글이 전부 깨진다

### 비용 cron 은 여전히 HOLD
`#[HOLD 2026-08-18 오너지시]` 주석 상태. 되살리려면 접두만 제거.

---

## ✅ 세션 (2026-08-18, 4차) — cron HOLD · 구독으로 분석 6종목 교체

### 1. 비용 cron **중지됨** (오너 지시)
서버 crontab 에서 주석 처리. 줄은 지우지 않아 그대로 되살릴 수 있다:
`#[HOLD 2026-08-18 오너지시] 0 20 * * * /usr/local/bin/daon-refresh-holdings.sh`
→ 되살리려면 `#[HOLD ...]` 접두만 제거.

### 2. SSH 키 암호 설정됨 — **작업 경로가 바뀌었다**
오너가 패스프레이즈를 걸고 Windows `ssh-agent` 에 등록 완료.
⚠️ **Git Bash 의 ssh 는 Windows ssh-agent 를 못 본다** → Bash 툴로 ssh 하면
`Permission denied (publickey)`. **서버 작업은 PowerShell 경로로 할 것**(배포 스크립트도 PS).

### 3. 구독(Claude Code)으로 분석 6종목 생성·주입 — 분석 공백 0
`_build_stock_analysis_prompt` 와 같은 스키마로 직접 조사·작성 후 주입. **API 비용 0.**
- 기아(000270) 보유·목표 22만 / NAVER(035420) 매수·목표 40만 / 카카오(035720) 매수·목표 7만
- 채권혼합 3종(447770·448540·472170) 보유. 구조 차이를 명시:
  447770 테슬라 29.5%+국채3-10년 / 448540 엔비디아 30%+**1년미만** 국채 / 472170 미국테크TOP10 40%+국채3-10년
- **분석 없음 6종목 → 0종목**. 잔여 46종목은 아직 54~64일 전 분석

**분석에서 나온 오너 확인 사항 2건**
- 채권혼합 3종이 **목적 중복**(전부 퇴직연금 안전자산 30% 요건용). 셋 다 필요한지 검토 권고
- 472170 과 381170(TIGER 미국테크TOP10 INDXX)은 **기초자산 중복** → 실질 빅테크 노출 합산 확인 권고

**신규 도구** (`scripts/`)
- `analysis_gap.py` — 보유 대비 분석 공백·노후도 리포트(운영 DB 읽기전용)
- `inject_subscription_analysis.py` — 구독 생성분 주입. 필수필드·추천값·**출처 유무 검증 후**
  전건 통과해야 넣는다. `source='claude_code'` 로 API 종량제분과 구분

---

## ✅ 세션 (2026-08-18, 3차) — 매도 반영 확인 · 비용 정정 · 2FA

### 매도 2건 반영 — 확인됨
`transactions` 에 **Z(Zillow) 7주 · U(Unity) 8주, 2026-08-17 매도** 기록.
`portfolios` 에서 둘 다 사라짐 → **갱신 배치가 판 종목에 돈을 쓰지 않는다.**

### ⚠️ 비용 추정 정정 (중요)
앞서 "월 $15"라고 쓴 건 **web_search 비용만** 센 것이다. 프로젝트 자체 런북
(`scripts/PREANALYSIS_RUNBOOK.md`)의 실측치는 **종목당 약 $0.22**(토큰 포함).
→ 12종목/일 × 30일 = **월 약 $79**. 앞 기록을 이 값으로 읽을 것.

### 보유 분석 신선도 실측 (2026-08-18)
- 보유 고유 티커 **52** (배치 후보 51 = 비상장 펀드 1건 제외)
- **분석 한 번도 없음 6종목**: 000270 · 035420 · 035720 · 447770 · 448540 · 472170
- 나머지 46종목도 상당수가 **58~64일 전** 분석 → 사실상 전량이 낡았다

### 구독(Claude Code) 활용 — **이미 만들어둔 파이프라인이 있다**
`scripts/PREANALYSIS_RUNBOOK.md` = "구독 용량으로 캐시를 채워 API 과금을 줄이는" 런북.
`cache_gap_report.py` → `build_analysis_prompts.py` → (Claude Code 세션에서 생성) →
`assemble_payload.py` → `/api/admin/ai_cache/import`. **프롬프트는 운영과 동일 소스 재사용.**
- 한계비용 ≈ 0 (이미 낸 정액). 단 **사람이 낀 세션이 필요** — 새벽 5시 무인 실행은 불가
- 따라서 cron(API·자동)과 구독배치(수동·무료)는 **대체재가 아니라 보완재**

### 2단계 인증(TOTP) — 완료·배포 (`6578787`)
- 라이브러리 없이 구현, **RFC 6238 공식 벡터 5개로 검증**
- **복구 코드 8개**(1회용, 해시 저장) — 오너의 2026-07 GitHub 2FA 분실 전례 때문에 필수 요건으로 잡음
- 로그인 화면 코드칸에 **복구 코드도 그대로** 입력 가능(별도 경로 없음)
- 켜기 전 코드 1회 검증 강제 / 끄기는 비밀번호+코드 / 코드 오류도 로그인 잠금 대상
- 운영 확인: `/api/auth/2fa/setup` 401(인증필요), users 테이블에 totp 컬럼 3개 반영

---

## ✅ 세션 (2026-08-18, 후반) — 오너 지시 1·2·3 처리

### 1. cron 등록 — **완료 (서버 반영됨)**
- `/usr/local/bin/daon-refresh-holdings.sh` 생성. 시크릿은 **DB 에서 조회**(discover-scan
  관례를 따름 — 파일에 평문으로 박지 않는다). curl 타임아웃 50분(12종목 최악 36분 대비)
- crontab 등록: `0 20 * * * ...` = **KST 05:00**.
  ⚠️ 문서에 적혀 있던 19:00 UTC 는 **이미 DB 백업이 쓰고 있었다** — 실측으로 발견해 이동
- **시험 실행 검증(max_tickers=2)**: `refreshed:2, signals:2, candidates:51, failed:[]`,
  소요 3분12초 → 종목당 ~1.6분, 12종목이면 약 19분. 나침반 신호 2건 실제 생성 확인

**⚠️ 알아둘 것 — 보유가 51종목이다.** 하루 12종목이면 **한 바퀴에 4~5일**.
"매일 갱신"은 배치 주기이고 개별 종목은 4~5일마다 돈다. 전 종목 매일로 올리면
검색비만 월 $60 수준(현재 약 $15). `max_tickers` 조정은 오너 판단.
**초기 4~5일은 '첫 분석' 알림이 매일 뜰 수 있다**(직전 추천이 없던 종목도 신호로 잡힌다).
초기 스윕이 끝나면 진짜 판단 변경만 남는다.

### 2. 보안 3건 — **1건 완료 / 2건 오너 몫**
- ✅ **Dependabot**: `.github/dependabot.yml` 추가(pip·npm·npm).
  ⚠️ **보안 경보 스위치는 웹에서 한 번 켜야 한다** — Settings → Code security →
  Dependabot alerts → Enable
- ⚠️ **Anthropic 월 사용 한도**: 콘솔 로그인이 필요해 미실행. **오너 직접**
- ⚠️ **SSH 키 패스프레이즈**: 실측 결과 **암호 없음**. 값은 오너가 정해야 해 미실행
  - 파일권한은 **이미 최소**(ACL `user:(F)`, 상속 없음) → 옮길 이유 없음.
    경로가 `.claude/settings.json` 권한목록·슬래시명령·문서 10여 곳에 박혀 있어
    **옮기면 도구가 깨진다**. 비권고로 결론
  - 암호 설정 시 배포마다 입력 요구 → `ssh-agent` 로 해소 가능하나
    **현재 Disabled 상태**(켜려면 관리자 권한)

### 3. 로그인 무차별 대입 차단 — **완료·배포·운영 검증까지**
- 계정별 5회 / IP별 20회, 15분 롤링 창. 초과 시 429 + Retry-After
- **비밀번호 검사 전에 잠금 확인** (PBKDF2 10만회가 그 자체로 비용)
- 창 벗어난 시도 자동 소멸 + 성공 시 그 계정 기록 삭제 → 영구 잠금 없음
- IP 기록은 **일부러 남긴다**(한 계정 비번을 아는 공격자가 IP 카운터를 초기화하며
  다른 계정을 훑는 것 방지)
- **운영 실측**: 존재하지 않는 계정으로 7회 시도 → 1~5회 401, **6회차부터 429** ✅
- ⚠️ 검증 흔적으로 이 PC 공인 IP 에 실패 7건이 남아 있다(한도 20). **15분 뒤 자동 소멸**

### 남은 보안 위험
관리자 **2FA(TOTP) 미구현** — R1 잔여분. 별도 작업 1~2일.

---

## ✅ 세션 (2026-08-18) — 오너 지시 5건 전부 처리 + **GitHub 복구·18커밋 푸시**

**상태**: 커밋·푸시·**배포까지 완료**. pytest **169 통과** · vite build OK.
공개 도메인 검증 — 번들 해시 로컬=서버=daonwealth.com **3중 일치**(`index-CASTIi4Y.js`),
`main.py` sha 일치, 신규 엔드포인트 응답 확인(`/api/compass/signals` 401 ·
`/api/cron/refresh_holdings_analysis` 405, 없는 경로는 404).
사전 백업 `backup/daon-predeploy-20260818.db`(4.19MB) · integrity ok.

**GitHub 잠김 해소**: 2026-07-27부터 막혔던 푸시가 풀려 밀린 18커밋 일괄 push (`7df3c54..b2af7bf`).
이제 원격 백업이 다시 살아 있다.
❌ **정정(2026-08-20)**: 여기 적었던 "집현전은 remote 자체가 없다"는 **오진**이다.
실제로는 `Jayden-KR83/jiphyeonjeon`(private, 브랜치 `main`)로 정상 백업 중이며 완전 동기화 상태다.

### ① 업비트 원화 평단 — 완료 (`e2d724b`)
안 A 채택(환산기). AddTab 평균단가 셀의 **₩ 버튼** → 원화 평단 + **매수시점 환율** 입력 →
달러 평단 자동 계산. `krw_avg_price`·`krw_fx` 는 **기록 전용**(계산 미참여, 재편집용).
- 왜 매수시점 환율인가: 현재 환율로 나누면 환율이 움직일 때마다 과거 원가가 흔들린다
- ⚠️ **남은 한계**: 원화 기준 손익은 `r_now/r_buy` 만큼 스케일된다. 업비트 원화 손익과
  **정확히** 맞추려면 안 B(`BTC-KRW`)가 필요 — 위험도 그대로이므로 미채택 유지

### ③ 분석 머릿글 통일 — 완료 (`f31b2c3`)
원인은 **한 리포트에 머릿글 체계가 셋**이었던 것(요약=없음 / 본문=Section / 의견=별도 라벨).
`Section` 을 유일 체계로 승격(`accent`·`collapsible` 추가), 요약·의견도 Section 으로.
AllocationTab 은 2단계 라벨을 `SubLabel` 로 단일화.
- ⚠️ **R5-앱폭(360~400px) 육안 확인 미실시** — 로컬 구동이 운영 `daon.db` 를 건드려 안 띄웠다.
  배포 후 확인 권장
- 📌 별건: R1ب 전수 grep 결과 **앱 전체 80건** 잔존(borderRadius 8+/boxShadow/gradient).
  이번 변경과 무관한 기존 코드. 일괄 정리는 시각 변화가 커서 **오너 승인 후 별도 진행**

### ② 일 1회 웹검색 분석 갱신 — 완료 (`3767a4e`)
핸드오프의 미확인 항목 해소: **웹검색은 이미 쓰고 있었다**(`_call_claude_with_search`,
`web_search_20250305`). 붙일 것은 검색 수단이 아니라 주기 호출 경로뿐이었다.
`POST /api/cron/refresh_holdings_analysis` 신설. 비용 4겹 통제(ai_enabled만 / 티커 중복제거 /
`min_age_hours` 20h / `max_tickers` 12 + **오래된 것 먼저** 라운드로빈).
- ⚠️ **오너 작업 남음**: 서버 cron 등록(SSH 필요). crontab 줄 + 스크립트 본문은
  `docs/deployment.md` §4 에 그대로 적어뒀다. **19:00 UTC 권장**(발굴스캔 22:00·리밸런싱
  09:00 과 분리, 1GB VM OOM 회피)

### ⑤ 보안 점검 — 완료 (`1382ade`) → `docs/security-review.md`
`/security-review` 를 이번 3커밋에 실행 → **취약점 0건**. 그 위에 요청받은 종합 분석 작성.
- **최상위 위험 R1**: 로그인 레이트리밋·2FA 둘 다 **미구현**(2026-06 권고가 아직 미이행).
  사용자 1명 앱이라 **단일 계정 탈취 = 전부 상실**
- 코드변경 0인 **오너 즉시 조치 3건**: ① Anthropic 콘솔 월 사용한도 ② SSH 키 패스프레이즈
  ③ Dependabot 켜기
- 미점검: 서버 실물(포트·systemd·CF헤더·cron 외부노출)·git 히스토리 시크릿 스캔·DAST

### ④ 투자 나침반 — 설계안 비교 → **오너가 안 A 선택 → 구현·배포 완료** (`d564098`)
설계 문서: `docs/investment-compass-design.md`.
- **설계를 바꾼 발견**: 기존 `/api/youtube/analyze` 는 **자막을 안 읽는다**(제목·채널명만).
  재사용 대상이 아니라 교체 대상 — 그대로 확장하면 구조적 환각 생성기가 된다.
  자막은 공식 경로로 못 받는다(`captions.download` 는 영상 소유자 전용).
  `knowledge/tech-radar` 도 아직 비어 있다
- **오너 선택: A 먼저.** 구현 완료 — `compass_signals` 테이블 + 일1회 배치가 덮어쓰기
  **전에** 이전 추천을 읽어 비교 → **판단이 뒤집힌 종목만** 기록(출처 URL 없으면 미기록).
  `CompassBanner` 가 보유·시세와 교차해 비중을 붙이고 **한 번에 하나만** 노출, '읽음' 누르면
  재노출 안 함. 추가 AI 비용 0
- ⚠️ **아직 배너가 안 보이는 게 정상** — 신호는 cron 배치가 돌아야 생긴다. **② cron 등록이
  선행 조건**이다
- B(매크로 탭)는 미착수. C(유튜브 원안)는 비권장 결론 유지

### 🔥 배포 중 사고 2건 — 둘 다 "성공처럼 보이는 실패" (`2253298`, `4284069`)
`docs/troubleshooting.md` 최신 항목에 기록.
1. **`deploy.ps1` 이 `sw.js`·`workbox` 를 안 올렸다** → 서비스워커가 **구버전 번들을
   프리캐시**한 채 서빙. 설치형(PWA) 사용자만 옛 화면, 새로고침으로 안 고쳐지는 유형.
   → 업로드 블록 추가
2. **`deploy.ps1` 이 CRLF 가 되자 `systemctl restart` 가 실패** — here-string 의 원격 bash
   명령에 `
` 이 섞임. 파일은 올라갔는데 **서비스는 구 프로세스 유지**, 스크립트는
   "배포 완료!" 출력. → 원격 전송 직전 `-replace "`r", ""` (줄바꿈 설정에 의존하지 않게)
   ⚠️ git `core.autocrlf` 가 이 파일을 계속 CRLF 로 만든다 — **가드가 유일한 해법**
- **교훈**: `is-active` 만 보고 배포 완료로 판단하지 말 것. 배포한 코드에만 있는
  엔드포인트를 실제로 때려본다(없는 경로 404 대비 신규 경로 401/403/405)

---

## 다음 후보 (우선순위 순)

1. **② cron 등록** — 서버 SSH 작업. **④ 나침반 배너가 뜨려면 이게 선행돼야 한다**
   (신호는 배치가 만든다). crontab 줄·스크립트 본문은 `docs/deployment.md` §4
2. **⑤ 오너 즉시 조치 3건** — Anthropic 콘솔 월 사용한도 / SSH 키 패스프레이즈 /
   Dependabot. 전부 코드 변경 0
3. **③ R5-앱폭 육안 확인** — 이제 배포됐으니 실기기 360~400px 에서 분석 탭 확인
4. **⑤ R1 대응** — 로그인 레이트리밋 (반나절)
5. **①의 남은 선택** — 원화 손익 정확도를 위해 안 B 로 갈지
6. **R1ب 80건 일괄 정리** — 오너 승인 후

---



## ✅ 세션 (2026-07-30) — 모바일 UX 7건 + 아이콘 확정 + **배포 완료**

**상태**: 🚀 **배포 완료**(2026-07-30 14:0x KST). pytest 114 · **공개 도메인 스모크 21/21 PASS**.
**배포분**: 급등락 알림(7/29) + 앱 아이콘 뱃지 + UX 7건 + L2 아이콘 **일괄**.
**배포 후속**: 첫 스캔 18건 발화(정상 — 최초 무장) → A접두 중복 버그 발견·수정·재배포 → 재스캔 3건(상태키 마이그레이션 1회성) → 죽은 상태행 3개 삭제 → 3회차 `triggered:0` 안정화.
**서버 상태**: 번들 `index-BxmZSJRw.js` · main.py sha `dccbfa0c…` · `move_alert_state` 18행 · integrity ok · 백업 `backup/daon-predeploy-20260730-1403.db`.
**정정**: `381170`/`A381170`은 중복 등록이 아니다 — **같은 ETF를 두 계좌에 나눠 보유**한 정상 데이터(KR_RETIRE 350주 @23,879 / KR_ISA 100주 @22,485). 관심종목에는 없다. 오너가 정리할 것 없음. 티커 표기만 A접두 유무로 달랐고, 급등락 알림 중복은 코드에서 해결됨.

**미결 — 오너 판단 필요(계좌 분산 보유 비중 합산)**: 앱이 보유를 **계좌별 행 단위**로 집계해 같은 종목이 두 계좌에 있으면 비중이 나뉘어 표시된다. A접두와 무관한 일반 동작(티커 표기가 같은 POSCO홀딩스도 동일).
- TIGER 미국테크TOP10: 실제 2.30% → 앱 표시 `1.79% + 0.51%`
- POSCO홀딩스: 실제 2.64% → 앱 표시 `2.28% + 0.36%`
- 현재 비중이 작아 집중도 경고(임계 30%)에는 영향 없음. 보유 목록은 계좌별 평단·과세가 달라 지금처럼 분리가 맞고, **종목별 비중 차트·집중도 계산만 합산**하는 게 맞는지가 판단 지점.
**한 일**: 로고 흰테두리 제거 · L2 비중 링 아이콘 4종 교체(maskable 안전영역 버그 동시 수정) · 하단 네비 스크롤 스트립 + 활성탭 센터링 · 지수 배너 ◀▶ · 모바일↔웹 뷰 전환(`layoutMode`) · 발굴탭 산정방식 접힘 · 지표 설명 18종(초보자용). 상세: [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) 2026-07-30.
**함께 고친 잠복 버그**: ① React #310 흰 화면(App.jsx 훅이 조기 반환 아래에 있어 같은 세션 로그인 시 크래시) ② `.app-top-controls`(fixed z-9999)가 마켓바를 덮어 ▶ 버튼이 눌리지 않던 문제.
**변경 파일**: `frontend/src/`{App.jsx, App.css, store.js, components/{LogoCircle,BottomNav.jsx/.css,MarketBar.jsx/.css,TopNavBar,SideNavBar}, tabs/{ChartTab,DiscoverTab}} · 아이콘 4종×2경로 · `scripts/smoke-2026-07-30.js`(신규).

**스모크 재실행 방법**(로컬):
```powershell
# 1) 백엔드 (반드시 backend/ 에서 — main:app 임포트 경로)
Start-Process python -ArgumentList "-m","uvicorn","main:app","--host","127.0.0.1","--port","8501" -WorkingDirectory "<repo>\backend"
# 2) 스모크 (Chrome 필요)
cd scripts; node smoke-2026-07-30.js     # 21/21 PASS = exit 0
```
⚠️ 좌표 클릭은 ChangelogModal 스크림(z-9999)이 삼킨다 → 스크립트가 `daon_last_seen_version='dismissed'` sentinel을 먼저 심는다.
⚠️ 리포 루트 `daon.db`는 **개발용**(전 계정 test/demo). 운영 DB는 Oracle 서버.

**다음 후보**: 아이콘 확정 반영 후 배포 → 급등락 알림(2026-07-29분)과 함께 1회 배포.

---

## ✅ 세션 (2026-07-29) — 급등락 알림 ±5%

**상태**: 코드·문서·빌드 완료 · pytest 111 통과 · **미배포**(서버 배포는 오너 확인 후).
**한 일**: 보유·관심 종목 일간 변동률이 임계(기본 ±5%)를 넘으면 인앱+Web Push 알림. 기존 5분 cron에 편승(cron 추가 없음, 15분 스로틀). 상세는 [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) 2026-07-29 항목.
**변경 파일**: `backend/main.py`(스키마 2테이블+컬럼1 · `_decide_move_alert` · `_run_move_scan` · `/api/alerts/move`) · `backend/tests/test_move_alerts.py`(신규 12건) · `frontend/src/api.js` · `frontend/src/components/NotificationsBell.jsx` · `docs/api.md`.
**빌드**: `index-DmmO9TTn.js` (index.html·sw.js 해시 일치 확인).
**PWA**: 이미 2026-05-29부터 활성(manifest·sw·InstallPrompt·Web Push 전부 존재) — 이번 세션 변경 없음.

**배포 명령**(오너 확인 후 실행):
```powershell
scp -i "C:\Users\user\Downloads\oracle-key.key" -r `
  "c:\Users\user\AgentDev\daon\backend\static\*" ubuntu@168.107.13.20:~/portfolio/backend/static/
scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "c:\Users\user\AgentDev\daon\backend\main.py" ubuntu@168.107.13.20:~/portfolio/backend/
ssh -i "C:\Users\user\Downloads\oracle-key.key" ubuntu@168.107.13.20 "sudo systemctl restart portfolio"
```
배포 후 검증: 알림 벨 → 설정 탭에 "급등락 알림" 카드 표시 · 푸시 "테스트" 버튼 도달 · 다음 cron(≤15분) 후 `move.triggered` 확인.

**다음 후보**: (아래 2026-06-25 블록의 B2 풀통합 · SaaS 온보딩 그대로 유효)

---

## ✅ 세션 종료 (2026-06-24~25) — 보유종목 분석 탭 개선 [좌측 CLI]

**상태**: ✅ 종료(사용자 마무리 선언). 모든 작업 배포·푸시 완료. 작업트리 clean · origin/main 동기화. 다음 작업은 새 CLI로.
**브랜치/배포**: `worktree-goal-based-portfolio` → origin/main. pytest **52 통과**. 라이브 번들 해시는 종료 시점 마지막 배포 기준(index.html·sw.js 일치 확인 완료).
**2-CLI 구성**: 좌측(여기)=**보유종목 분석** / 우측=**신규 종목 발굴**. ⚠️ **배포 클로버 주의** — 재개 시 반드시 `git fetch && merge origin/main → 재빌드 → 배포 → index.html·sw.js 번들 해시 일치 검증`.

**이번 세션 완료**(상세: [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) 2026-06-24~25 세션):
- 데이터 정합성: 전략 캐시 fingerprint(수량·평단·현재가) + verified_facts 백엔드 실시간 시세 권위화(Phase 1) + 프롬프트 변수바인딩 + 절세 스코프
- 안정화: `_as_completed_safe`(타임아웃 격리) · 전략 비동기화(524 해소) · Health 로컬 fallback · 리밸런싱 공백 수정
- 기능: 수동 기준가 · 분기 배당 히스토그램 · 목표 방법론+필요 CAGR · 저점발굴 시계열 매칭 · 편집형 배당 시뮬
- UI: B3 3장 재배치 · 리스크 진단 카드(R1 준수) · 문장 줄바꿈(CLAUDE.md R6 신설) · 분석 도출시각/MD KST
- 문서: DEVELOPMENT_LOG·핸드오프 기록 · **가이드 탭 갱신**(분석 섹션 최신화 + 좌측 메뉴와 순서 일치 + 중복 key 정리) · **여정 탭 갱신**(마일스톤 P34~P36 + 채권혼합 verdict→완료). 이후 여정은 월간 클라우드 루틴 자동 갱신.

**재개 시 다음 후보**:
1. **B2 풀 통합**(상용화): 리스크 카드 Claude 정성진단 1:1 + 스냅샷/액션 섹션 통합
2. **SaaS 온보딩**(상용화): `target_markets` 마스킹 + 리스크 성향 토글
3. **TrendsTab R1 위반 2건** 정리(`.tt-index-card-accent`·`.tt-news-card` 좌측 색보더 — 시장 탭)

---

# (이전) A안 작업 — 세션 핸드오프 노트

**시작 시각**: 2026-05-19
**상태**: ✅ 완료(아카이브)

## 목적
세션 토큰 한도 도달 등으로 작업이 중단됐을 때, 다음 세션이 정확히 어디서부터 이어가야 하는지 추적.

## 작업 범위 (A안)
| # | 작업 | 상태 | 배포 | 비고 |
|---|---|---|---|---|
| **A1-be** | Net Worth 스냅샷 백엔드 (DB + 자동 캡처 + GET endpoint) | ✅ | 🚀 | `net_worth_snapshots` 테이블, `POST /api/snapshots/capture`, `GET /api/snapshots/networth` |
| **A1-fe** | Net Worth 추이 차트 (Allocation 탭) | ✅ | 🚀 | `NetWorthChart.jsx` 신규, App.jsx에 lazy capture trigger. 번들: `index-B1Y4grqC.js` |
| **B1-be** | Portfolio Health Score 계산 + endpoint | ✅ | 🚀 | `POST /api/portfolio/health` — 4개 하위 지표 가중평균, 등급 S/A/B/C/D |
| **B1-fe** | Health Score 게이지 + 세부 점수 UI | ✅ | 🚀 | `HealthScoreCard.jsx` — SVG 반원 게이지 + 4개 SubScoreBar. 번들: `index-CugQWIn7.js` |
| **B3-be** | 룰 기반 리밸런싱 경고 + endpoint | ✅ | 🚀 | `POST /api/portfolio/alerts` — 5개 룰 (종목/섹터 집중·큰손실·중복·미분산) |
| **B3-fe** | 경고 카드 UI | ✅ | 🚀 | `AlertsCard.jsx` — severity별 색상, 임계값 조정 가능. 번들: `index-Ct8FicrM.js` |
| **D1** | Puppeteer 회귀 테스트 스크립트 | ✅ | 🚀 | `scripts/regression-test.js` — 10탭 + 차트 + 신규 6컴포넌트 자동 검증, exit code 0/1 |

## 최종 상태 (2026-05-19 종료)
- **전체 A안 완료** — 4개 deployable chunk 모두 배포·검증
- **회귀 테스트 PASS** — 모든 10탭 OK + Recharts 렌더 + NetWorth/HealthScore/Alerts/Backtest/AI/Shimmer 모두 표시
- 테스트 세션 cleanup 완료

## 사용 방법 (회귀 테스트)
```bash
# 1) 임시 세션 생성 (서버에서)
SESS=$(ssh ubuntu@168.107.13.20 "python3 -c 'import sqlite3,secrets,time; t=\"TESTONLY_\"+secrets.token_hex(16); ...'")
# 2) 테스트 실행
cd scripts && DAON_TOKEN=$SESS node regression-test.js
# 결과: PASS=exit 0, FAIL=exit 1
```

---

## 🌙 2026-05-21 야간 세션 — B + C + E안 일괄 (auto-mode)

| 단계 | 상태 | 배포 |
|---|---|---|
| **백업** (`_backup/daon-pre-BCE-20260521-2213/`) | ✅ | - |
| **E-A3 cron 자동 백업** (매일 KST 04:00, 30일 보관) | ✅ | 🚀 |
| **E-D2 Changelog 인앱 공지** (`changelog.json` + `ChangelogModal.jsx`) | ✅ | 🚀 |
| **E-A2 종목별 P/L 일별 스냅샷** + lazy capture | ✅ | 🚀 |
| **C-C3 다크모드 OS 자동 (auto theme)** | ✅ | 🚀 |
| **C-C2 단축키 시스템** (1-5 탭 / / 검색 / ESC / ?) | ✅ | 🚀 |
| **C-C5 최근 검색** (localStorage 기반) | ✅ | 🚀 |
| **C-C1 관심종목 그룹화** (`watchlist.group_name`) | ✅ | 🚀 |
| **B-B4 실적 캘린더** (yfinance earnings_dates) | ✅ | 🚀 |
| **B-B2 상관관계 매트릭스** (히트맵 테이블) | ✅ | 🚀 |
| **B-B5 차트 비교 모드** (2-6종목 normalize=100) | ✅ | 🚀 |

**번들 (최종)**: `index-CEp0W-J2.js` (ChangelogModal sentinel 패치 포함) — 로컬 빌드 완료, ⚠️ 서버 outage로 미배포
**Backend SQLite 신규 테이블**: `holding_pnl_snapshots`
**Backend 컬럼 추가**: `watchlist.group_name`
**Backend 신규 endpoints**: 10개 (P/L capture/조회·watchlist 그룹·상관관계·실적·차트비교)
**Frontend 신규 컴포넌트**: 5개 (ChangelogModal · KeyboardShortcuts · CorrelationCard · EarningsCalendar · CompareChart)

## ⚠️ Oracle 서버 일시 불통 (2026-05-21 야간)

### 좋은 소식 — 사용자 체감 기능 모두 정상 배포됨 ✅
`index-D8235eZb.js` (B+C+E안 모든 11개 기능 포함) 가 **outage 전에 배포 완료**되어 있음 (`systemctl is-active = active` 확인됨). 사용자는 F5 새로고침 시 모든 신규 기능을 정상 사용 가능.

### 미배포 (선택적)
- `index-CEp0W-J2.js` — **회귀 테스트 자동화 friendly sentinel 패치만 포함**
- ChangelogModal에 `v9xx`/`dismissed` 토큰을 sentinel로 인식해서 자동 닫기 — 회귀 테스트가 모달 클릭 가로채임 회피용
- **사용자 체감 영향 0** — D8235eZb 그대로 써도 모든 기능 정상

### 원인
Oracle Free Tier VM idle reclaim 또는 일시 네트워크 장애 (코드와 무관, ping 100% loss / HTTP 000 / ssh banner timeout)

### 자동 모니터링 진행 중
서버 복구 감지하면 즉시 알림 → CEp0W-J2.js 배포 + 회귀 재실행

### 수동 복구 명령 (참고 — 서버 복구 후 회귀 테스트가 필요한 경우만)

### 수동 복구 명령 (참고)
```powershell
scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\backend\static\index.html" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\backend\static\sw.js" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/

scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\backend\static\assets\index-CEp0W-J2.js" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/assets/

ssh -i "C:\Users\user\Downloads\oracle-key.key" ubuntu@168.107.13.20 "sudo systemctl restart portfolio"
```

상태 기호: ⏳ 대기 · 🔧 진행 · ✅ 완료 · 🚀 배포 · ❌ 실패

## 재시작 방법 (다음 세션)
1. 이 파일의 "상태" 컬럼 확인 → 첫 ⏳ 작업부터 이어감
2. 🚀 표시된 작업은 이미 배포되어 사용자가 사용 중 — **다시 하지 말 것**
3. 각 작업은 deployable chunk — 한 작업 완료 시 빌드+배포까지 한 번에
4. **확인 후 시작 명령**:
   - 마지막 배포 번들 hash: (해당 작업 완료 시 기록)
   - 마지막 백엔드 SHA256: (해당 작업 완료 시 기록)

## 백업 위치 (롤백용)
- 로컬: `c:\Users\user\Desktop\쿠든카피 주식앱\_backup\daon-pre-v2-20260519-2243\`
- 원격: `~/portfolio_backup_pre_v2_20260519-2243/` (DB 포함)

A안 시작 직전 추가 백업: (A1-be 시작 시 생성)

## 작업 로그
- (각 단계 완료 시 timestamp + 변경 파일 + 배포 hash 기록 예정)

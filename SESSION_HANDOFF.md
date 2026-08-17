# 세션 핸드오프 노트

> **새 CLI 세션은 이 파일부터 읽는다.** 아래 "복구 순서"가 세션 연속성의 정본.

> **2026-08-18 예정 작업 5건이 아래 "📌" 블록에 있다.** 세션 CLEAR 후 재개 시 그것부터.

## 🔁 복구 순서 (CLI가 닫혔거나 새로 열었을 때)

1. `git status` · `git log --oneline -5` · `git rev-list --left-right --count origin/main...HEAD`
   → **미푸시 커밋 수**가 곧 "지난 세션이 어디까지 갔나". 작업트리가 dirty면 그게 중단 지점.
2. 이 파일의 **최신 세션 블록**(맨 위) 읽기 → 무엇을 했고 다음 후보가 뭔지.
3. [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) 최신 세션 항목 → 왜 그렇게 했는지(설계 근거·트레이드오프).
4. 배포 상태 확인: `backend/static/index.html`과 `sw.js`가 같은 번들 해시를 가리키는지 → 다르면 재빌드.
5. 재개 전 `git fetch && git merge origin/main` (다른 기기/CLI 작업분 클로버 방지).

**세션 종료 시 남길 것(다음 세션이 복구하는 근거)**: ① 이 파일 맨 위에 세션 블록 추가 ② DEVELOPMENT_LOG에 상세 ③ 로컬 커밋(+ 가능하면 `git push`) ④ 미결 항목을 "다음 후보"로 명시.
⚠️ **2026-07-27부터 GitHub(Jayden-KR83) 로그인 불가(2FA 분실)로 origin 푸시가 막혀 있다** — 원격 백업이 없으니 **로컬 커밋이 유일한 안전망**. 세션 끝 커밋을 거르지 말 것. (계정 복구 시 밀린 커밋 일괄 push)
⚠️ 대화 원문(transcript)은 저장하지 않는다 — 토큰만 먹고 검색이 안 된다. **결론·근거·다음 할 일**만 위 3곳에 남긴다. 직전 대화 자체를 되살리려면 CLI에서 `claude --continue`(마지막 세션) / `claude --resume`(목록에서 선택).

---

## 📌 2026-08-18(화) 저녁 9시 실행 예정 — 오너 지시 5건 [다음 세션이 여기서 시작]

> 2026-08-18 00:09 KST 접수. 오너는 세션을 CLEAR 후 재개 예정.
> **새 세션은 이 블록만 읽으면 바로 착수 가능하도록 필요한 배경을 모두 적어둔다.**
> 착수 시 `git log --oneline -3` 로 현재 위치 확인 → 아래 1~5번 순서 무관, 난이도순 권장: 1 → 3 → 2 → 5 → 4.

### ① 업비트 보유 암호화폐 — 원화 평단 입력 방법
**상황**: 오너는 **업비트에 BTC·ETH 보유 중**(2026-08-18 확인). 어제 구현한 암호화폐 지원은
`BTC-USD`/`ETH-USD` (달러 표시 + 환율 곱) 방식이다. 업비트는 원화 매수라 **평단을 달러로
환산해 넣어야 하는 불편**이 있다.

**어제 결정 근거(재검토 시 참고)**: 야후는 `BTC-KRW` 도 준다(업비트 가격, 김치프리미엄 포함).
채택하지 않은 이유 = 그 티커가 KRW 표시임을 환율 곱하는 자리 전부에 알려야 하는데
`is_kr()` 이 '한국 상장 종목'(→ Naver 스크래핑 경로) 판정도 겸해서 두 의미를 섞으면 위험.
실측 차이 0.06% (BTC-KRW 89,758,064 vs BTC-USD 환산 89,706,660).

**할 일**: 원화 평단을 넣을 수 있는 방법을 설계·구현하고 오너에게 안내.
- 안 A(권장, 저위험): 편집 폼에 **"원화 평단 입력"** 토글 추가 → 입력값을 현재 환율로 나눠
  `avg_price`(달러)에 저장. 저장 시점 환율을 어딘가 기록해야 재현 가능(예: 메모/nav_date 유사 필드).
  ⚠️ 환율이 변하면 과거 매수 원가가 흔들리는 문제 → **매수 시점 환율**을 받아야 정확하다.
- 안 B(정확, 고위험): `is_krw(ticker)` 개념 신설(= is_kr() OR endswith('-KRW'))로
  '원화 표시' 판정을 통화 곱셈 자리 전부에 분리 적용 → `BTC-KRW` 채택.
  ⚠️ 통화 곱셈 자리는 이미 오늘 두 번 사고 난 곳(is_kr 지역변수 섀도잉, 배당 dict).
  손대려면 양방향 테스트 선행 필수.
- 안 C(가장 단순): 오너가 업비트 앱에서 **평균 매수가(원) ÷ 매수시점 환율**을 직접 계산해 입력.
  코드 변경 0. 먼저 이 방법을 안내하고, 불편하면 A를 구현하는 순서가 합리적.

### ② 보유 종목 최신 분석 — 하루 1회 웹 검색으로 갱신
**할 일**: 보유 종목에 대해 매일 1회 웹 검색으로 최신 분석을 받아 유지.
**기존 자산(재사용할 것)**:
- `POST /api/cron/discover_scan` · `_weekly_rebalance_for_user` 등 **cron + AI 파이프라인 패턴이 이미 있다**
- `ai_cache` 테이블 + `ai_cache_targets.json`(사전 생성 대상) + `scripts/warm_analysis_cache.py`
- cron 등록 위치: 서버 `crontab -l`, 스크립트는 `/usr/local/bin/daon-*.sh`
- 배포 문서: `docs/deployment.md` §4 cron
**주의**: AI 비용. `ai_enabled` 사용자만, 캐시 우선, 일 1회 상한. 서버는 2코어/1GB(OOM 주의) —
무거운 작업은 다른 cron과 시간 분리(발굴 스캔 22:00 UTC / 리밸런싱 월 09:00 UTC 이미 사용 중).
**웹 검색 수단 확인 필요**: 백엔드는 Anthropic API 직접 호출. 웹검색 도구 사용 가능 여부부터 확인.

### ③ 종목 분석 머릿글 일관성 — 전문가스러운 UI
**증상**: 분석 글 중 **어떤 문단은 머릿글(제목)이 없고**, 강점·Risk 등에는 있다 → 뒤죽박죽.
**할 일**: 모든 분석 섹션에 통일된 머릿글 체계 적용.
**제약**: `design.md` §"🟥 AGENT 필수 규칙" R1~R6 **강제**. 특히
- R1: 좌측 색 테두리(border-left accent) **절대 금지**. 의미는 제목 글자색/작은 라벨로만
- R6: 다문장 산문은 문장마다 줄바꿈(`breakSentences` + `whiteSpace: pre-line`)
- R5: 머지 전 self-check + **360~400px 폭 육안 확인**
**대상 파일**: `frontend/src/tabs/AllocationTab.jsx`(AI 전략 리포트), `tabs/ChartTab.jsx`(AI 심층 분석),
`components/HealthScoreCard.jsx`·`AlertsCard.jsx` 등. 백엔드 프롬프트에서 섹션 제목을 강제하는 쪽이
근본 해결일 수 있다(프롬프트 + 렌더 양쪽 확인).

### ④ 투자 나침반 — 유튜브/기사 기반 핵심 메시지 제안 기능 [설계 논의부터]
**오너 의도**: 유튜브에 매일 쏟아지는 AI 기술 동향·거시경제·빅테크 방향을 총망라해
**다온 앱에서 배너/기능으로 핵심 메시지·투자 기사를 제안**. "투자의 나침반/네비게이션",
투자를 놀이처럼 느끼며 끊임없이 학습 → 실제 투자 → 자산 증식.
**기존 자산**: `POST /api/youtube` 엔드포인트 존재(`YoutubeReq`: video_id·title·channel·api_key).
`knowledge/tech-radar` + `/tech-intake`·`tech-radar-auto` 스킬(기술동향 축적 파이프라인) 재사용 검토.
`docs/INCIDENT` 및 changelog 배너(`ChangelogModal`) = 인앱 공지 전달 경로 선례.
**먼저 할 일**: 구현 전에 **설계 안 2~3개를 비교표로 제시하고 오너 승인**.
논의 포인트 = 신뢰도(환각·클릭베이트 배제) / AI 비용 / 정보 과부하 방지 / 보유 종목과의 연결
(내 포트폴리오에 무슨 의미인지까지 이어져야 '나침반'이 된다).

### ⑤ 보안 취약점 점검 — 방법론 + 예상 점검 요소 + 영향도 종합 분석
**할 일**: 3자 검증 방식 vs 자체 검증 방식을 **나열·비교**하고, 예상 점검 요소와
**중요성·의미·RISK 발현 시 영향도**까지 종합 분석해 제시.
**활용 가능**: `/security-review` 스킬(현재 브랜치 변경분 보안 리뷰) — 우선 이걸 돌려볼 것.
**맥락(실제 위험 자산)**: 개인 금융 데이터(평가액·보유 종목·거래내역), 세션 토큰,
Anthropic API 키(서버 보관), VAPID 개인키, `cron_secret`, 데모 공개 체험,
Oracle 서버 SSH 키(`C:\Users\user\Downloads\oracle-key.key`), Cloudflare WAF 앞단.
과거 이력: 2026-06 "보안 감사·하드닝" 수행 기록 있음(DEVELOPMENT_LOG 참조) → 그 이후 변경분이 초점.

### ⚠️ 예약 실행에 대한 사실 확인 (오너 요청 "저녁 9시 실행")
**클라우드 예약(cron routine)으로는 이 5건을 실행할 수 없다.** 클라우드 에이전트는
Anthropic 클라우드에서 돌아 ① 로컬 리포(`C:\Users\user\AgentDev\daon`) ② 배포용 SSH 키
③ 운영 서버에 접근할 수 없다. 게다가 daon 리포는 [[github-account-lockout]]으로 GitHub 푸시가
막혀 있어 클라우드가 clone 할 원격도 없다. → **오너가 21시에 세션을 열고 이 블록을 지시하는 방식**
이 유일하게 동작하는 경로. (기존 클라우드 routine 은 웹검색 기반 데일리 브리핑처럼
리포·서버 접근이 불필요한 작업만 등록돼 있다.)

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

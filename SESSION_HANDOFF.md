# 세션 핸드오프 노트

> **새 CLI 세션은 이 파일부터 읽는다.** 아래 "복구 순서"가 세션 연속성의 정본.

> **2026-08-18 세션에서 오너 지시 5건 처리 완료.** 맨 위 세션 블록 + "다음 후보" 참조.

## 🔁 복구 순서 (CLI가 닫혔거나 새로 열었을 때)

1. `git status` · `git log --oneline -5` · `git rev-list --left-right --count origin/main...HEAD`
   → **미푸시 커밋 수**가 곧 "지난 세션이 어디까지 갔나". 작업트리가 dirty면 그게 중단 지점.
2. 이 파일의 **최신 세션 블록**(맨 위) 읽기 → 무엇을 했고 다음 후보가 뭔지.
3. [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) 최신 세션 항목 → 왜 그렇게 했는지(설계 근거·트레이드오프).
4. 배포 상태 확인: `backend/static/index.html`과 `sw.js`가 같은 번들 해시를 가리키는지 → 다르면 재빌드.
5. 재개 전 `git fetch && git merge origin/main` (다른 기기/CLI 작업분 클로버 방지).

**세션 종료 시 남길 것(다음 세션이 복구하는 근거)**: ① 이 파일 맨 위에 세션 블록 추가 ② DEVELOPMENT_LOG에 상세 ③ 로컬 커밋(+ 가능하면 `git push`) ④ 미결 항목을 "다음 후보"로 명시.
✅ **2026-08-18 GitHub 로그인 복구 — 밀린 18커밋 푸시 완료.** 원격 백업 정상.
⚠️ 단 **집현전(`knowledge/`)은 remote 미설정**(브랜치 master, origin 없음) — 여전히 로컬 사본뿐이다.
⚠️ 대화 원문(transcript)은 저장하지 않는다 — 토큰만 먹고 검색이 안 된다. **결론·근거·다음 할 일**만 위 3곳에 남긴다. 직전 대화 자체를 되살리려면 CLI에서 `claude --continue`(마지막 세션) / `claude --resume`(목록에서 선택).

---

## ✅ 세션 (2026-08-18) — 오너 지시 5건 전부 처리 + **GitHub 복구·18커밋 푸시**

**상태**: 커밋·푸시·**배포까지 완료**. pytest **169 통과** · vite build OK.
공개 도메인 검증 — 번들 해시 로컬=서버=daonwealth.com **3중 일치**(`index-CASTIi4Y.js`),
`main.py` sha 일치, 신규 엔드포인트 응답 확인(`/api/compass/signals` 401 ·
`/api/cron/refresh_holdings_analysis` 405, 없는 경로는 404).
사전 백업 `backup/daon-predeploy-20260818.db`(4.19MB) · integrity ok.

**GitHub 잠김 해소**: 2026-07-27부터 막혔던 푸시가 풀려 밀린 18커밋 일괄 push (`7df3c54..b2af7bf`).
이제 원격 백업이 다시 살아 있다. ⚠️ 단, **집현전(`knowledge/`)은 여전히 remote 자체가 없다**
(브랜치 master, origin 미설정) — 별도 판단 필요.

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
   명령에 `` 이 섞임. 파일은 올라갔는데 **서비스는 구 프로세스 유지**, 스크립트는
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

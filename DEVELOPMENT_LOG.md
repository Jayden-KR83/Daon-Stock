# 다온(Daon) 포트폴리오 앱 — 개발 로그

> 마지막 업데이트: **2026-06-12** (상용 배포 + 로드맵 4건 + 보안)
> 모델: claude-opus-4-8
> 서버: ubuntu@168.107.13.20 | 포트: 8501 (127.0.0.1 전용) · 공개: https://daonwealth.com
> 로컬: `C:\Users\user\Desktop\쿠든카피 주식앱\`

## 🆕 2026-06 세션 (상용화 + 로드맵 실행 + 보안)

**한 줄 요약**: 도메인·HTTPS 상용 배포 → Web Push·KR Fundamentals/Peers·모바일 스와이프·AI 주간 리밸런싱 로드맵 4건 → 가이드/여정 탭 최신화 → 보안 감사·하드닝. 문서·릴리스 반영 사이클 + 월간 클라우드 루틴 자동화.

- **도메인 + HTTPS 상용 배포**: daonwealth.com · Cloudflare(DNS/프록시) → nginx 리버스 프록시(443→8501) + Cloudflare Origin Cert(Full strict) · uvicorn `127.0.0.1` 바인딩(외부 직노출 차단). 설정: [deploy/](deploy/)
- **Web Push (V2)**: `push_subscriptions` 테이블 + VAPID 자동생성(`_get_vapid`) + `_send_push` + 엔드포인트 4종(`/api/push/public_key·subscribe·unsubscribe·test`) + `push-sw.js`(importScripts) + 알림벨 켜기/끄기·테스트 토글(`pushClient.js`). cron 알림 트리거 시 푸시 동반.
- **한국 종목 Fundamentals & Peers**: Naver 스크래핑 `_kr_fundamentals`(PER·PBR·ROE·시총·EPS·배당) + `_kr_peers`(동일업종비교). 프론트 게이트(`isUs`) KR 개방 + 통화 인식(₩ 조/억).
- **모바일 스와이프 탭 전환**: `useSwipeNav.js` — 좌우 스와이프로 인접 탭(BottomNav 순서). 차트 드래그·가로 스크롤·입력칸 충돌 가드. (풀투리프레시는 회귀 위험으로 보류)
- **AI 주간 리밸런싱**: `/api/cron/weekly_rebalance` + `_weekly_rebalance_for_user`(Haiku) → 인앱 알림 + 푸시. 서버 cron `0 9 * * 1`(월 KST 18시).
- **가이드 탭 최신화**: 탭명 전면 교체(포트폴리오·분석·종목·시장·등록·설정) + 가격알림/Web Push/배당/PWA/KR Valuation 추가.
- **여정 탭**: 로드맵 verdict 완료 4건 + 마일스톤 P30~P33 + 인프라(Cloudflare·nginx) 반영.
- **보안 감사(/security)**: 심각 0건. CORS `*`→daonwealth.com 제한, daon.db 644→600 즉시 조치. 중장기: 로그인 레이트리밋·관리자 2FA 권고.
- **운영 자동화**: 문서·릴리스 반영 사이클 문서화([docs/deployment.md](docs/deployment.md) 5.5) + 월간 릴리스 클라우드 루틴 등록(매월 1일 → 여정탭 PR).
- **캐시 워밍**: `daon-cache-warm.sh` cron(5분) — sector/kr·sector/us·heatmap 콜드(2~6초) 제거, 사용자 캐시 hit(~0.05초)만.
- **목표 기반 포트폴리오(GBI)**: `goals` 테이블 + `_project_goal`(결정론 중앙값+80% 밴드+달성확률) + `/api/goals` CRUD·project. `GoalsCard.jsx`(폼+Recharts fan+상태배지+권고+고지) → 분석 탭 NetWorth 아래. **새 탭 아님(발굴 탭과 충돌 회피)**. 격리 worktree에서 개발 후 발굴과 머지 배포.
- **신규 종목 발굴(GARP)**: 발굴 탭 + `/api/discover` + `discovery_scores` + GARP cron(다른 CLI 동시개발, 머지 통합).

## 🆕 2026-05-19 ~ 2026-05-21 세션 (대규모 업그레이드)
**자세한 내용**: [SESSION_2026-05-19.md](SESSION_2026-05-19.md)

**한 줄 요약**: 개인 앱 → 다중 사용자 가입 승인 + AI 권한 토글 + 동적 계좌 + Net Worth 추이 + Health Score + 룰 리밸런싱 + 상관관계 매트릭스 + 실적 캘린더 + 차트 비교 + 단축키 + Changelog + 자동 백업 cron + Puppeteer 회귀 테스트 시스템.

**신규 자산 (5/19 + 5/21 합산)**:
- 컴포넌트 18개 (Motion·시각화·관리·분석·UX)
- SQLite 테이블 7개 (`accounts`, `audit_log`, `strategy_cache`, `holding_notes`, `transactions`, `net_worth_snapshots`, `holding_pnl_snapshots`)
- API 40+ 신규
- 회귀 테스트 자동화 (`scripts/regression-test.js` — PASS ✅)
- 서버 cron job (매일 KST 04:00 daon.db 백업, 30일 보관)
- 인앱 Changelog 시스템 + 버전 단위 사용자 공지
- 백업 3개 (롤백 가능): `_backup/daon-pre-v2-`, `daon-pre-A-plan-`, `daon-pre-BCE-`

---

## 프로젝트 구조

```
쿠든카피 주식앱/
├── backend/
│   ├── main.py              ← FastAPI 서버 (28개 엔드포인트)
│   └── static/              ← Vite 빌드 산출물 (index.html + assets/)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          ← 루트 컴포넌트, 탭 라우팅
│   │   ├── store.js         ← Zustand 전역 상태
│   │   ├── api.js           ← Axios API 함수 모음
│   │   ├── App.css          ← 전역 스타일
│   │   ├── components/
│   │   │   ├── BottomNav.jsx / .css   ← 하단 10탭 네비게이션
│   │   │   ├── MarketBar.jsx          ← 상단 12개 지수 바
│   │   │   ├── LogoCircle.jsx         ← 종목 로고 원형 아이콘
│   │   │   └── Sparkline.jsx          ← 미니 스파크라인 차트
│   │   └── tabs/
│   │       ├── HoldingsTab.jsx        ← 보유 종목
│   │       ├── WatchlistTab.jsx       ← 관심 종목
│   │       ├── ExploreTab.jsx         ← 종목 탐색
│   │       ├── AllocationTab.jsx      ← 비중 분석 + AI 분석
│   │       ├── ChartTab.jsx           ← 캔들차트 + RSI + 실적
│   │       ├── TrendsTab.jsx          ← 트렌드 + 섹터 히트맵
│   │       ├── AddTab.jsx             ← 종목 추가
│   │       ├── ManageTab.jsx          ← 관리 (API Key, 데이터)
│   │       ├── GuideTab.jsx           ← 설명서
│   │       └── PresentationTab.jsx    ← 여정 탭
├── portfolio_data.json      ← 런타임 데이터 (절대 삭제 금지)
├── CLAUDE.md                ← AI 지침서
├── DEVELOPMENT_LOG.md       ← 이 파일
└── scripts/
    ├── deploy.ps1
    └── dev.ps1
```

---

## 탭 구성 (10개)

| 인덱스 | 아이콘 | 탭명 | 주요 기능 |
|--------|--------|------|-----------|
| 0 | 🏛️ | 보유 | 계좌별 종목 카드, 스파크라인, 클릭 → 차트이동 |
| 1 | 🔖 | 관심 | 관심종목 등록/삭제, 가격 조회 |
| 2 | 🧭 | 탐색 | 종목 검색, AI 분석, YouTube 분석 |
| 3 | ⚖️ | 비중 | 도넛차트, AI 포트폴리오 분석 (01~05) |
| 4 | 📊 | 차트 | SVG 캔들, MA20/60/120 실선, RSI, 거래량, 실적 |
| 5 | ⚡ | 트렌드 | 섹터 히트맵, 드릴다운 Top10, 거래량 순위 |
| 6 | 📌 | 추가 | 종목 수동 추가 |
| 7 | 🗂️ | 관리 | API Key 저장, 엑셀 업/다운로드, 종목 삭제 |
| 8 | 📋 | 설명서 | 탭별 사용 가이드 |
| 9 | 🗺️ | 여정 | 개발 히스토리, UI변천사, 통계, 마일스톤, 비교, 로드맵 |

---

## 핵심 아키텍처

### 상태 관리 (store.js — Zustand)
```js
{
  activeTab: 0,              // 현재 탭 인덱스
  chartTicker: null,         // 차트탭 표시 종목
  accFilter: '전체',         // 보유탭 계좌 필터
  viewMode: '평가액',        // 보유탭 뷰 모드
  sortOrder: '높은순',
  currencyMode: 'KRW',
  appMode: 'web',            // 'web' | 'app' (localStorage 유지)
  usdKrw: 1300,              // 환율 (서버에서 로드)
  anthropicKey: '',          // API Key (서버 portfolio_data.json에서 로드)
}
```

### API Key 흐름
- **저장**: `PUT /api/settings/apikey` → `portfolio_data.json`의 `settings.anthropic_key`
- **로드**: 앱 시작 시 `GET /api/settings/apikey` → Zustand store
- **사용**: 분석 요청 시 `req.api_key` 또는 백엔드 fallback `_stored_api_key()`
- **효과**: 모든 기기에서 한 번만 입력하면 영구 공유

### 캐시 TTL 정책 (backend/main.py)
| 함수 | TTL | 이유 |
|------|-----|------|
| get_market_data | 300s | 마켓 바 |
| get_us/kr_stock_data | 60s | 실시간성 |
| get_kr_stock_history | 1800s | 무거운 호출 |
| get_earnings_data | 3600s | 분기 데이터 |
| get_most_active_* | 1800s | 거래량 순위 |
| get_sector_performance | 1800s | 섹터 ETF |

---

## 누적 개발 내역 (최신 세션 기준)

### [세션 A] API Key 중앙화
- **변경 파일**: `store.js`, `App.jsx`, `api.js`, `ManageTab.jsx`, `backend/main.py`
- **내용**:
  - `store.js`: anthropicKey를 localStorage → 메모리 전용으로 변경
  - `App.jsx`: 앱 시작 시 `GET /api/settings/apikey`로 서버에서 자동 로드
  - `backend/main.py`: `GET/PUT /api/settings/apikey` 엔드포인트 추가
  - `ManageTab.jsx`: 저장 버튼 + 👁 show/hide 토글 추가 (중복 입력 방지)
  - analyze 엔드포인트 3개 모두 fallback `_stored_api_key()` 적용
- **버그 수정**: 오염된 키(중복 붙여넣기) 서버 API로 초기화 처리

### [세션 B] BottomNav 10탭 오버플로우 수정
- **변경 파일**: `BottomNav.css`, `BottomNav.jsx`
- **내용**:
  - `.bottom-nav`: `overflow-x: auto`, `scrollbar-width: none`
  - `.nav-btn`: `width: 62px; min-width: 62px` (고정 너비)
  - `useRef` 배열 + `scrollIntoView({ behavior: 'smooth', inline: 'center' })`
  - 이모지 세트: 🏛️🔖🧭⚖️📊⚡📌🗂️📋🗺️

### [세션 C] 트렌드탭 섹터 드릴다운
- **변경 파일**: `TrendsTab.jsx`, `backend/main.py`, `api.js`
- **내용**:
  - `US_SECTOR_TOP`, `KR_SECTOR_TOP` 딕셔너리 (11섹터 × 10종목) 하드코딩
  - `GET /api/sector/stocks/us/{sector}`, `GET /api/sector/stocks/kr/{sector}` 엔드포인트
  - 섹터 셀 클릭 → `selectedSector` 상태 → Top10 종목 애니메이션 패널
  - Yahoo Finance Screener 401 오류 → yfinance `download()` 대체
  - module-level `_onSectorClick` workaround (Recharts content prop 콜백 이슈)

### [세션 D] 종목 클릭 → 차트탭 이동
- **변경 파일**: `HoldingsTab.jsx`, `AllocationTab.jsx`
- **내용**:
  - `HoldingsTab`: 종목 행 클릭 → `setChartTicker(ticker)`
  - `AllocationTab`: 종목별 legend 클릭 → `setChartTicker(ticker)`
  - `store.js`: `setChartTicker: (tkr) => set({ chartTicker: tkr, activeTab: 4 })`

### [세션 E] PresentationTab (여정 탭) 전면 재구축
- **변경 파일**: `PresentationTab.jsx`
- **섹션 구성**: 개요 / UI변천사 / 통계 / 마일스톤 / 앱비교 / 로드맵
- **주요 내용**:
  - McKinsey 컨설팅 스타일 톤앤매너 (다크 Hero, 블루 accent bar, 대문자 레이블)
  - 기술 스택 5개 카테고리 분류 (Frontend/Backend/데이터수집/AI·분석/인프라)
  - UI 변천사: 가로 카드 5개 한눈에 비교 + 선택 시 상세 패널
  - 마일스톤: 날짜 제거 → Phase 1~12 단계 표기 (2026.02 시작 기준)
  - 앱 비교: 키움/토스/삼성/도미노/다온 5열 비교표
  - 로드맵: 예상 비용 / 개발 시간 / 고려 사항 3칸 메타 정보

### [세션 F] UI 세부 개선
- **HoldingsTab**: 📈 차트 / ✏️ 수정 버튼 제거 (행 클릭으로 대체)
- **AllocationTab**: AI 분석 레이블 `◈◇≋◉▷` → `01 02 03 04 05` 컨설팅 스타일
- **ChartTab**: MA20/60/120 점선 → 실선 (`strokeDasharray` 제거, `strokeWidth=1.8`)
- **ManageTab**: 섹션명 `🗃️ 데이터 관리`, API Key 저장 UI 개선
- **PresentationTab**: 어두운 배경 섹션 → 흰색 통일

### [세션 G] AI 분석 타임아웃 연장
- **변경 파일**: `api.js`, `backend/main.py`
- **내용**:
  - `analyzePortfolio` 타임아웃: 20s → **90s**
  - `analyzeStock`, `analyzeYoutube`: 20s → **60s**
  - 백엔드 Claude API `timeout=40` → **80s**, `timeout=30` → **60s**

---

## 디자인 시스템

```
배경:      #0B1120   카드:    #111C2D   테두리: #1E2D42
강세:      #00C48C   약세:    #FF5C5C   강조:   #0EA5E9
텍스트:    #E2E8F0   부가:    #94A3B8   어두운: #4B6080
차트배경:  #111C2D / #0D1829
폰트:      Inter (Google Fonts)
```

---

## 배포 명령어

```powershell
# 프론트엔드 빌드
cd "C:\Users\user\Desktop\쿠든카피 주식앱\frontend"
npm run build

# 서버 업로드 (JS 번들명은 빌드마다 변경됨)
scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "backend\static\index.html" `
  "backend\static\assets\index-XXXXXX.js" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/assets/

scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "backend\static\index.html" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/

# 백엔드 업로드 (main.py 수정 시)
scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "backend\main.py" `
  ubuntu@168.107.13.20:~/portfolio/backend/

# 서비스 재시작
ssh -i "C:\Users\user\Downloads\oracle-key.key" ubuntu@168.107.13.20 `
  "sudo systemctl restart portfolio"
```

---

## 다음 단계 계획

### Phase 13: 이메일 로그인/로그아웃 (완료 2026-03-30)

#### 목표
- 이메일 계정별로 개별 포트폴리오 데이터 관리
- 로그인/로그아웃 기능
- 계정별 `portfolio_data_{email}.json` 분리 저장

#### 구현 방향
1. **Backend**
   - `POST /api/auth/login` — 이메일 + 비밀번호 검증, JWT 토큰 발급
   - `POST /api/auth/logout` — 토큰 무효화
   - `GET /api/auth/me` — 현재 로그인 사용자 조회
   - `POST /api/auth/register` — 신규 계정 등록
   - 모든 portfolio 엔드포인트에 JWT 인증 미들웨어 적용
   - 사용자 DB: `users.json` 또는 SQLite

2. **Frontend**
   - `LoginPage.jsx` — 이메일/비밀번호 입력 폼
   - `store.js`: `currentUser`, `authToken` 상태 추가
   - 로그인 전: LoginPage 표시
   - 로그인 후: 기존 앱 표시
   - `ManageTab.jsx`: 로그아웃 버튼 추가

3. **데이터 분리**
   - `portfolio_data.json` → `portfolio_data_{user_id}.json` 또는 단일 파일 내 userId 키로 분리

#### 고려 사항
- 기존 `portfolio_data.json` 데이터 마이그레이션 필요
- JWT secret key 환경변수 처리
- 비밀번호 bcrypt 해싱
- 토큰 만료 처리 (자동 갱신 또는 재로그인 유도)

---

## 주요 버그 수정 이력

| 번호 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 1 | 한국 종목 ₩560억 오표시 | A005490을 미국 주식 오인 | 정규식 `^A?\d{6}$` |
| 2 | 캔들차트 무한 렌더링 | Recharts Customized 불안정 | 순수 SVG + ResizeObserver |
| 3 | 여정탭(10번째) 안 보임 | BottomNav 9등분 → 10탭 오버플로우 | overflow-x: auto, 62px 고정 |
| 4 | AI 분석 invalid x-api-key | API Key 중복 붙여넣기로 오염 | 서버 API로 초기화 + 👁 토글 |
| 5 | Yahoo Finance Screener 401 | Oracle 서버에서 인증 필요 | yfinance download() 대체 |
| 6 | index.html 누락 → 0.00% | JS만 업로드 | 배포 체크리스트에 index.html 추가 |
| 7 | AI 분석 timeout 20s 초과 | 종목 많을 때 Claude 응답 지연 | 90s/60s로 연장 |
| 8 | 시세 변동률 +25~+40% 비정상 | `_chart_to_price`가 `chartPreviousClose`(=1개월 전 종가) 사용 | `closes[-2]` (직전 거래일 종가) 우선 사용 |
| 9 | 다크모드 상단 바 흰색 잔존 | TopNavBar 배경 `rgba(248,250,252,.85)` 하드코딩 | `var(--clr-bg)` 사용, 라이트 테마만 투명도 유지 |
| 10 | 한국 종목 로고 폴백 색상만 표시 | Naver/Daum 기존 URL이 404 응답 | Toss CDN(`static.toss.im`) + Alphasquare(`file.alphasquare.co.kr`)로 교체 |
| 11 | AI 분석 결과 영문 사고과정 노출 | max_tokens=4096 부족 + 첫 `{...}` 매칭 실패 | Sonnet 4.6 + 8192 tokens + **마지막 text 블록** 우선 추출, JSON 파싱 실패 시 502 에러 |
| 12 | 모바일에서 웹 모드 UI 압축 | 데스크톱 사이드바·우측패널 강제 표시 | `window.innerWidth < 768`이면 앱 레이아웃 강제 |
| 13 | NVDA 클릭 시 빈 검정 화면 | **TDZ 위반** — `portfolioReady = !!portfolio`를 portfolio 선언(line 482)보다 50줄 앞(line 432)에서 사용 | useEffect 블록을 portfolio 선언 뒤로 이동 |

---

## 2026-05-10 세션 — UI/UX 대규모 개선

### 1. 한국 종목 로고 (`LogoCircle.jsx`)
- 6자리 코드 추출 후 **Toss CDN 1차 → Alphasquare 2차 → 색상 배지**
- `https://static.toss.im/png-icons/securities/icn-sec-fill-{code}.png`
- `https://file.alphasquare.co.kr/media/images/stock_logo/kr/{code}.png`
- 005380(현대차), 005930(삼성전자), 035720(카카오), 035420(네이버) 모두 200 OK 검증

### 2. TrendsTab 토글 정리
- 중복 US/KR 토글 1개로 통일 (Market Performance 카드 헤더)
- 기능 없던 1D/1W/1M/1Y/ALL 범위 토글 완전 삭제

### 3. 보유 탭 프라이버시 양방향 토글
- hero 카드 우측 상단 eye-icon 버튼 (가림↔표시)
- 본문 클릭으로도 가림 → 표시 가능 (단방향)
- localStorage 저장 제거 → 새로고침 시 항상 가림 상태로 복귀

### 4. 3-모드 테마 시스템
- **Light** (☀️ 화이트, 기본) / **Dark** (🌙) / **Pro** (📈 GitHub Dark + Bloomberg)
- `:root[data-theme='...']` 어트리뷰트 셀렉터로 60+ CSS 변수 일괄 오버라이드
- 인라인 하드코딩 색상 약 200개를 `var(--clr-...)`로 일괄 변환
- 접근: 관리 탭의 테마 카드 + 앱/웹 모드 우측 상단 빠른 토글

### 5. UI 잘림 방지
- `hero-value` 폰트 `clamp(22px, 8vw, 36px)` 반응형
- 좁은 화면(<480, <380, <340px)별 padding/font 단계 축소
- 모든 카드 `max-width: 100%; box-sizing: border-box`
- 모바일 자동 앱 레이아웃 (`<768px`)

### 6. 차트 시간 스케일 + 드래그 줌 (`ChartTab.jsx`)
- D/W/M 토글 — `aggregateOHLC()`로 일/주/월봉 집계
  - 주봉: ISO 주차(월요일 시작)
  - 월봉: YYYY-MM
  - 거래량 합산, high/low 구간 max/min
- SVG 마우스 드래그로 영역 선택 → 줌 인
- 더블클릭 또는 헤더 "↺ 줌 리셋" 버튼으로 복원

### 7. AI 분석 대폭 확장 (`backend/main.py` + `ChartTab.jsx`)
**모델**: Haiku 4.5 → **Sonnet 4.6** + Anthropic `web_search_20250305` (max_uses=4)

**컨텍스트 강화**:
- 가격, 펀더멘털(P/E, ROE, 매출 등), Yahoo 애널리스트 컨센서스, 최근 뉴스 5개

**새 응답 스키마**:
- `recommendation`, `priceTarget`, `summary`
- `company_overview` — 회사 동향·신사업·미래 전략
- `earnings_ir` — 분기 실적·CEO 발언·가이던스
- `catalysts_short` / `catalysts_medium` — 정량 단기/중기 호재
- `backlog` — 수주 잔고·RPO
- `analyst_views` — 최근 애널리스트 보고서 요약
- `bull` / `bear` / `verdict`
- `sources` — 클릭 가능한 출처 URL 리스트 (web_search 인용 자동 추출)

**캐시 메타데이터 + 미리보기**:
- `GET /api/stock/{ticker}/analyze/cached` — 캐시 조회 전용 (분석 트리거 X)
- `POST /analyze`에 `force_refresh: bool` 파라미터
- 응답에 `_cached`, `_computed_at` (epoch) 포함
- 프론트: 종목 진입 시 캐시 자동 fetch → 즉시 표시 + "마지막 분석: 3시간 전 · ↻ 최신 정보로 업데이트" 버튼
- 업데이트 클릭 시 confirm 다이얼로그

**한국어 강제**:
- 시스템 프롬프트: "ALL field values 한국어, no preamble, no markdown fence"
- 마지막 text 블록 우선 추출 (web_search 사고과정 텍스트 무시)
- JSON 파싱 실패 시 502 반환 (영문 raw 텍스트 캐시 오염 방지)

**프론트 UI**:
- `AiStockResult` 컴포넌트를 6개 접고-펼치는 섹션 카드로 분리
- 출처 섹션 — 도메인별 클릭 가능한 링크 (새 탭)
- axios timeout 60s → 200s

### 8. 백엔드 일간 변동률 정상화
- `_chart_to_price`에서 `chartPreviousClose` 우선 사용 → `closes[-2]` 우선 사용
- NVDA: +25.05% (월간 누적) → +0.5% (정상 일간)
- KOSPI/S&P500/모든 종목 정상화

### 9. PWA 캐시 + 모바일 자동 전환
- 모바일(<768px)에서 사용자 설정 무관하게 앱 레이아웃 강제
- 모바일에서 웹 모드 전환 버튼 숨김

---

## 2026-05-10 인시던트 — TDZ 무한 루프 → 빈 화면

**1차 증상**: NVDA 클릭 시 페이지 freeze. 1차 수정: useEffect deps에 `portfolio` 객체 → `portfolioReady` boolean으로 변경.

**2차 증상 (빈 화면)**: 시크릿 모드에서도 본문이 빈 검정. 백엔드 정상, sha 일치, sw.js 정상.

**근본 원인**: ChartTab 컴포넌트 내 변수 사용 순서 위반.
```js
const portfolioReady = !!portfolio   // line 432 — portfolio 사용
...
const { data: portfolio } = useQuery(...)  // line 482 — portfolio 선언 (50줄 늦음)
```

JavaScript `const`의 TDZ로 ReferenceError → React mount 실패 → 빈 화면. **빌드 통과** (esbuild는 동일 함수 내 변수 사용 순서 검사 안 함).

**해결**: cache fetch useEffect 블록을 portfolio 선언 뒤로 이동.

**교훈 → 자체 테스트 체크리스트 강화**:
1. 빌드 성공
2. 백엔드 syntax (`python3 -m py_compile`)
3. **변수 선언 순서 정적 검사** (TDZ 방지)
4. **useEffect deps에 객체/배열 참조 0건** (무한 루프 방지)
5. 배포 후 systemd `is-active`
6. 핵심 endpoint 헬스체크 (200 응답 시간)
7. journalctl 에러 0건
8. **로컬-서버 sha 일치** (배포 무결성)
9. **sw.js precache가 새 번들 참조** (PWA 업데이트)

---

## 2026-05-10 세션 변경 파일

| 파일 | 변경 |
|------|------|
| `backend/main.py` | `_chart_to_price` 일간 변동률, `_call_claude_with_search` 추가, `analyze_stock` 재작성, `/analyze/cached` 신규 |
| `frontend/src/store.js` | `theme` 상태(localStorage) + `cycleTheme` |
| `frontend/src/tokens.css` | `[data-theme='dark/pro']` 변수 오버라이드 + 인라인 셀렉터 보정 |
| `frontend/src/App.jsx` | 모바일 자동 감지(`isMobile`), 테마 적용 useEffect, ThemeQuickToggle |
| `frontend/src/App.css` | hero-value 반응형, 잘림 방지, 테마 보정 |
| `frontend/src/api.js` | `getCachedAnalysis`, `analyzeStock` timeout 200s |
| `frontend/src/components/LogoCircle.jsx` | Toss + Alphasquare 폴백 |
| `frontend/src/components/TopNavBar.jsx` + `.css` | 다크 모드 보정, 테마 빠른 토글 버튼 |
| `frontend/src/components/BottomNav.css` | 좁은 화면 라벨 잘림 방지 |
| `frontend/src/tabs/HoldingsTab.jsx` | 프라이버시 양방향 토글, 클릭 reveal, 한글 종목명 ellipsis |
| `frontend/src/tabs/TrendsTab.jsx` | 중복 토글 + 1D/1W/1M/1Y/ALL 제거 |
| `frontend/src/tabs/ChartTab.jsx` + `.css` | D/W/M, 드래그 줌, AI 분석 6개 섹션, 캐시 자동 fetch + 업데이트 버튼 |
| `frontend/src/tabs/ManageTab.jsx` | ThemeToggleCard 추가 |
| `frontend/src/tabs/AddTab.jsx`, `LoginPage.jsx`, `WatchlistTab.jsx`, `AllocationTab.jsx`, `GuideTab.jsx`, `PresentationTab.jsx`, `components/InstallPrompt.jsx`, `RightPanel.jsx` | 인라인 색상 → CSS 변수 일괄 변환 (테마 호환성) |

---

## 다음 세션 예정

**목표**: UI 모션 추가 (현재 정적 UI 개선)

**참고 리소스**:
- [21st.dev](https://21st.dev) — React 컴포넌트 컬렉션 (Magic UI, motion-primitives 등)
- `framer-motion` 또는 `motion` (Framer Motion 후속) 라이브러리
- 후보 작업 영역:
  - 탭 전환 트랜지션 (페이드/슬라이드)
  - 카드 등장 애니메이션 (stagger)
  - 숫자 카운트업 (hero-value, 손익 표시)
  - 차트 진입 애니메이션
  - 마우스 호버 마이크로 인터랙션
  - 페이지 전환 시 skeleton → content 페이드

**현재 적용된 애니메이션**:
- `flashUp/flashDn` 가격 변경 플래시 (tokens.css)
- `shimmer` 스켈레톤
- `rpPulse` 라이브 도트
- `slideUp` BottomNav 더보기 시트
- `transform: translateY(-1px)` 카드 hover


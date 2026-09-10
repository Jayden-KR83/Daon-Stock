import React, { useState } from 'react'

/* ─── 데이터 ─── */
const SECTIONS = ['개요', 'UI 변천사', '통계', '마일스톤', '앱 비교', '로드맵']

const FIRST_PROMPT = `"나는 미국·한국 주식을 동시에 보유하고 있는 개인 투자자야.
키움, 토스증권 앱을 쓰는데 내 포트폴리오 전체를 한눈에 보는 앱이 없어.
미국(USD)과 한국(KRW) 계좌를 합쳐서 총 평가액을 보여주고,
종목별 수익률, 섹터 비중, 차트를 한 화면에서 볼 수 있는
나만의 주식 앱을 Claude Code로 만들어줘.

조건:
- 미국 주식: yfinance API
- 한국 주식: 네이버 파이낸스
- 계좌: 미국·퇴직연금·개별주식·ISA 4가지 분리
- 데이터 저장: 로컬 JSON
- 배포: Oracle Cloud VM"`

/* 기술 스택 — 역할별 카테고리 */
const TECH_STACK = [
  { category: 'Frontend', items: [
    { name: 'React 18 + Vite',     role: '컴포넌트 기반 UI 렌더링 & 빌드 번들링' },
    { name: 'TanStack Query v5',   role: '서버 데이터 캐싱·동기화 (staleTime 관리)' },
    { name: 'Zustand',             role: '전역 상태 관리 (탭 네비게이션, API 키, 환율)' },
    { name: 'Recharts + SVG',      role: '섹터 히트맵 Treemap, 커스텀 캔들차트' },
  ]},
  { category: 'Backend', items: [
    { name: 'FastAPI',  role: 'REST API 서버, 60+ 엔드포인트, TTL 캐싱' },
    { name: 'Uvicorn',  role: 'ASGI 비동기 서버, systemd 서비스로 24/7 운영' },
  ]},
  { category: '데이터 수집', items: [
    { name: 'yfinance',       role: '미국 주식 실시간 시세, 캔들 히스토리, Valuation' },
    { name: 'Naver Finance',  role: '한국 주식 실시간 현재가 스크래핑 (BeautifulSoup)' },
    { name: 'SheetJS (Excel)', role: '포트폴리오 엑셀 업로드·다운로드 (XLSX 파싱)' },
  ]},
  { category: 'AI & 분석', items: [
    { name: 'Claude Sonnet 4.6', role: '종목 심층 분석 + web_search (max_uses=4, 24h 캐시)' },
    { name: 'Claude Haiku 4.5',  role: '포트폴리오 진단·전략 리포트 (Sonnet 대비 10배 저렴)' },
  ]},
  { category: '인프라', items: [
    { name: 'Oracle Cloud VM',  role: 'Always Free Tier ARM 인스턴스, 24/7 무중단 운영' },
    { name: 'systemd + cron',   role: '서비스 + 일별 백업 + 자동 스냅샷 + OOM swap 보호' },
    { name: 'Cloudflare',       role: 'daonwealth.com DNS · 프록시(WAF/DDoS 방어) · 엣지 HTTPS' },
    { name: 'nginx + Origin SSL', role: '리버스 프록시(443→8501) · Origin 인증서 Full strict 암호화' },
  ]},
]

/* UI 변천사 — 모든 색상은 그레이 스케일 (강조 색 X) */
const UI_PHASES = [
  { version: 'v0.1', label: 'Streamlit MVP',
    stack: 'Python · Streamlit', lines: '120줄', tabs: 1, features: 3,
    keyChange: '최초 동작하는 버전',
    desc: 'yfinance로 미국 주식 5종목 단순 테이블. 한국 주식 없음, 단일 계좌.',
    ui: [
      { label: '테이블 (종목|가격|수익률)', h: 36 },
      { label: '(사이드바: 종목 입력)',     h: 20 },
    ]},
  { version: 'v0.5', label: '멀티 계좌 & 한국',
    stack: 'Python · Streamlit · BeautifulSoup', lines: '480줄', tabs: 4, features: 8,
    keyChange: 'Naver Finance 스크래핑 도입',
    desc: '4계좌 분리. 한국 실시간 주가 연동. Plotly 캔들차트 첫 도입.',
    ui: [
      { label: '미국 | 퇴직 | 개별 | ISA', h: 18 },
      { label: '테이블 (종목|현재가|수익률)', h: 36 },
      { label: '캔들차트 (Plotly)', h: 32 },
    ]},
  { version: 'v1.0', label: 'React + FastAPI',
    stack: 'React 18 · FastAPI · Vite', lines: '2,100줄', tabs: 7, features: 18,
    keyChange: 'Streamlit 한계 극복 → 프로그래밍 탭 전환',
    desc: '완전 재구축. 마켓 인덱스 바, 스파크라인, 하단 네비게이션, 모바일 PWA.',
    ui: [
      { label: 'S&P · Dow · Nasdaq · VIX · KOSPI · BTC · Gold', h: 16 },
      { label: '보유 카드 (로고 · 티커 · 스파크라인 · 평가액)', h: 44 },
      { label: '보유 · 관심 · 비중 · 차트 ···', h: 18 },
    ]},
  { version: 'v1.5', label: 'AI & 트렌드',
    stack: 'Claude API · Recharts Treemap', lines: '3,600줄', tabs: 9, features: 26,
    keyChange: 'Claude AI 분석 + 섹터 히트맵',
    desc: 'Anthropic API 포트폴리오 진단. S&P500·KOSPI 섹터 히트맵·드릴다운.',
    ui: [
      { label: '히트맵 Treemap — 섹터 클릭 → Top10', h: 36 },
      { label: 'AI 포트폴리오 분석 → 진단·리스크·리밸런싱', h: 26 },
      { label: '다온 AI 전략 리포트 (Sonnet → Haiku)', h: 22 },
    ]},
  { version: 'v2.0', label: 'Yahoo Finance 스타일',
    stack: '순수 SVG · Earnings Trends · 5Y 차트', lines: '4,800줄', tabs: 9, features: 40,
    keyChange: 'SVG Earnings Trends · 5Y 메인차트 · EPS 컨센서스',
    desc: 'Yahoo Finance 스타일 EPS·매출 차트. 5년 캔들차트.',
    ui: [
      { label: 'MarketBar 11종 지수 + 환율 + 10Y 국채', h: 16 },
      { label: 'SVG 캔들 1M~5Y · MA20/60/120 · RSI · 거래량', h: 48 },
      { label: 'EPS Estimate/Actual · Revenue vs Earnings', h: 30 },
    ]},
  { version: 'v2.5', label: '다국어·관리자·개인화',
    stack: 'SQLite 멀티유저 · admin 잠금 · KR 한글명', lines: '6,400줄', tabs: 9, features: 55,
    keyChange: '관리자 모드 + KR 한글명 전역 + 닉네임',
    desc: '관리자 암호로 API Key·사용자 목록 보호. 한국 종목 한글명. 자동 백업/원복.',
    ui: [
      { label: 'MarketBar · 보유 pills 드래그 · DAON 로고 홈', h: 16 },
      { label: '실적 추이 · EPS · 매출 vs 영업이익 한글화', h: 32 },
      { label: '관리자 모드 (1h 자동 잠금) · 닉네임 · 백업/원복', h: 20 },
    ]},
  { version: 'v3.0', label: '다중 사용자 + 동적 계좌',
    stack: 'pending 가입 승인 · ai_enabled 토글', lines: '9,000줄', tabs: 10, features: 70,
    keyChange: '가입 승인 흐름 + 동적 계좌 + AI 권한 게이트',
    desc: '신규 가입자는 pending → admin 승인 후 사용. AI 분석 사용자별 토글.',
    ui: [
      { label: '관리자 탭: 사용자 관리 + 사용 현황 + 활동 로그', h: 28 },
      { label: '동적 계좌 (9종 통화) · 가입 승인/거부/정지', h: 24 },
      { label: 'AI 비용 게이트 — 사용자별 ai_enabled 토글', h: 20 },
    ]},
  { version: 'v3.2', label: '거래내역·메모·백테스트',
    stack: 'FIFO 실현손익 · Motion 12', lines: '10,200줄', tabs: 10, features: 81,
    keyChange: '거래내역 + 종목별 메모 + 백테스트 (3M~5Y)',
    desc: '차트 탭 거래내역 (FIFO 실현손익). 보유 카드 메모. 한·미 ETF 비교.',
    ui: [
      { label: '거래내역 + FIFO 평균단가·실현손익·누적비용', h: 26 },
      { label: 'Apple Stocks 풍 hero + NumberTicker', h: 22 },
      { label: '백테스트 (Area 차트 + MDD·변동성·샤프)', h: 20 },
    ]},
  { version: 'v3.5', label: '데이터 누적 + 자동화',
    stack: 'Net Worth · Health Score · Puppeteer', lines: '11,500줄', tabs: 10, features: 92,
    keyChange: '매일 자동 자산 추이 + Health Score + 룰 경고',
    desc: '서버 cron이 매일 KST 17:00 평가액 스냅샷. Health Score (S/A/B/C/D). 룰 경고. Puppeteer 회귀.',
    ui: [
      { label: 'Net Worth 일별 추이 (Area + 1M~ALL)', h: 28 },
      { label: 'Portfolio Health Score (4지표 분해)', h: 22 },
      { label: '룰 경고 + 자동 백업 cron + Puppeteer 회귀', h: 20 },
    ]},
  { version: 'v3.8', label: '분석·UX·자동화 통합',
    stack: '실적 캘린더 · 차트 비교 · 단축키', lines: '12,800줄', tabs: 10, features: 100,
    keyChange: '11개 신규 기능 일괄 — 분석 도구 + UX 폴리시',
    desc: '실적 캘린더 · 차트 비교 모드 · 단축키 (1-5 / / ?) · 관심그룹 · 최근검색 · OS auto theme · OOM swap.',
    ui: [
      { label: '실적 캘린더 + 차트 비교 모드', h: 28 },
      { label: '단축키 · 관심그룹 · 최근검색 · auto theme', h: 22 },
      { label: 'swap 1GB + systemd memory limits · 회귀 PASS', h: 20 },
    ]},
  { version: 'v4.0', label: '디자인 시스템 정비',
    stack: 'design.md · 무채색 + 단일 액센트', lines: '13,000+', tabs: 10, features: 105,
    keyChange: '직사각형 + 글자색 강조만 + 인포그래픽',
    desc: 'AI 티 나는 박스 디자인 완전 제거. mono-card + 좌측 머리글 + 그룹핑된 경고 + Top 비중 stacked bar 인포그래픽.',
    ui: [
      { label: 'PortfolioSummaryBanner — Top 5 stacked bar', h: 28 },
      { label: 'AlertsCard 그룹핑 + compact + sev-dot 제거', h: 22 },
      { label: '탭 명: 포트폴리오·분석·종목·시장·등록·설정·가이드', h: 20 },
    ]},
  { version: 'v4.5', label: '신규 종목 발굴 + 목표기반',
    stack: 'GARP 멀티팩터 · 레이더 인포그래픽', lines: '13,900+', tabs: 11, features: 113,
    keyChange: '5요소 정량 스크리너 + 학술 검증(deep-research) 반영',
    desc: 'GARP 발굴 탭 — 저평가·성장성·안정성·상승세·기대 5요소 점수화, 매일 자동 스캔, 행 클릭 시 레이더+밸류(목표가·상승여력·PER·순이익률) 상세. 목표 기반 포트폴리오 통합.',
    ui: [
      { label: '발굴: 5요소 레이더 + 목표가·상승여력·PER 상세', h: 28 },
      { label: '시장별 차등가중(한국 모멘텀↓)·섹터중립·포워드테스트 아카이빙', h: 22 },
      { label: '탭 11개(발굴 추가) · 일배치 공용 캐시(AI 비용 0)', h: 20 },
    ]},
  { version: 'v4.6', label: '발굴 퀀트·AI 하이브리드 (현재)',
    stack: 'GARP + 저점발굴 + 퀀트·AI 융합', lines: '14,200+', tabs: 11, features: 118,
    keyChange: '저점발굴 모드 + AI 인라인 화해 + 위성 한도 경고 (Gemini 3·4차 반영)',
    desc: '저점발굴(적자 AI·바이오 혁신주 전용: 변형밸류 PSR÷R&D·파이프라인·바닥다지기·생존력) 신설 + AI 심층 분석 인라인 자동표시(무과금) + 정량점수 옆 AI 의견 배지·임상 이벤트 플래그로 퀀트-AI 화해 + 고위험 위성 5% 한도 자동 경고.',
    ui: [
      { label: '저점발굴: 변형밸류(PSR÷R&D)·파이프라인·바닥다지기·생존력', h: 28 },
      { label: 'AI 의견 배지 + 임상 이벤트 ⚠ 플래그 (퀀트-AI 화해)', h: 22 },
      { label: '위성 5% 한도 경고 · design.md R6(문장 줄바꿈) 규칙화', h: 20 },
    ]},
]

const STATS = [
  { label: '총 코드 라인',    value: '13,000+', sub: 'Frontend 9,900 + Backend 3,100' },
  { label: 'React 컴포넌트',  value: '30+',     sub: '10개 탭 + 20+ 공통 컴포넌트' },
  { label: 'API 엔드포인트',  value: '60+',     sub: 'FastAPI 라우트 기준' },
  { label: '마켓 지수',       value: '12',      sub: 'S&P·Dow·Nasdaq·VIX·Russell·KOSPI 외' },
  { label: '앱 탭',          value: '10',      sub: '관리자 탭 신규 추가' },
  { label: '계좌 유형',       value: '동적',    sub: '사용자별 추가 (9종 통화 지원)' },
  { label: '개발 세션',       value: '60+',     sub: 'Claude Code 대화 세션 누적' },
  { label: '오류 수정',       value: '100+',    sub: '주요 버그 픽스 누적 건수' },
  { label: '개발 기간',       value: '5개월',   sub: '2026.02 → 2026.06' },
  { label: 'AI 모델',        value: '2종',     sub: 'Sonnet 4.6 (심층) + Haiku 4.5 (전략)' },
  { label: '배포 환경',       value: 'Live',    sub: 'daonwealth.com · Cloudflare HTTPS' },
  { label: '회귀 테스트',     value: 'PASS',    sub: 'Puppeteer 자동 회귀 시스템' },
]

const MILESTONES = [
  { phase: 'P1',  label: 'MVP 완성',          desc: 'Streamlit 첫 버전 로컬 실행 성공. yfinance로 미국 주식 5종목 조회.', done: true },
  { phase: 'P2',  label: 'Oracle Cloud 배포', desc: 'VM 인스턴스 · systemd · 외부 접속 확보.', done: true },
  { phase: 'P3',  label: '한국 주식 & 멀티 계좌', desc: 'Naver Finance 스크래핑, 4개 계좌, 원/달러 환산.', done: true },
  { phase: 'P4',  label: 'A-prefix 버그 수정', desc: 'A005490(POSCO) 오인식 → 정규식 ^A?\\d{6}$ 수정.', done: true },
  { phase: 'P5',  label: 'React + FastAPI 전환', desc: 'Streamlit 탭 한계 극복. 완전 재구축.', done: true },
  { phase: 'P6',  label: '마켓 바 & 스파크라인', desc: '상단 실시간 지수 바 · 모바일 반응형.', done: true },
  { phase: 'P7',  label: '섹터 히트맵',         desc: 'Recharts Treemap S&P500·KOSPI.', done: true },
  { phase: 'P8',  label: 'Claude AI 분석 연동',  desc: 'Anthropic API 포트폴리오 진단.', done: true },
  { phase: 'P9',  label: 'SVG 캔들차트 영구 픽스', desc: 'Recharts 불안정 → ResizeObserver SVG.', done: true },
  { phase: 'P10', label: 'Valuation & Peers',  desc: 'Yahoo Finance Valuation · Peers 비교.', done: true },
  { phase: 'P11', label: '인증 · 멀티 유저 · SQLite', desc: 'PBKDF2 · 30일 세션 · daon.db.', done: true },
  { phase: 'P12', label: 'AI 비용 절감',         desc: 'Sonnet → Haiku 10배↓. 24h 캐시.', done: true },
  { phase: 'P13', label: 'Yahoo 스타일 Earnings', desc: 'SVG EPS 컨센서스 + Revenue vs Earnings.', done: true },
  { phase: 'P14', label: '메인차트 5Y 확장',      desc: '1M/3M/6M/1Y/2Y/5Y 토글.', done: true },
  { phase: 'P15', label: 'KR 데이터 품질',        desc: 'KR 스파크라인 · 한글 뉴스 · 52주 고저.', done: true },
  { phase: 'P16', label: '관심종목 전면 개선',     desc: '검색/추가 UI · 우측 패널 정리.', done: true },
  { phase: 'P17', label: '닉네임 & 사용자 관리',   desc: 'users.nickname · PUT /auth/profile.', done: true },
  { phase: 'P18', label: '자동 백업 & 원복',      desc: '엑셀 업로드 직전 스냅샷 · 원클릭 원복.', done: true },
  { phase: 'P19', label: '관리자 모드 (절대 권한)', desc: 'admin 암호 분리 · 1시간 자동 잠금.', done: true },
  { phase: 'P20', label: 'KR 한글명 & 재무 한글화', desc: '005380→현대차. 실적 추이 한글화.', done: true },
  { phase: 'P21', label: '다중 사용자 + 동적 계좌', desc: 'pending 가입 승인 · accounts 테이블.', done: true },
  { phase: 'P22', label: '거래내역·메모·백테스트',  desc: 'FIFO · Motion 12 · 21st.dev.', done: true },
  { phase: 'P23', label: 'Net Worth + Health Score', desc: '자동 스냅샷 + 0-100 등급.', done: true },
  { phase: 'P24', label: '디자인 시스템 정비',     desc: 'design.md · 무채색 + 직사각형 + 글자색 강조만.', done: true },
  { phase: 'P25', label: 'PWA 설치 & 오프라인',    desc: 'vite-plugin-pwa · manifest + 192/512 아이콘 + workbox runtime cache · InstallPrompt UI.', done: true },
  { phase: 'P26', label: '가격 알림 (V1 인앱)',    desc: '목표가·손절가 등록 → 서버 cron 5분 간격 체크 → 알림 벨 + 미확인 카운트. Web Push는 도메인 후 V2.', done: true },
  { phase: 'P27', label: '배당금 이력 & 캘린더',   desc: 'yfinance dividends 기반 24개월 이력 + 연간 예상 + 다가오는 ex-date. 분석 탭 임베드.', done: true },
  { phase: 'P28', label: 'JS 번들 코드 스플릿',   desc: 'manualChunks(vendor 분리) + 탭별 React.lazy(). 초기 번들 192KB(gzip)로 축소.', done: true },
  { phase: 'P29', label: 'KR 가격 이중화',        desc: 'Naver 1차 → yfinance .KS/.KQ 2차 → 30분 stale-while-revalidate 3차. 한국 종목 안정성 확보.', done: true },
  { phase: 'P30', label: '도메인 + HTTPS 상용 배포', desc: 'daonwealth.com 등록 · Cloudflare DNS/프록시 · nginx 리버스 프록시 + Origin 인증서(Full strict) · 8501 내부 잠금. 누구나 https로 안전하게 접속.', done: true },
  { phase: 'P31', label: 'Web Push 알림 (V2)',    desc: 'VAPID + service-worker push로 브라우저 종료 시에도 OS 알림 도달. 알림 벨 켜기/끄기·테스트 토글 + cron 푸시 발송.', done: true },
  { phase: 'P32', label: '한국 종목 Fundamentals & Peers', desc: 'Naver 스크래핑으로 KR PER·PBR·ROE·시총·EPS·배당 + 동일업종비교. 종목 탭 게이트(isUs) KR 개방.', done: true },
  { phase: 'P33', label: '모바일 스와이프 + AI 주간 리밸런싱', desc: '좌우 스와이프 탭 전환(충돌 가드) + 매주 월요일 Haiku 리밸런싱 리포트 자동 발송(cron + 푸시).', done: true },
  { phase: 'P34', label: '분석 리포트 데이터 정합성', desc: '전략 캐시 지문에 수량·평단·현재가 포함 + verified_facts를 백엔드 실시간 시세로 직접 산출(평단가 폴백 방지) + 프롬프트 변수 바인딩 + 절세 스코프(US/KR 과세권 분리). 상단 표와 AI 본문 수치 일치.', done: true },
  { phase: 'P35', label: '분석 탭 안정화 & 3단 재배치', desc: '병렬 조회 타임아웃 격리(배당·Health·전략 셧다운 방지) + 전략 리포트 비동기화(Cloudflare 524 해소·폴링) + 리스크 진단 카드(심각도 배지·design.md R1 준수) + 스냅샷/리스크/액션 3장 구조.', done: true },
  { phase: 'P36', label: '목표 기반 고도화 & 한국 펀드 대응', desc: '목표 달성 필요 수익률(CAGR) 역산 + 산정 근거·방법론(로그정규·Betterment·Kasten) + 수동 기준가(시세 미조회 펀드) + 분기 배당 히스토그램(YY/NQ) + 저점발굴 시계열 매칭.', done: true },
  { phase: 'P37', label: '발굴 엔진 고도화 — 저점발굴 + 퀀트·AI 하이브리드', desc: '저점발굴 모드(적자 AI·바이오 혁신주 전용: 변형밸류 PSR÷R&D·파이프라인·바닥다지기·런웨이, 임상 바이오 1.5년 런웨이 게이트) + Gemini 3·4차 제3자 검증 정밀화(mod_val 캡 순서 버그 수정·조선 섹터 분리·KR ETF 형평성) + AI 심층 분석 인라인 자동표시(무과금 공용 캐시) + 정량점수 옆 AI 의견 배지·임상 이벤트 리스크 플래그(퀀트-AI 화해) + 고위험 위성 5% 한도 자동 경고. design.md R6(다문장 산문 문장별 줄바꿈) 규칙화.', done: true },
  { phase: 'P38', label: '보안 기반 정비', desc: '백업 공개키 암호화(개인키는 오너 PC — 서버가 털려도 과거 스냅샷 불가독) + gitleaks 전체 히스토리 스캔(실제 시크릿 0건) + CI 차단 게이트(gitleaks·bandit). 백업 권한 664→600.', done: true },
  { phase: 'P39', label: '온보딩 투어 & 예수금', desc: '최초 로그인 시 실제 화면을 짚어가는 10단계 코치마크(보유 0개면 첫 종목 추가 안내로 자동 전환). 계좌별 예수금 입력 → 총자산·현금 비중 반영(손익률은 주식 기준 유지).', done: true },
  { phase: 'P40', label: '분석 탭 재편 & 계좌 단위 진단', desc: '카드 삭제 2(백테스트·매크로)·분리 1(저점발굴)·통폐합 4. 순서를 지금 내 상태 → 무엇이 문제인가 → 그래서 무엇을 할까 로 재배열하고 배당 이력·시뮬을 한 흐름으로 합침. 경고·건강도에 계좌 필터(기본 전체). AI 리포트 어조를 합니다체로 고정.', done: true },
  { phase: 'P41', label: '앱 셸 스크롤 구조 수정', desc: 'overflow-x 만 지정하면 overflow-y 가 auto 로 계산되는 CSS 규칙 탓에 셸이 스크롤 컨테이너가 돼 마켓바 sticky 가 무력화되고 모드 전환 버튼이 밀려났다. 셸을 화면 높이에 고정하고 본문만 내부 스크롤하도록 교정.', done: true },
  { phase: 'P42', label: '손가락 기준 재조정 & 분석 탭 목차', desc: '390px 실측에서 44px 미만이던 컨트롤을 손보되, 시각 크기는 유지하고 히트 영역만 넓히는 방식(::after)을 택했다 — 전부 44px 로 키우면 한 화면 정보량이 크게 준다. 보유 행 액션 26×26(간격 4) → 히트 40×40, 상단 알약 23 → 40px, 세그먼트 27 → 36px. 히트 영역이 이웃 버튼을 덮으면 그 버튼이 안 눌리므로, 가로로 붙은 것은 세로로만 넓히고 행 액션은 중심 간격 = 히트 크기로 맞췄다. 분석 탭에는 챕터 목차 바(sticky·현재 위치 표시)를 추가.', done: true },
  { phase: 'P43', label: '테마 표기 정리', desc: '순환 순서(화이트→다크→차콜→자동)와 설정 탭 카드(3개)가 어긋나 자동 테마가 숨은 값이었고, 라벨 판정이 "라이트도 다크도 아니면 프로"라서 자동일 때 프로로 잘못 찍혔다. 정본을 store 한 곳으로 모으고 설정 탭에 자동 카드를 노출. 다크와 차콜은 Lab ΔE 로 재보니 실제로 구분되는 팔레트였고(배경 7.0·정보색 23.3), 문제는 이름이었다 — 색만 바뀌는데 이름이 "프로"라 정보밀도를 기대하게 했다. 색 이름(차콜)으로 교정.', done: true },
  { phase: 'P44', label: '🔴 개인 자산 노출 사고 대응 — 가림 모드 전면 적용', desc: '가림(privacy) 모드가 포트폴리오 탭에만 걸려 있었다. 가림을 켠 채 분석 탭으로 넘어가면 AI 리포트 본문·자산 추이 축·예수금에 실제 금액이 그대로 찍혔다(분석 15곳·설정 5곳). 화면에 "가림"이라 적혀 있어 안전하다고 믿게 되는 것이 가장 위험했다. utils/privacy.js 를 만들어 금액을 찍는 모든 자리를 통과시키고, AI 본문 3경로(NumHighlight·**강조** 구간·breakSentences)를 모두 막았다. scripts/privacy-scan.mjs 로 전 탭 0건을 검사한다.', done: true },
  { phase: 'P45', label: '리포트 머릿글 통일 & 투자의견 어휘 교정', desc: '같은 AI 리포트인데 탭마다 머릿글이 달랐다 — 분석 탭은 회색 네모, 종목 분석은 대시(–)이거나 아예 없는 줄글. components/BulletList.jsx 하나로 통일(대시는 마이너스 부호와 혼동되어 금융 화면에 부적합). 투자의견도 Hold 를 "보유"로 표기해 미보유 종목에서 "사서 들고 있으라는 뜻"으로 읽혔다 → 증권업계 표준인 "중립"으로 바꾸고, 옛 캐시 표기는 정규화해 함께 맞춘다.', done: true },
  { phase: 'Next', label: '상용화 — 결제·약관·모니터링', desc: '구독 결제 연동 · 이용약관/개인정보처리방침 · 업타임 모니터링/알림 · support@ 이메일 도메인.', done: false },
]

const COMPARE_FEATURES = [
  { feat: '실시간 주가 (한국)',    kiwoom: true,  toss: true,  samsung: true,  domino: true,  daon: true  },
  { feat: '실시간 주가 (미국)',    kiwoom: true,  toss: true,  samsung: true,  domino: true,  daon: true  },
  { feat: '멀티 계좌 통합뷰',     kiwoom: false, toss: false, samsung: false, domino: false, daon: true  },
  { feat: '섹터 히트맵',         kiwoom: false, toss: false, samsung: true,  domino: false, daon: true  },
  { feat: '섹터 드릴다운 Top10',  kiwoom: false, toss: false, samsung: false, domino: false, daon: true  },
  { feat: 'AI 포트폴리오 분석',   kiwoom: false, toss: false, samsung: false, domino: false, daon: true  },
  { feat: 'YouTube 영상 분석',   kiwoom: false, toss: false, samsung: false, domino: false, daon: true  },
  { feat: '캔들차트',            kiwoom: true,  toss: true,  samsung: true,  domino: true,  daon: true  },
  { feat: 'Valuation 지표',      kiwoom: false, toss: false, samsung: true,  domino: false, daon: true  },
  { feat: 'Peers 비교표',        kiwoom: false, toss: true,  samsung: true,  domino: false, daon: true  },
  { feat: '엑셀 업·다운로드',     kiwoom: false, toss: false, samsung: false, domino: true,  daon: true  },
  { feat: 'USD↔KRW 자동 환산',   kiwoom: false, toss: false, samsung: false, domino: true,  daon: true  },
  { feat: '마켓 지수 바',         kiwoom: true,  toss: true,  samsung: true,  domino: false, daon: true  },
  { feat: '관심종목 뉴스',        kiwoom: true,  toss: true,  samsung: true,  domino: false, daon: true  },
  { feat: '거래 주문 실행',       kiwoom: true,  toss: true,  samsung: true,  domino: false, daon: false },
  { feat: '커스터마이징 가능',    kiwoom: false, toss: false, samsung: false, domino: false, daon: true  },
  { feat: '무료 사용',           kiwoom: true,  toss: true,  samsung: true,  domino: true,  daon: true  },
]

const ROADMAP = [
  { title: '자산군 나침반 (거시·실물 포함)', priority: 'High',
    desc: '보유를 주식·현금·금/은·암호화폐·채권으로 묶어 비중을 보여주고, 달러·엔 환율을 5년 백분위로 함께 띄운다. 사라고 하지 않고 "금 0%, 현금 3%"처럼 비어 있다는 사실만 보여준다.',
    cost: '추가 비용 0 — 환율 이력·수동 기준가 입력이 이미 있다', devTime: '2~3 세션',
    considerations: '2026-09-10 오너 지적: 분석이 "가진 주식 안에서"만 본다. 금·은 실물, 엔화 저점 매수 같은 자산군 밖 이야기가 없고 환율은 평가액 환산에만 쓰인다. 다만 투자 권유의 경계를 넘기 쉬운 영역이라, 다온이 지켜온 방식(판정하지 않고 숫자만)을 유지해야 한다. 백분위는 사실이지 권유가 아니다.',
    verdict: '검토 예정', verdictReason: '실물 금·은은 등록 탭 수동 기준가로 받는 전제. 자산군 분류 기준을 먼저 정해야 한다.' },
  { title: '전문가 모드 = 정보 밀도', priority: 'Medium',
    desc: '테마가 색만 바꾸는 지금 구조를 바꾼다. 행 높이 축소, 한 화면에 더 많은 종목, 소수점 자리 확대, 차트 기본 기간 확대 — 색이 아니라 밀도로 구분한다.',
    cost: '추가 비용 0', devTime: '2 세션',
    considerations: '2026-09-10 측정: 다크 vs 차콜은 배경 ΔE 7.0 · 본문 ΔE 2.6 이고 실제로 다른 건 강조색(ΔE 89.6) 하나뿐이다. 이름을 프로 → 차콜로 바꾼 것은 정직해진 것이지 해결이 아니다. "무엇이 전문적인가"에 답하려면 밀도를 손봐야 한다.',
    verdict: '검토 예정', verdictReason: '밀도 토글은 전 탭 레이아웃에 걸린다 — 범위를 먼저 좁혀야 한다.' },
  { title: '공개 블로그 + 애드센스', priority: 'Low',
    desc: '다온 기능 소개·투자 용어 해설을 로그인 담장 밖 페이지로 두고 거기에 광고를 붙인다. 앱 화면은 건드리지 않는다.',
    cost: '애드센스 가입비 0 · 지급 문턱 $100', devTime: '별도 사이트',
    considerations: '2026-09-10 검토: 앱 안 우측 패널에 광고를 넣는 안은 기각했다. ① 로그인 담장 뒤 페이지는 크롤러가 못 봐서 심사에서 떨어진다 ② 금융 앱 + 개인 자산 화면은 정책 심사가 더 깐깐하다 ③ 그 자리는 Market Status·뉴스 자리이고, 지인 피드백 4번이 바로 "그 배너가 안 보인다"였다. 광고를 넣으면 방금 고친 문제가 되돌아온다.',
    verdict: '보류 권장', verdictReason: '사용자 1명 기준 $100 도달에 수년. 수익화는 구독이 더 맞는다 — AI 토큰이 실제 원가이기 때문이다.' },
  { title: 'Ampere A1 이전 (4코어·24GB, 무료)', priority: 'High',
    desc: '지금 x86 1GB 마이크로에서 도는 것을 Oracle Always Free ARM 인스턴스로 옮긴다. RAM 25배, 코어 2배가 0원이다.',
    cost: '0원 (Always Free 범위)', devTime: '반나절',
    considerations: '2026-09-10 실측: 2 vCPU · RAM 956MB(사용 368MB) · 스왑 1G · SQLite 4.7MB(WAL 켜짐). 동시 접속 100명의 1차 병목은 CPU 가 아니라 블로킹 I/O 였고 그건 스레드풀 40 → 128 로 먼저 풀었다. 다음 벽은 메모리다. 파이썬이라 ARM 재빌드는 대부분 문제없지만 yfinance·numpy 휠은 확인이 필요하다.',
    verdict: '검토 예정', verdictReason: '오너 계정에서 인스턴스를 새로 만들고 DNS 를 옮기는 작업 — 다운타임 계획이 필요하다.' },
  { title: 'ETF 관통 노출(look-through) 집중도', priority: 'High',
    desc: 'ETF 를 한 종목으로 세지 않고 구성종목까지 풀어, 직접 보유분과 합산한 진짜 집중도를 계산한다. SPY 를 들고 애플을 따로 사면 실제 애플 노출은 화면에 보이는 것보다 크다.',
    cost: '미국 ETF 는 추가 비용 0(yfinance funds_data). 한국 ETF 는 KRX OPEN API 키 필요(무료·오너 발급)', devTime: '2 세션',
    considerations: '2026-09-09 레이더: Sharesight 가 2025~26 에 같은 기능을 넣었다. 다온은 _etf_top_holdings(Top 10) 가 이미 있어 절반은 되어 있고, 남은 일은 비중 합산과 KR ETF 데이터 소스다. Top 10 만으로는 꼬리 노출이 빠지므로 "최소 노출"이라고 밝혀야 한다.',
    verdict: '검토 예정', verdictReason: 'KR ETF 데이터 소스 확보가 선행 조건. 미국 보유분만 먼저 하는 것도 가능.' },
  { title: '복권형 편향 진단', priority: 'Medium',
    desc: '포트폴리오에서 복권형 성격(고변동·저가·큰 상방 기대) 종목이 차지하는 비중을 분석 탭에 진단으로 띄운다. 판정하지 않고 비중만 보여준다.',
    cost: '추가 비용 0 — 이미 있는 가격·변동성 데이터로 계산', devTime: '1~2 세션',
    considerations: '2026-09-09 레이더: 자본시장연구원 보고서 — 국내 개인투자자는 복권형 주식 보유·거래 비중이 높고, 선호가 강할수록 성과가 저조하다. 다만 이 진단은 잔소리가 되기 쉽다. 비중 숫자만 보여주고 판단은 사용자에게 남긴다.',
    verdict: '검토 예정', verdictReason: '복권형 판정 기준(변동성·가격·시총 임계값)을 먼저 정해야 한다. 임의 기준이면 진단이 아니라 의견이다.' },
  { title: '드로다운 이력 카드', priority: 'Medium',
    desc: '지난 조정장에서 내 포트폴리오가 고점 대비 얼마나 빠졌고 회복에 며칠 걸렸는지 보여준다. 다음 하락 때 버티게 하는 것이 목적이다.',
    cost: '추가 비용 0 — 보유 이력과 가격 이력으로 계산', devTime: '1~2 세션',
    considerations: '2026-09-09 레이더: Dalbar QAIB 2026 — 개인 수익률을 갉아먹는 것은 종목 선택보다 하락장에서의 이탈이다. 보유 시작일 이전 구간은 "내 것이 아니었던 하락"이라 섞으면 거짓말이 된다. 보유 기간만 쓴다.',
    verdict: '검토 예정', verdictReason: '보유 이력이 짧은 계정에서는 표시할 게 없다 — 최소 기간 기준이 필요.' },
  { title: '[다음] 분석 리포트 풀 통합 (B2)', priority: 'High',
    desc: '리스크 진단 카드에 Claude 정성 진단을 정량 경고와 1:1 매칭(백엔드에서 알림↔AI 문단 구조화·태깅) + 스냅샷·시계열 액션 섹션을 단일 데이터 흐름으로 통합.',
    cost: 'AI 토큰 소폭 증가', devTime: '2~3 세션',
    considerations: '2026-08-24 분석 탭 재편으로 절반은 흡수됐다 — AI 진단이 정량 경고 바로 아래(Ⅱ장)에 놓였고, 건강도는 한 줄 배지로 축약됐으며, 리포트 미생성 시 안내도 붙었다. 남은 범위는 백엔드에서 경고↔AI 문단을 태깅해 1:1 로 잇는 부분뿐이다.',
    verdict: '실행 예정', verdictReason: '남은 범위가 백엔드 태깅으로 좁아졌다. 다만 경고는 즉시·AI 는 1~3분이라 도착 타이밍 설계가 여전히 관건.' },
  { title: '[다음] 멀티테넌트 온보딩 (UserProfileContext)', priority: 'High',
    desc: '온보딩 입력(years_to_retire·monthly_inflow·target_wealth·target_markets·리스크 성향) → 발굴/추천/시계열 엔진에 동적 연동. target_markets 마스킹(CRYPTO·선물 배제), Conservative 또는 은퇴<5년이면 저점발굴 비중 캡/숨김.',
    cost: '추가 비용 0', devTime: '2~3 세션',
    considerations: '엔진은 이미 사용자 입력 기반(멀티테넌트, 개인값 하드코딩 0건) → 온보딩 폼 + array filter 마스킹 레이어만 추가하면 됨.',
    verdict: '실행 예정', verdictReason: '상용화 단계 — 불특정 다수 유저 수용을 위한 입력 스키마 고정.' },
  { title: '시장 탭 디자인 R1 정리', priority: 'Low',
    desc: '시장(Trends) 탭의 좌측 색 보더 제거 → design.md R1(좌측 색띠 절대 금지) 준수. 의미는 제목 글자색·배지로만.',
    cost: '추가 비용 0', devTime: '완료',
    considerations: '2026-08-24 재점검: TrendsTab 의 border-left/borderLeft 잔여 0건. 남아 있는 border-left 는 전부 중립 구분선(1px solid --clr-border)이라 R1 대상이 아니다.',
    verdict: '완료', verdictReason: '실측 확인 — 로드맵 상태만 갱신되지 않았던 항목' },
  { title: '채권 혼합 ETF 데이터 소스 확장', priority: 'High',
    desc: '447180·404610·470000 등 Yahoo/Naver 모두에서 조회 불가한 한국 ETF/펀드 시세. KRX OpenAPI 또는 KIS Developers API 연동 검토.',
    cost: 'KRX 무료. KIS 일 5천건 무료', devTime: '완료 (2026.06 · 수동 기준가 방식)',
    considerations: 'KRX/KIS API는 인증 토큰 + 추가 의존성 필요(비용 대비 효과 낮음) → 깨지기 쉬운 스크래퍼 대신 수동 입력 채택.',
    verdict: '완료', verdictReason: '수동 기준가 입력 필드 구현 — 시세 미조회 펀드/일부 ETF를 사용자 입력 참고가로 평가·비중·추이에 반영(라이브 검증). 상장 ETF는 yfinance .KS 자동 유지' },
  { title: 'Web Push 알림 (V2)', priority: 'High',
    desc: 'VAPID + service-worker push로 브라우저를 닫아도 목표가·손절가 도달 알림이 OS로 도착. 알림 벨에 켜기/끄기·테스트 토글.',
    cost: 'Web Push 무료', devTime: '완료 (2026.06)',
    considerations: 'pywebpush + push_subscriptions 테이블. iOS는 홈 화면 설치 후 동작.',
    verdict: '완료', verdictReason: 'cron 트리거 시 인앱 알림과 함께 푸시 발송 — 라이브 검증 완료' },
  { title: 'WebSocket 실시간 가격', priority: 'Medium',
    desc: '현재 60초 폴링 → WebSocket 스트림.',
    cost: 'Oracle Free Tier 내 가능', devTime: '3~5 세션 (6~10h)',
    considerations: 'Yahoo·Naver WebSocket 미제공. 서버 측 폴링 후 푸시 구조.',
    verdict: '보류 권장', verdictReason: '데이터 소스 한계로 진정한 실시간 불가' },
  { title: '한국 종목 Fundamentals & Peers', priority: 'Medium',
    desc: 'KR 종목 Valuation(PER·PBR·ROE·시총·EPS·배당) + 동일업종비교를 Naver 스크래핑으로 채움. 종목 탭에서 미국과 동일하게 표시.',
    cost: '추가 비용 0', devTime: '완료 (2026.06)',
    considerations: 'Naver 투자정보 ID + 동일업종비교 테이블 파싱. 프론트 게이트(isUs)도 KR 개방.',
    verdict: '완료', verdictReason: '삼성전자·SK하이닉스 등 라이브 검증 — 정보 격차 해소' },
  { title: 'AI 자동 주간 리밸런싱 리포트', priority: 'Low',
    desc: '매주 월요일(KST 18시) ai_enabled 사용자별 포트폴리오를 Haiku로 분석 → 리밸런싱 핵심 3가지를 인앱 알림 + 푸시로 발송.',
    cost: 'Haiku 주 1회: 월 $0.5~1', devTime: '완료 (2026.06)',
    considerations: '서버 cron(0 9 * * 1) + /api/cron/weekly_rebalance. 가격 알림 푸시 인프라 재사용.',
    verdict: '완료', verdictReason: '목표가 알림 푸시와 통합 — eligible 사용자 발송 검증' },
  { title: '글로벌 주식 확장 (일본·유럽)', priority: 'Low',
    desc: '일본 7203.T, 유럽 SIE.DE, 홍콩 0700.HK 등 거래소 확장.',
    cost: '추가 비용 0', devTime: '4~5 세션 (8~10h)',
    considerations: 'JPY/EUR/HKD 환율 API 확장 필요. 수요 확인 필요.',
    verdict: '보류', verdictReason: '현재 사용자는 미국·한국 위주. 수요 발생 시 구현' },
  { title: '모바일 터치 제스처 (스와이프 탭 전환)', priority: 'Low',
    desc: '앱/모바일에서 좌우 스와이프로 인접 탭 전환 (BottomNav 순서 미러링). 차트 드래그·가로 스크롤·입력칸과 충돌 방지 가드.',
    cost: '추가 비용 0', devTime: '완료 (2026.06)',
    considerations: '풀투리프레시는 스크롤 충돌 위험으로 보류. 핀치 줌은 차트 드래그 줌으로 대체.',
    verdict: '완료', verdictReason: '스와이프 탭 전환 도입 — PTR은 회귀 위험으로 의도적 제외' },
]

/* ── 로드맵 정렬 (2026-08-29) ────────────────────────────────────────────
   예전에는 완료·보류·진행이 한 목록에 섞여 있었다. 그러면 "다음에 뭘 해야 하나"를
   읽으려면 매번 눈으로 걸러내야 한다. 로드맵의 용도는 기록이 아니라 **다음 행동**이다.
   → 진행할 것만 본문에 우선순위 순으로 세우고, 완료된 것은 아래 '완료 이력'로 접는다.

   우선순위 정렬 기준: High → Medium → Low. 같은 등급 안에서는 원래 순서를 지킨다
   (원래 순서가 곧 오너가 적어둔 순서라 임의로 흔들지 않는다). */
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }
const isDoneVerdict = (v) => String(v || '').startsWith('완료')

const ROADMAP_ACTIVE = ROADMAP
  .map((r, i) => ({ ...r, _i: i }))
  .filter(r => !isDoneVerdict(r.verdict))
  .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
                  || a._i - b._i)

const ROADMAP_DONE = ROADMAP.filter(r => isDoneVerdict(r.verdict))

/* ─── 헬퍼 ─── */
function verdictClass(v) {
  if (!v) return 'is-med'
  if (v.startsWith('완료')) return 'is-low'    // 완료 — positive
  if (v.startsWith('실행')) return 'is-low'
  if (v.startsWith('조건부')) return 'is-high'
  return 'is-med'  // 보류
}
function priorityClass(p) {
  if (p === 'High') return 'is-critical'
  if (p === 'Medium') return 'is-high'
  return 'is-med'
}

/* 직사각형 체크 마크 — 둥근 50%·하트 X */
function Check({ v, highlight }) {
  if (v) return (
    <span style={{
      display: 'inline-block', width: 14, height: 14, lineHeight: '14px',
      textAlign: 'center', fontSize: 11, fontWeight: 800,
      color: highlight ? 'var(--m-primary)' : 'var(--m-positive)',
    }}>✓</span>
  )
  return (
    <span style={{ fontSize: 11, color: 'var(--m-text-tertiary)' }}>—</span>
  )
}

function SectionBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, padding: '5px 13px', borderRadius: 2,
      border: `1px solid ${active ? 'var(--m-text)' : 'var(--m-outline-variant)'}`,
      background: active ? 'var(--m-text)' : 'var(--m-surface)',
      color: active ? 'var(--m-surface)' : 'var(--m-text-secondary)',
      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      letterSpacing: '0.02em',
    }}>{label}</button>
  )
}

/* Hero 상단 통계 한 칸 */
function HeroStat({ value, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--m-text)',
        letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--m-text-tertiary)',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2, fontWeight: 700 }}>{label}</div>
    </div>
  )
}

export default function PresentationTab() {
  const [sec, setSec]         = useState(0)
  const [uiPhase, setUiPhase] = useState(10)  // v4.0 default

  return (
    <div style={{ paddingTop: 8, paddingBottom: 40 }}>

      {/* ── Hero — A안 mono-card (다크 배경/그라데이션 제거) ── */}
      <div className="mono-card" style={{ marginBottom: 12, padding: '18px 18px 14px' }}>
        <div className="m3-label" style={{ marginBottom: 8 }}>
          Development Chronicle · Daon Portfolio App
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--m-text)',
          lineHeight: 1.15, marginBottom: 6, letterSpacing: '-.03em' }}>
          From Idea to Production
        </div>
        <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text-secondary)',
          marginBottom: 14 }}>
          Claude Code와의 협업으로 완성한 개인 투자 플랫폼 · 2026.02 → 2026.06
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0, borderTop: '1px solid var(--m-outline-variant)', paddingTop: 14 }}>
          <HeroStat value="13,000+" label="Code Lines" />
          <HeroStat value="60+" label="API Endpoints" />
          <HeroStat value="10" label="App Tabs" />
          <HeroStat value="60+" label="Dev Sessions" />
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', marginBottom: 14,
        paddingBottom: 2, scrollbarWidth: 'none' }}>
        {SECTIONS.map((s, i) => (
          <SectionBtn key={i} label={s} active={sec === i} onClick={() => setSec(i)} />
        ))}
      </div>

      {/* ══════════ 개요 ══════════ */}
      {sec === 0 && (
        <>
          <div className="mono-card" style={{ marginBottom: 12 }}>
            <div className="mono-section-title is-accent" style={{ marginBottom: 10 }}>
              최초 빌드 프롬프트
            </div>
            <div style={{ background: 'var(--m-surface-variant)',
              border: '1px solid var(--m-outline-variant)', borderRadius: 4,
              padding: '8px 12px' }}>
              <div className="m3-label" style={{ marginBottom: 6 }}>USER → Claude Code</div>
              <pre className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text-secondary)',
                lineHeight: 1.85, whiteSpace: 'pre-wrap',
                fontFamily: 'inherit', margin: 0 }}>{FIRST_PROMPT}</pre>
            </div>
          </div>

          {/* 기술 스택 */}
          <div className="mono-card" style={{ marginBottom: 12 }}>
            <div className="mono-section-title is-accent" style={{ marginBottom: 12 }}>
              기술 스택 — 역할별
            </div>
            {TECH_STACK.map(cat => (
              <div key={cat.category} style={{ marginBottom: 12 }}>
                <div className="m3-label" style={{ marginBottom: 6 }}>{cat.category}</div>
                <div style={{ paddingLeft: 10, borderLeft: '1px solid var(--m-outline-variant)' }}>
                  {cat.items.map(item => (
                    <div key={item.name} style={{ display: 'flex', gap: 0, marginBottom: 5,
                      alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--m-text)',
                        minWidth: 140, flexShrink: 0 }}>{item.name}</div>
                      <div className="ko-keep" style={{ fontSize: 10.5,
                        color: 'var(--m-text-secondary)', lineHeight: 1.55 }}>
                        {item.role}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* AI × 개발자 협업 */}
          <div className="mono-card">
            <div className="mono-section-title is-accent" style={{ marginBottom: 12 }}>
              AI × 개발자 협업 방식
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {[
                { step: '01', title: '아이디어 설계', desc: '투자자 관점의 기능 요구사항을 자연어로 정의' },
                { step: '02', title: '코드 생성', desc: 'Claude Code가 전체 파일 구조·로직·CSS 자동 작성' },
                { step: '03', title: '배포·검증', desc: 'Oracle Cloud 배포 후 실제 포트폴리오로 테스트' },
                { step: '04', title: '피드백 반영', desc: '스크린샷·오류 메시지로 즉각 수정 → 재배포' },
              ].map(item => (
                <div key={item.step} style={{
                  borderRadius: 2,
                  padding: '10px 12px', border: '1px solid var(--m-outline-variant)' }}>
                  <div className="m3-label" style={{ marginBottom: 3 }}>{item.step}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 800,
                    color: 'var(--m-text)', marginBottom: 2 }}>{item.title}</div>
                  <div className="ko-keep" style={{ fontSize: 10.5,
                    color: 'var(--m-text-secondary)', lineHeight: 1.55 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════ UI 변천사 ══════════ */}
      {sec === 1 && (
        <div className="mono-card">
          <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>
            UI/UX 변천사 — 단계별 비교
          </div>
          <div className="mono-section-sub" style={{ marginBottom: 12 }}>
            각 버전 클릭 시 상세 내용 표시
          </div>

          {/* 타임라인 비교 — 무채색 직사각형 카드 */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8,
            scrollbarWidth: 'thin', marginBottom: 16 }}>
            {UI_PHASES.map((p, i) => {
              const active = uiPhase === i
              return (
                <div key={i} onClick={() => setUiPhase(i)} style={{
                  minWidth: 130, flexShrink: 0, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--m-text)' : 'var(--m-outline-variant)'}`,
                  borderRadius: 2, overflow: 'hidden', background: 'var(--m-surface)',
                }}>
                  <div style={{
                    background: active ? 'var(--m-text)' : 'var(--m-surface-variant)',
                    padding: '6px 8px' }}>
                    <div style={{ fontSize: 10, fontWeight: 900,
                      color: active ? 'var(--m-surface)' : 'var(--m-text)',
                      letterSpacing: '0.06em' }}>{p.version}</div>
                    <div style={{ fontSize: 9,
                      color: active ? 'rgba(255,255,255,.75)' : 'var(--m-text-secondary)',
                      marginTop: 1 }}>{p.label}</div>
                  </div>

                  {/* 미니 UI 모식도 — 모두 회색조 */}
                  <div style={{ padding: '8px 6px',
                    borderBottom: '1px solid var(--m-outline-variant)' }}>
                    {p.ui.map((u, ui) => (
                      <div key={ui} style={{ marginBottom: 3,
                        background: 'var(--m-outline-variant)',
                        padding: '2px 5px', height: Math.min(u.h, 32),
                        display: 'flex', alignItems: 'center' }}>
                        <div style={{ fontSize: 8, color: 'var(--m-text-secondary)',
                          fontWeight: 600, lineHeight: 1.2, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* 핵심 수치 */}
                  <div style={{ padding: '6px 8px', display: 'grid',
                    gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 900,
                        color: 'var(--m-text)' }}>{p.tabs}</div>
                      <div className="m3-label" style={{ fontSize: 8 }}>탭</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700,
                        color: 'var(--m-text-secondary)' }}>{p.lines}</div>
                      <div className="m3-label" style={{ fontSize: 8 }}>코드</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 선택 Phase 상세 — mono-card 내부 mono-card */}
          {(() => {
            const p = UI_PHASES[uiPhase]
            return (
              <div style={{ borderRadius: 2, padding: '14px',
                border: '1px solid var(--m-outline-variant)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div className="mono-pill" style={{
                    color: 'var(--m-text)', borderColor: 'var(--m-text)',
                    fontSize: 11, padding: '2px 8px' }}>{p.version}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-text)' }}>{p.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--m-text-tertiary)' }}>{p.stack}</div>
                  </div>
                </div>

                {/* KEY CHANGE — 좌측 색띠만 */}
                <div style={{ background: 'var(--m-surface-variant)',
                  border: '1px solid var(--m-outline-variant)', borderRadius: 4,
                  padding: '6px 10px', marginBottom: 10 }}>
                  <div className="m3-label" style={{ marginBottom: 2 }}>KEY CHANGE</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--m-text)' }}>
                    {p.keyChange}
                  </div>
                </div>

                <div className="ko-keep" style={{ fontSize: 11.5,
                  color: 'var(--m-text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
                  {p.desc}
                </div>

                {/* 3지표 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6, marginBottom: 10 }}>
                  {[
                    { v: `${p.tabs}`, l: '탭' },
                    { v: `${p.features}`, l: '기능' },
                    { v: p.lines, l: '코드' },
                  ].map(item => (
                    <div key={item.l} style={{ borderRadius: 2,
                      padding: '8px', textAlign: 'center',
                      border: '1px solid var(--m-outline-variant)' }}>
                      <div style={{ fontSize: 16, fontWeight: 900,
                        color: 'var(--m-text)' }}>{item.v}</div>
                      <div className="m3-label" style={{ fontSize: 9 }}>{item.l}</div>
                    </div>
                  ))}
                </div>

                {/* 진행 표시 — 직사각형 미니 바 (원형 X) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {UI_PHASES.map((ph, i) => (
                    <div key={i} onClick={() => setUiPhase(i)} style={{
                      flex: 1, height: 4, cursor: 'pointer',
                      background: i <= uiPhase ? 'var(--m-text)' : 'var(--m-outline-variant)',
                    }} title={ph.version} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  marginTop: 4 }}>
                  <div className="m3-label" style={{ fontSize: 8 }}>{UI_PHASES[0].version}</div>
                  <div className="m3-label" style={{ fontSize: 8 }}>{UI_PHASES[uiPhase].version}</div>
                  <div className="m3-label" style={{ fontSize: 8 }}>
                    {UI_PHASES[UI_PHASES.length - 1].version}</div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ══════════ 통계 ══════════ */}
      {sec === 2 && (
        <>
          {/* 무채색 2-컬럼 stat grid (큰 숫자 위계 줄임) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)',
            gap: 8, marginBottom: 12 }}>
            {STATS.map(s => (
              <div key={s.label} className="mono-card" style={{ padding: '12px' }}>
                <div className="m3-label" style={{ marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--m-text)',
                  letterSpacing: '-0.025em', lineHeight: 1.05,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {s.value}
                </div>
                <div className="ko-keep" style={{ fontSize: 9.5,
                  color: 'var(--m-text-tertiary)', lineHeight: 1.4, marginTop: 4 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* 주요 버그/결정 — mono-row 양식 */}
          <div className="mono-card">
            <div className="mono-section-title is-accent" style={{ marginBottom: 12 }}>
              주요 버그 수정 & 기술 결정 사례
            </div>
            {[
              { tag: 'BUG',  sev: 'is-critical',
                title: 'A-prefix 한국 종목 ₩560억 오표시',
                desc: 'A005490(POSCO) 등 A-접두사 종목을 미국 주식으로 오인. 정규식 ^A?\\d{6}$ 수정으로 해결.' },
              { tag: 'BUG',  sev: 'is-critical',
                title: 'Recharts 캔들차트 무한 렌더링',
                desc: 'Customized xAxisMap/yAxisMap 스케일 불안정. ResizeObserver 기반 순수 SVG로 영구 교체.' },
              { tag: 'ARCH', sev: 'is-high',
                title: 'Streamlit → React 완전 전환',
                desc: 'st.tabs 프로그래밍 방식 탭 이동 불가. React 완전 이전으로 해결.' },
              { tag: 'OPS',  sev: 'is-high',
                title: 'index.html 배포 누락 → 마켓바 0.00%',
                desc: 'JS만 업로드, index.html 누락으로 구버전 참조. 배포 체크리스트에 index.html 필수 항목 추가.' },
              { tag: 'SEC',  sev: 'is-critical',
                title: '관리자 모드 분리 (절대 권한)',
                desc: 'API Key·사용자 목록 등 민감 기능을 admin 암호로 분리. 1시간 자동 잠금.' },
              { tag: 'I18N', sev: 'is-med',
                title: 'KR 한글명 전역 + 재무 차트 한글화',
                desc: '005380→현대차 displayName 헬퍼. 실적 추이·매출 vs 영업이익 한글화.' },
              { tag: 'UX',   sev: 'is-high',
                title: 'AI 티 박스 디자인 일괄 제거 (v4.0)',
                desc: '둥근 카드 + 그라데이션 + 색상 음영 배지 → 직사각형 + 글자색 강조 + 인포그래픽으로 통일.' },
            ].map((l, i) => (
              <div key={i} className="mono-row">
                <div className="mono-row-content">
                  <div className="mono-row-title">
                    <span className={`sev-label ${l.sev}`}>{l.tag}</span>
                    <span style={{ color: 'var(--m-text)' }}>{l.title}</span>
                  </div>
                  <div className="mono-row-body ko-keep">{l.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════ 마일스톤 ══════════ */}
      {sec === 3 && (
        <div className="mono-card">
          <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>
            개발 마일스톤
          </div>
          <div className="mono-section-sub" style={{ marginBottom: 14 }}>
            2026.02 시작 · 완료 {MILESTONES.filter(m=>m.done).length}단계 ·
            예정 {MILESTONES.filter(m=>!m.done).length}단계
          </div>
          {MILESTONES.map((m, i) => (
            <div key={i} style={{ display: 'grid',
              gridTemplateColumns: '40px 12px 1fr',
              gap: '0 10px', alignItems: 'flex-start' }}>
              {/* 단계 레이블 */}
              <div style={{ fontSize: 10, fontWeight: 800,
                color: m.done ? 'var(--m-text)' : 'var(--m-text-tertiary)',
                textAlign: 'right', paddingTop: 2,
                fontFamily: 'monospace' }}>
                {m.phase}
              </div>
              {/* 타임라인 — 직사각형 작은 막대 (원형 X) */}
              <div style={{ display: 'flex', flexDirection: 'column',
                alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, marginTop: 5,
                  background: m.done ? 'var(--m-text)' : 'var(--m-outline-variant)',
                  flexShrink: 0 }} />
                {i < MILESTONES.length - 1 && (
                  <div style={{ width: 1, flex: 1, minHeight: 24, marginTop: 2,
                    background: m.done ? 'var(--m-outline)' : 'var(--m-outline-variant)' }} />
                )}
              </div>
              {/* 내용 */}
              <div style={{ paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2,
                  flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 800,
                    color: m.done ? 'var(--m-text)' : 'var(--m-text-tertiary)' }}>{m.label}</span>
                  <span className="sev-label" style={{
                    color: m.done ? 'var(--m-positive)' : 'var(--m-text-tertiary)',
                    borderColor: m.done ? 'var(--m-positive)' : 'var(--m-text-tertiary)' }}>
                    {m.done ? 'DONE' : 'PLANNED'}
                  </span>
                </div>
                <div className="ko-keep" style={{ fontSize: 10.5,
                  color: m.done ? 'var(--m-text-secondary)' : 'var(--m-text-tertiary)',
                  lineHeight: 1.6 }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════ 앱 비교 ══════════ */}
      {sec === 4 && (
        <div className="mono-card">
          <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>
            시중 주식앱 기능 비교
          </div>
          <div className="mono-section-sub" style={{ marginBottom: 12 }}>
            다온 vs 키움증권 · 토스증권 · 삼성증권 · 도미노
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 2,
            border: '1px solid var(--m-outline-variant)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr style={{ background: 'var(--m-surface-variant)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10,
                    color: 'var(--m-text-tertiary)', fontWeight: 700,
                    borderBottom: '1px solid var(--m-outline-variant)',
                    letterSpacing: '.04em', textTransform: 'uppercase',
                    minWidth: 120 }}>기능</th>
                  {['키움','토스','삼성','도미노','다온'].map(n => {
                    const isDaon = n === '다온'
                    return (
                      <th key={n} style={{ padding: '8px 6px', textAlign: 'center',
                        fontSize: 11, fontWeight: 800,
                        color: isDaon ? 'var(--m-surface)' : 'var(--m-text-secondary)',
                        background: isDaon ? 'var(--m-text)' : 'transparent',
                        borderBottom: '1px solid var(--m-outline-variant)',
                        minWidth: 46 }}>{n}</th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {COMPARE_FEATURES.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--m-outline-variant)' }}>
                    <td style={{ padding: '7px 10px', fontSize: 11,
                      color: 'var(--m-text)', fontWeight: 500 }}>{row.feat}</td>
                    <td style={{ textAlign: 'center', padding: '7px 4px' }}><Check v={row.kiwoom} /></td>
                    <td style={{ textAlign: 'center', padding: '7px 4px' }}><Check v={row.toss} /></td>
                    <td style={{ textAlign: 'center', padding: '7px 4px' }}><Check v={row.samsung} /></td>
                    <td style={{ textAlign: 'center', padding: '7px 4px' }}><Check v={row.domino} /></td>
                    <td style={{ textAlign: 'center', padding: '7px 4px',
                      background: 'var(--m-surface-variant)' }}>
                      <Check v={row.daon} highlight /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--m-surface-variant)',
                  borderTop: '1px solid var(--m-outline)' }}>
                  <td style={{ padding: '8px 10px', fontSize: 10, fontWeight: 800,
                    color: 'var(--m-text)', letterSpacing: '.04em',
                    textTransform: 'uppercase' }}>지원 기능 수</td>
                  {[
                    COMPARE_FEATURES.filter(r=>r.kiwoom).length,
                    COMPARE_FEATURES.filter(r=>r.toss).length,
                    COMPARE_FEATURES.filter(r=>r.samsung).length,
                    COMPARE_FEATURES.filter(r=>r.domino).length,
                    COMPARE_FEATURES.filter(r=>r.daon).length,
                  ].map((cnt, j) => (
                    <td key={j} style={{ textAlign: 'center', padding: '8px 4px',
                      fontSize: 14, fontWeight: 900,
                      color: j === 4 ? 'var(--m-primary)' : 'var(--m-text)',
                      fontVariantNumeric: 'tabular-nums' }}>
                      {cnt}
                      <span style={{ fontSize: 9, color: 'var(--m-text-tertiary)',
                        fontWeight: 600 }}>/{COMPARE_FEATURES.length}</span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="ko-keep" style={{ marginTop: 10, fontSize: 10,
            color: 'var(--m-text-tertiary)', lineHeight: 1.7 }}>
            거래 주문은 증권사 앱 핵심 기능 — 다온은 포트폴리오 관리·분석 특화 ·
            AI 분석·YouTube 분석·섹터 드릴다운은 다온 독자 기능 ·
            도미노는 개인 투자자용 포트폴리오 트래킹 앱
          </div>
        </div>
      )}

      {/* ══════════ 로드맵 ══════════ */}
      {sec === 5 && (
        <>
          <div className="mono-card" style={{ marginBottom: 12 }}>
            <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>
              미구현 기능 종합 분석
            </div>
            <div className="mono-section-sub ko-keep" style={{ marginBottom: 14 }}>
              최근 세션까지 추가된 기능 외에 보완·검토 가능한 항목입니다.
              우선순위·비용·개발 시간·판단 사유 정리.
            </div>

            {/* 상단 요약 — 무채색 4 stat block */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6, marginBottom: 14 }}>
              {[
                { label: '총 검토', value: ROADMAP.length },
                { label: '완료', value: ROADMAP.filter(r => r.verdict?.startsWith('완료')).length },
                { label: '진행 대기', value: ROADMAP.filter(r => r.verdict && (r.verdict.startsWith('실행') || r.verdict.startsWith('조건부'))).length },
                { label: '보류', value: ROADMAP.filter(r => r.verdict?.startsWith('보류')).length },
              ].map(s => (
                <div key={s.label} style={{ borderRadius: 2,
                  padding: '10px 8px', border: '1px solid var(--m-outline-variant)',
                  textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 900,
                    color: 'var(--m-text)' }}>{s.value}</div>
                  <div className="m3-label" style={{ fontSize: 9, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {ROADMAP_ACTIVE.map((r, i) => (
              <div key={i} className="mono-row" style={{ padding: '12px 0' }}>
                <div className="mono-row-content">
                  {/* 헤더: 직사각 라벨 (음영 X) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className={`sev-label ${priorityClass(r.priority)}`}>{r.priority}</span>
                    {r.verdict && (
                      <span className={`sev-label ${verdictClass(r.verdict)}`}>{r.verdict}</span>
                    )}
                    <span style={{ fontSize: 12.5, fontWeight: 800,
                      color: 'var(--m-text)' }}>{r.title}</span>
                  </div>

                  <div className="ko-keep" style={{ fontSize: 11,
                    color: 'var(--m-text-secondary)', lineHeight: 1.65, marginBottom: 8 }}>
                    {r.desc}
                  </div>

                  {/* 판단 사유 — 좌측 색띠 */}
                  {r.verdictReason && (
                    <div style={{
                      background: 'var(--m-surface-variant)',
                      border: '1px solid var(--m-outline-variant)', borderRadius: 4,
                      padding: '6px 10px', marginBottom: 8 }}>
                      <span className="m3-label" style={{ marginRight: 6 }}>사유</span>
                      <span className="ko-keep" style={{ fontSize: 11,
                        color: 'var(--m-text)' }}>{r.verdictReason}</span>
                    </div>
                  )}

                  {/* 3개 메타 — outline only */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {[
                      { label: '예상 비용', value: r.cost },
                      { label: '개발 시간', value: r.devTime },
                      { label: '고려 사항', value: r.considerations },
                    ].map(meta => (
                      <div key={meta.label} style={{ borderRadius: 2,
                        padding: '7px 9px', border: '1px solid var(--m-outline-variant)' }}>
                        <div className="m3-label" style={{ marginBottom: 3 }}>{meta.label}</div>
                        <div className="ko-keep" style={{ fontSize: 10.5,
                          color: 'var(--m-text-secondary)', lineHeight: 1.55 }}>
                          {meta.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 완료 이력 — 본문에서 걷어냈지만 버리지는 않는다.
              "무엇을 이미 했는가"는 다음 판단의 근거가 되고, 같은 것을 두 번
              검토하지 않게 해준다. 기본은 접어 둔다(지금 필요한 건 다음 행동이다). */}
          {ROADMAP_DONE.length > 0 && (
            <details className="mono-card" style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 800,
                color: 'var(--m-text)' }}>
                완료 이력 {ROADMAP_DONE.length}건
                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600,
                  color: 'var(--m-text-tertiary)' }}>(눌러서 펼치기)</span>
              </summary>
              <div style={{ marginTop: 10 }}>
                {ROADMAP_DONE.map((r, i) => (
                  <div key={i} style={{ padding: '8px 0',
                    borderTop: i ? '1px solid var(--m-outline-variant)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6,
                      flexWrap: 'wrap' }}>
                      <span className="sev-label is-low">완료</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--m-text)' }}>
                        {r.title}
                      </span>
                      {r.devTime && (
                        <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
                          {r.devTime}
                        </span>
                      )}
                    </div>
                    {r.verdictReason && (
                      <div className="ko-keep" style={{ fontSize: 11, marginTop: 3,
                        color: 'var(--m-text-secondary)', lineHeight: 1.65 }}>
                        {r.verdictReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* 지속 개선 관점 */}
          <div className="mono-card">
            <div className="mono-section-title is-accent" style={{ marginBottom: 12 }}>
              지속 개선이 필요한 관점
            </div>
            {[
              { tag: 'SECURITY', sev: 'is-high',
                title: '엣지 보안 강화 (HTTPS 적용 완료)',
                desc: 'PBKDF2 인증 + Cloudflare 프록시 + nginx Origin 인증서(Full strict) + 8501 내부 잠금 완료. 추가로 OAuth/2FA·Cloudflare Access SSO 검토 가능.' },
              { tag: 'PERF', sev: 'is-med',
                title: '번들 최적화 (코드 스플릿 적용 완료)',
                desc: 'manualChunks + 탭별 lazy로 초기 192KB(gzip) 달성. 추가로 이미지/폰트 최적화·HTTP 캐시 헤더 튜닝 여지.' },
              { tag: 'DATA', sev: 'is-high',
                title: 'Naver Finance 스크래핑 취약성',
                desc: '네이버 HTML 구조 변경 시 한국 주가 전체 오류 발생. 공식 Open API 전환 또는 대체 소스 이중화 검토.' },
              { tag: 'TEST', sev: 'is-med',
                title: 'E2E 테스트는 있으나 단위 테스트 부재',
                desc: 'Puppeteer 회귀는 도입. pytest + Vitest로 캔들차트·환율 계산 로직 단위 테스트 보강 필요.' },
            ].map((item, i) => (
              <div key={i} className="mono-row">
                <div className="mono-row-content">
                  <div className="mono-row-title">
                    <span className={`sev-label ${item.sev}`}>{item.tag}</span>
                    <span style={{ color: 'var(--m-text)' }}>{item.title}</span>
                  </div>
                  <div className="mono-row-body ko-keep">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  )
}

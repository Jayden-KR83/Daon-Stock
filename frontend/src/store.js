import { create } from 'zustand'

/* 레이아웃 모드 — 'auto' | 'web' | 'app'
   'auto' = 화면 폭으로 결정(모바일 768px 미만이면 앱, 그 이상은 웹).
   사용자가 명시적으로 고르면 폭과 무관하게 그 선택을 따른다 —
   이전 appMode('web'|'app')는 'web'이 기본값이라 "명시적 웹 선호"와 구분되지 않아
   모바일에서 웹 레이아웃을 고를 수 없었다. 기존 'app' 저장값만 선호로 승계. */
const savedLayout = localStorage.getItem('layoutMode')
  || (localStorage.getItem('appMode') === 'app' ? 'app' : 'auto')
const savedToken    = localStorage.getItem('authToken') || null
// 프라이버시 모드 — 페이지 로드 시 항상 가림 (true). 본문 클릭 시에만 표시. 새로고침 시 다시 가려짐.
const savedPrivacy  = true
// 테마: 'light' | 'dark' | 'pro' — 기본 light
const savedTheme    = localStorage.getItem('theme') || 'light'

/* 테마 정본 — 순환 순서·라벨·설명을 한 곳에 둔다.
   예전에는 순환 순서(코드)와 설정 탭 카드 목록(다른 파일)이 어긋나 있었다.
   그래서 'auto' 는 알약을 4번 눌러야만 걸리는 숨은 값이었고, 라벨은 '프로'로
   잘못 찍혔다. 한 곳에서만 정의해 다시 어긋나지 않게 한다.

   ⚠ key('pro' 등)는 localStorage 에 저장된 값이라 바꾸면 기존 설정이 날아간다.
     보이는 이름만 바꾼다. */
export const THEME_ORDER = ['light', 'dark', 'pro', 'auto']
export const THEME_META = {
  light: { icon: '☀️', label: '화이트', desc: '밝고 깔끔한 기본 테마',
    preview: { bg: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', accent: '#16A34A' } },
  dark:  { icon: '🌙', label: '다크',   desc: '네이비 계열 다크 · 초록 강조',
    preview: { bg: '#0B1120', surface: '#111C2D', text: '#F1F5F9', accent: '#34D399' } },
  /* 예전 이름은 '프로'였다. 실제로 바뀌는 건 색 팔레트뿐인데 이름이 '프로'라
     정보가 더 조밀해질 거라는 기대를 줬다. 색으로 부른다. */
  pro:   { icon: '⚫', label: '차콜',   desc: '중성 회색 다크 · 파랑 강조',
    preview: { bg: '#0D1117', surface: '#161B22', text: '#F0F6FC', accent: '#58A6FF' } },
  auto:  { icon: '🖥️', label: '자동',   desc: 'OS 설정을 그대로 따라감',
    preview: { bg: '#0B1120', surface: '#FFFFFF', text: '#0F172A', accent: '#38BDF8' } },
}

/* 사용자가 바뀔 때 반드시 지워야 하는 **개인값** — 브라우저에 남는 것들.
   이 키들은 사용자 구분 없이 저장되므로, 로그아웃/계정 전환 후에도 남아 있으면
   다음 사람(데모 포함)의 화면에 앞사람의 값이 그대로 쓰인다.
   2026-08-26 개인 자산 노출 사고의 재발 방지 조치. 새 개인값을 추가할 때는
   반드시 이 배열에도 넣을 것. */
const PERSONAL_LOCAL_KEYS = [
  'daon_retire_years',    // 은퇴까지 남은 햇수
  'daon_monthly_inflow',  // 매월 납입액(원)
  'recentTickers',        // 최근 조회 종목 — 보유 구성이 유추된다
]

function wipePersonalLocal() {
  try { PERSONAL_LOCAL_KEYS.forEach(k => localStorage.removeItem(k)) } catch {}
}

export const useStore = create((set, get) => ({
  // Auth
  authToken:    savedToken,
  currentUser:  null,
  setAuth: (token, user) => {
    // 토큰이 실제로 바뀔 때(로그인·로그아웃·계정 전환)만 개인값을 비운다.
    // authMe 응답마다 같은 토큰으로 재호출되므로 매번 지우면 정상 사용 중에도 값이 날아간다.
    if (get().authToken !== token) wipePersonalLocal()
    if (token) localStorage.setItem('authToken', token)
    else localStorage.removeItem('authToken')
    set({ authToken: token, currentUser: user })
  },

  // Navigation
  activeTab: 0,
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Chart
  chartTicker: null,
  setChartTicker: (tkr) => {
    // 최근 검색에 자동 추가 (최대 8개, 최신이 위)
    if (tkr) {
      try {
        const recent = JSON.parse(localStorage.getItem('recentTickers') || '[]')
        const next = [tkr, ...recent.filter(t => t !== tkr)].slice(0, 8)
        localStorage.setItem('recentTickers', JSON.stringify(next))
      } catch {}
    }
    set({ chartTicker: tkr, activeTab: 3 })
  },

  // Holdings view
  accFilter: '전체',
  setAccFilter: (v) => set({ accFilter: v }),
  viewMode: '평가액',   // '평가액' | '시세'
  setViewMode: (v) => set({ viewMode: v }),
  sortOrder: '높은순',  // '높은순' | '낮은순'
  setSortOrder: (v) => set({ sortOrder: v }),
  currencyMode: 'KRW', // 'KRW' | 'USD'
  setCurrencyMode: (v) => set({ currencyMode: v }),

  // Web/App 레이아웃 (persisted) — 'auto' | 'web' | 'app'
  layoutMode: savedLayout,
  setLayoutMode: (v) => { localStorage.setItem('layoutMode', v); set({ layoutMode: v }) },

  // USD/KRW rate
  usdKrw: 1300,
  setUsdKrw: (v) => set({ usdKrw: v }),

  // Anthropic API key (서버에만 저장 — 브라우저에는 보유 여부만 추적)
  hasAnthropicKey: false,
  setHasAnthropicKey: (v) => set({ hasAnthropicKey: v }),

  // 프라이버시 모드 — 페이지 로드 시 항상 ON, 본문 클릭으로 OFF (단방향). 새로고침 시 ON으로 복귀.
  privacyMode: savedPrivacy,
  togglePrivacy: () => set(s => ({ privacyMode: !s.privacyMode })),

  // 관리자 모드 (서버 admin_status 응답으로 갱신)
  adminStatus: { is_admin: false, unlocked: false, password_set: false },
  setAdminStatus: (s) => set({ adminStatus: s }),

  // 동적 계좌 목록 — 서버에서 로드. 기본값은 폴백용 (4 종 fallback)
  accounts: [
    { key: 'US',          label: '미국', currency: 'USD', sort_order: 0 },
    { key: 'KR_RETIRE',   label: '퇴직', currency: 'KRW', sort_order: 1 },
    { key: 'KR_PERSONAL', label: '개별', currency: 'KRW', sort_order: 2 },
    { key: 'KR_ISA',      label: 'ISA',  currency: 'KRW', sort_order: 3 },
  ],
  setAccounts: (acc) => set({ accounts: acc }),

  // 온보딩 투어 — 최초 로그인 시 자동 1회, 설정에서 다시 보기 가능
  tourOpen: false,
  openTour:  () => set({ tourOpen: true }),
  closeTour: () => set({ tourOpen: false }),

  // 테마 — light | dark | pro | auto (OS 따라감). 목록은 THEME_ORDER/THEME_META 참조
  theme: savedTheme,
  setTheme: (v) => {
    localStorage.setItem('theme', v)
    set({ theme: v })
  },
  cycleTheme: () => set(s => {
    const order = THEME_ORDER
    const next = order[(order.indexOf(s.theme) + 1) % order.length]
    localStorage.setItem('theme', next)
    return { theme: next }
  }),
}))

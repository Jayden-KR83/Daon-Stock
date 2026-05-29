import { create } from 'zustand'

const savedAppMode  = localStorage.getItem('appMode') || 'web'
const savedToken    = localStorage.getItem('authToken') || null
// 프라이버시 모드 — 페이지 로드 시 항상 가림 (true). 본문 클릭 시에만 표시. 새로고침 시 다시 가려짐.
const savedPrivacy  = true
// 테마: 'light' | 'dark' | 'pro' — 기본 light
const savedTheme    = localStorage.getItem('theme') || 'light'

export const useStore = create((set, get) => ({
  // Auth
  authToken:    savedToken,
  currentUser:  null,
  setAuth: (token, user) => {
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

  // Web/App display mode (persisted)
  appMode: savedAppMode, // 'web' | 'app'
  setAppMode: (v) => { localStorage.setItem('appMode', v); set({ appMode: v }) },

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

  // 테마 — light | dark | pro | auto (OS 따라감)
  theme: savedTheme,
  setTheme: (v) => {
    localStorage.setItem('theme', v)
    set({ theme: v })
  },
  cycleTheme: () => set(s => {
    const order = ['light', 'dark', 'pro', 'auto']
    const next = order[(order.indexOf(s.theme) + 1) % order.length]
    localStorage.setItem('theme', next)
    return { theme: next }
  }),
}))

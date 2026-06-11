import React, { useEffect, useRef, Suspense, lazy } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from './store'
import { useSwipeNav } from './useSwipeNav'
import { getUsdKrw, getApiKeyStatus, authMe, getAdminStatus, getAccounts, getPortfolio, getPricesBatch, captureNetWorthSnapshot } from './api'
import MarketBar from './components/MarketBar'
import BottomNav from './components/BottomNav'
import TopNavBar from './components/TopNavBar'
import SideNavBar from './components/SideNavBar'
import RightPanel from './components/RightPanel'
import InstallPrompt from './components/InstallPrompt'
import NotificationsBell from './components/NotificationsBell'
import ErrorBoundary from './components/ErrorBoundary'
import HoldingsTab from './tabs/HoldingsTab'        // 첫 진입 즉시 필요 — eager
import LoginPage from './tabs/LoginPage'            // 인증 게이트 — eager
import KeyboardShortcuts from './components/KeyboardShortcuts'
import ChangelogModal from './components/ChangelogModal'
import { capturePnLSnapshot } from './api'
import './App.css'

// 나머지 9개 탭은 lazy — 클릭 시 청크 다운로드 (초기 번들 ↓)
const WatchlistTab    = lazy(() => import('./tabs/WatchlistTab'))
const AllocationTab   = lazy(() => import('./tabs/AllocationTab'))
const ChartTab        = lazy(() => import('./tabs/ChartTab'))
const TrendsTab       = lazy(() => import('./tabs/TrendsTab'))
const AddTab          = lazy(() => import('./tabs/AddTab'))
const ManageTab       = lazy(() => import('./tabs/ManageTab'))
const GuideTab        = lazy(() => import('./tabs/GuideTab'))
const PresentationTab = lazy(() => import('./tabs/PresentationTab'))
const AdminTab        = lazy(() => import('./tabs/AdminTab'))

// 탭 순서: 포트폴리오(0) 관심(1) 분석(2) 종목(3) 시장(4) 등록(5) 설정(6) 가이드(7) 여정(8) 관리자(9)
const TABS = [HoldingsTab, WatchlistTab, AllocationTab, ChartTab, TrendsTab, AddTab, ManageTab, GuideTab, PresentationTab, AdminTab]

/* Suspense fallback — 탭 청크 로딩 중 잠깐 보이는 가벼운 스피너 */
function TabLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', color: 'var(--m-text-tertiary)',
      fontSize: 12, fontWeight: 600, letterSpacing: '.04em' }}>
      LOADING…
    </div>
  )
}

export default function App() {
  const activeTab          = useStore(s => s.activeTab)
  const setActiveTab       = useStore(s => s.setActiveTab)
  const setUsdKrw          = useStore(s => s.setUsdKrw)
  const setHasAnthropicKey = useStore(s => s.setHasAnthropicKey)
  const appMode            = useStore(s => s.appMode)
  const setAppMode         = useStore(s => s.setAppMode)
  const authToken          = useStore(s => s.authToken)
  const currentUser        = useStore(s => s.currentUser)
  const setAuth            = useStore(s => s.setAuth)
  const setAdminStatus     = useStore(s => s.setAdminStatus)
  const theme              = useStore(s => s.theme)
  const queryClient        = useQueryClient()

  // 🔒 사용자 전환(로그인/로그아웃/데모) 시 이전 세션의 React Query 캐시 전면 제거.
  // 누락 시 로그아웃 후 데모로 진입해도 직전 사용자의 보유/평가액이 그대로 노출됨(데이터 유출).
  const prevTokenRef = React.useRef(authToken)
  useEffect(() => {
    if (prevTokenRef.current !== authToken) {
      queryClient.clear()
      prevTokenRef.current = authToken
    }
  }, [authToken])

  // 모바일 뷰포트 감지 — 768px 미만이면 웹 모드 설정과 무관하게 앱 레이아웃으로 강제 전환
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const el = document.getElementById('loading')
    if (el) el.style.display = 'none'
  }, [])

  // 테마 적용: <html data-theme="..."> 로 CSS 변수 전체 스왑
  // 'auto' 는 OS prefers-color-scheme 따라감 (실시간 동기화)
  useEffect(() => {
    const apply = () => {
      let t = theme || 'light'
      if (t === 'auto') {
        t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      document.documentElement.setAttribute('data-theme', t)
    }
    apply()
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = () => apply()
      mq.addEventListener?.('change', onChange)
      return () => mq.removeEventListener?.('change', onChange)
    }
  }, [theme])

  const { data: meData, isError: meError } = useQuery({
    queryKey: ['auth-me'],
    queryFn: authMe,
    enabled: !!authToken,
    retry: false,
    staleTime: 5 * 60_000,
  })
  useEffect(() => { if (meData) setAuth(authToken, meData) }, [meData])
  useEffect(() => { if (meError) setAuth(null, null) }, [meError])

  const { data: rateData } = useQuery({
    queryKey: ['usdkrw'],
    queryFn: getUsdKrw,
    enabled: !!authToken,
    staleTime: 3_600_000,
  })
  useEffect(() => { if (rateData?.rate) setUsdKrw(rateData.rate) }, [rateData])

  const { data: apikeyData } = useQuery({
    queryKey: ['apikey-status'],
    queryFn: getApiKeyStatus,
    enabled: !!authToken,
    staleTime: 300_000,
  })
  useEffect(() => { if (apikeyData) setHasAnthropicKey(apikeyData.has_key) }, [apikeyData])

  // 동적 계좌 목록 로드 — 로그인 후 1회
  const setAccounts = useStore(s => s.setAccounts)
  const { data: acctData } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
    enabled: !!authToken,
    staleTime: 300_000,
    retry: false,
  })
  useEffect(() => { if (acctData?.accounts?.length) setAccounts(acctData.accounts) }, [acctData])

  // Net Worth 일별 스냅샷 — 세션당 1회, portfolio + prices 로드 완료 후
  const usdKrw = useStore(s => s.usdKrw)
  const snapshotDoneRef = React.useRef(false)
  const { data: snapPortfolio } = useQuery({
    queryKey: ['portfolio'], queryFn: getPortfolio,
    enabled: !!authToken, staleTime: 60_000,
  })
  const snapTickers = React.useMemo(() => {
    if (!snapPortfolio?.portfolios) return []
    const arr = []
    for (const acc of Object.keys(snapPortfolio.portfolios)) {
      for (const h of (snapPortfolio.portfolios[acc] || [])) arr.push(h.ticker)
    }
    return [...new Set(arr)].filter(Boolean)
  }, [snapPortfolio])
  const { data: snapPrices } = useQuery({
    queryKey: ['prices-batch', snapTickers.join(',')],
    queryFn: () => getPricesBatch(snapTickers),
    enabled: snapTickers.length > 0,
    staleTime: 60_000,
  })
  useEffect(() => {
    if (snapshotDoneRef.current) return
    if (!snapPortfolio?.portfolios || !snapPrices) return
    if (snapTickers.length === 0) return
    // 모든 보유 종목에 대해 가격이 적어도 일부 로드되었으면 캡처
    const pricedCount = snapTickers.filter(t => snapPrices?.[t]?.current_price).length
    if (pricedCount < snapTickers.length * 0.5) return  // 50% 이상 로드 시 캡처
    snapshotDoneRef.current = true
    const payload = {
      portfolios: snapPortfolio.portfolios,
      prices:     snapPrices,
      usd_krw:    usdKrw,
    }
    captureNetWorthSnapshot(payload).catch(() => { snapshotDoneRef.current = false })
    // 종목별 P/L 스냅샷도 함께 (E안-A2)
    capturePnLSnapshot(payload).catch(() => {})
  }, [snapPortfolio, snapPrices, snapTickers, usdKrw])

  // 관리자 상태 폴링 (1분마다 — TTL이 1시간이라 짧게 폴링하지 않아도 됨)
  const { data: adminData } = useQuery({
    queryKey: ['admin-status'],
    queryFn: getAdminStatus,
    enabled: !!authToken,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  })
  useEffect(() => { if (adminData) setAdminStatus(adminData) }, [adminData])

  if (!authToken) return <LoginPage />

  const TabComponent = TABS[activeTab] || HoldingsTab
  // 모바일에서는 사용자 설정과 무관하게 항상 앱 레이아웃 사용 (사이드바·우측패널 압축 방지)
  const isApp = appMode === 'app' || isMobile

  // 앱/모바일 좌우 스와이프 탭 전환 — BottomNav 순서 미러링 (admin은 여정·관리자 포함)
  const appMainRef = useRef(null)
  const isAdminUser = !!currentUser?.is_admin
  const swipeOrder = isAdminUser ? [0,1,2,3,4,5,6,7,8,9] : [0,1,2,3,4,5,6,7]
  useSwipeNav(appMainRef, {
    order: swipeOrder, active: activeTab, onChange: setActiveTab, enabled: isApp,
  })

  /* 탭 전환 시 페이드+슬라이드 모션. mode="wait"로 이전 탭 exit 후 새 탭 enter.
     ErrorBoundary로 한 탭 crash 시 흰화면 대신 명확한 안내 표시.
     Suspense로 lazy 청크 로딩 가림 (첫 진입만 짧은 LOADING) */
  const tabBody = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
        style={{ minHeight: '100%' }}
      >
        <ErrorBoundary name={`Tab#${activeTab}`} key={`eb-${activeTab}`}>
          <Suspense fallback={<TabLoading />}>
            <TabComponent />
          </Suspense>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  )

  /* ── 웹 모드 ──
     [SideNav(220)] | [TopNavBar + MarketBar + (MainCol(8) + RightPanel(4))]
  */
  if (!isApp) {
    return (
      <div className="web-root">
        <SideNavBar />
        <div className="web-right">
          <TopNavBar />
          <MarketBar />
          <div className="web-body-grid">
            <main className="web-main-col">
              {tabBody}
            </main>
            <RightPanel />
          </div>
        </div>
        <InstallPrompt />
        <KeyboardShortcuts />
        <ChangelogModal />
      </div>
    )
  }

  /* ── 앱 모드 ── */
  return (
    <div className="app-root app-mode-app">
      <div className="app-top-controls">
        <NotificationsBell />
        <ThemeQuickToggle />
        {/* 모바일에서는 웹 모드 강제 차단 — 버튼 숨김 */}
        {!isMobile && (
          <button className="app-web-hint" onClick={() => setAppMode('web')} title="웹 모드로 전환">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            웹
          </button>
        )}
      </div>
      <MarketBar />
      <main className="app-main" ref={appMainRef}>
        {tabBody}
      </main>
      <BottomNav />
      <InstallPrompt />
      <KeyboardShortcuts />
      <ChangelogModal />
    </div>
  )
}

/* 앱 모드 상단의 테마 빠른 전환 (light → dark → pro 순환) */
function ThemeQuickToggle() {
  const theme      = useStore(s => s.theme)
  const cycleTheme = useStore(s => s.cycleTheme)
  const icon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '📈'
  const label = theme === 'light' ? '화이트' : theme === 'dark' ? '다크' : '프로'
  return (
    <button className="app-theme-hint" onClick={cycleTheme}
      title={`테마: ${label} (탭하여 변경)`}>
      <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
      {label}
    </button>
  )
}

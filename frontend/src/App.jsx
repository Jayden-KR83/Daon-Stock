import React, { useEffect, useRef, Suspense, lazy } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from './store'
import { useSwipeNav } from './useSwipeNav'
import { getUsdKrw, getApiKeyStatus, authMe, getAdminStatus, getAccounts, getPortfolio, getPricesBatch, captureNetWorthSnapshot } from './api'
import MarketBar from './components/MarketBar'
import BottomNav, { navTabOrder } from './components/BottomNav'
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
import Tour, { isTourDone } from './components/Tour'
import changelog from './changelog.json'
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
const DiscoverTab     = lazy(() => import('./tabs/DiscoverTab'))

// 탭 순서: 포트폴리오(0) 관심(1) 분석(2) 종목(3) 시장(4) 등록(5) 설정(6) 가이드(7) 여정(8) 관리자(9) 발굴(10)
const TABS = [HoldingsTab, WatchlistTab, AllocationTab, ChartTab, TrendsTab, AddTab, ManageTab, GuideTab, PresentationTab, AdminTab, DiscoverTab]

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
  const layoutMode         = useStore(s => s.layoutMode)
  const setLayoutMode      = useStore(s => s.setLayoutMode)
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

  // 레이아웃에 맞춰 viewport meta 교체.
  // 좁은 기기에서 '웹(데스크톱) 화면'을 고르면 width=device-width 로는 데스크톱 3열이
  // 390px 로 압축돼 금액이 한 글자씩 쪼개진다(2026-08-02 발생). 데스크톱 폭을 명시해
  // 브라우저가 축소 렌더하도록 한다 = 브라우저 '데스크톱 사이트 요청'과 같은 원리.
  // 앱 모드로 돌아오면 원래 값으로 복원한다(줌 금지 포함).
  //
  // ⚠️ isApp 을 쓰지 않고 layoutMode/isMobile 로 직접 계산한다. isApp 은 이 아래에서
  // const 로 선언되므로, 여기서 의존성 배열에 넣으면 렌더 중 TDZ ReferenceError 가
  // 나서 앱 전체가 백지가 된다(2026-08-02 실제로 배포까지 나갔던 사고).
  const wantsAppLayout = layoutMode === 'app' || (layoutMode === 'auto' && isMobile)
  useEffect(() => {
    const el = document.querySelector('meta[name="viewport"]')
    if (!el) return
    el.setAttribute('content', wantsAppLayout
      ? 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      : 'width=1180, user-scalable=yes')   // 데스크톱 폭 고정 + 핀치줌 허용
  }, [wantsAppLayout])

  // 탭 청크 유휴 프리페치 — 탭을 처음 누를 때 청크를 받느라 1~1.8초 걸리던 것을 없앤다.
  // 계측(2026-08-02): 종목 1047ms · 발굴 1840ms(콜드) → 프리페치 후 즉시 전환.
  // requestIdleCallback 으로 초기 렌더·첫 데이터 요청이 끝난 뒤에만 받는다.
  useEffect(() => {
    if (!authToken) return
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1200))
    const handle = idle(() => {
      // 사용 빈도 순 — 먼저 받은 것이 먼저 캐시된다
      import('./tabs/AllocationTab')
      import('./tabs/ChartTab')
      import('./tabs/WatchlistTab')
      import('./tabs/DiscoverTab')
      import('./tabs/TrendsTab')
    }, { timeout: 4000 })
    return () => window.cancelIdleCallback?.(handle)
  }, [authToken])

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
      for (const h of (snapPortfolio.portfolios[acc] || [])) {
        if (String(h.asset_type || "").toUpperCase() === "UNLISTED_FUND") continue
        arr.push(h.ticker)
      }
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

  // ── 최초 로그인 온보딩 투어 ──
  // 사용자별로 1회만 자동 실행한다(localStorage). 계정을 바꾸면 그 계정 기준으로 다시 판단.
  // 첫 화면의 데이터가 어느 정도 자리잡은 뒤에 띄운다 — 빈 화면을 가리키면 설명이 헛돈다.
  const openTour = useStore(s => s.openTour)
  const tourOpen = useStore(s => s.tourOpen)
  const tourUserRef  = React.useRef(null)
  const tourTimerRef = React.useRef(0)
  // 투어를 띄울지 판단이 끝나기 전에는 '새 소식' 모달을 렌더하지 않는다.
  // 먼저 뜨면 신규 사용자가 읽는 도중 투어가 열려 모달을 빼앗는다.
  const [chromeReady, setChromeReady] = React.useState(false)
  useEffect(() => {
    const uid = currentUser?.user_id
    if (!authToken || !uid) return
    if (tourUserRef.current === uid) return
    tourUserRef.current = uid
    if (isTourDone(uid)) { setChromeReady(true); return }
    // 신규 사용자에게 '새 소식' 모달은 의미가 없다(전부 새 것). 투어와 겹치지 않게 본 것으로 처리.
    try { localStorage.setItem('daon_last_seen_version', changelog[0]?.version || '') } catch {}
    // ⚠️ 타이머를 이 effect 의 cleanup 으로 지우면 안 된다.
    // currentUser 는 authMe 응답마다 **새 객체**로 바뀌어 effect 가 재실행되는데,
    // 그때 cleanup 이 타이머를 취소하고 재실행분은 위 ref 가드에 걸려 조기 반환한다
    // → 투어가 영영 안 뜬다(2026-08-21 실제로 이 증상으로 안 열렸다).
    // 타이머는 ref 에 두고 언마운트에서만 정리한다.
    clearTimeout(tourTimerRef.current)
    tourTimerRef.current = setTimeout(() => openTour(), 900)
    setChromeReady(true)   // 이 시점엔 last_seen_version 을 이미 써 둬서 모달이 스스로 안 뜬다
  }, [authToken, currentUser, openTour])
  useEffect(() => () => clearTimeout(tourTimerRef.current), [])

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

  // 'auto'는 화면 폭으로 결정. 사용자가 직접 고른 'web'/'app'은 폭과 무관하게 존중한다
  // (모바일에서도 웹 레이아웃을 볼 수 있어야 한다는 요구 — 좁은 화면은 가로 스크롤로 감당).
  const isApp = wantsAppLayout

  // 앱/모바일 좌우 스와이프 탭 전환 — 순서는 BottomNav에서 직접 가져온다.
  // (예전엔 배열을 여기 하드코딩해 하단바와 어긋날 수 있었다)
  //
  // ⚠️ 이 훅들은 아래 `if (!authToken)` 조기 반환보다 반드시 위에 있어야 한다.
  // 아래에 두면 로그아웃 상태(훅 N개) → 로그인 직후(훅 N+2개)로 개수가 바뀌어
  // React #310("Rendered more hooks than during the previous render")로 흰 화면이 된다.
  // 저장된 토큰으로 새로고침하면 첫 렌더부터 개수가 같아 드러나지 않던 잠복 버그였고,
  // 같은 세션에서 로그인/데모 진입할 때만 재현됐다.
  const appMainRef = useRef(null)
  const isAdminUser = !!currentUser?.is_admin
  const swipeOrder = React.useMemo(() => navTabOrder(isAdminUser), [isAdminUser])
  useSwipeNav(appMainRef, {
    order: swipeOrder, active: activeTab, onChange: setActiveTab,
    enabled: isApp && !!authToken,
  })

  if (!authToken) return <LoginPage />

  const TabComponent = TABS[activeTab] || HoldingsTab

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
        {chromeReady && !tourOpen && <ChangelogModal />}
        <Tour />
      </div>
    )
  }

  /* ── 앱 모드 ── */
  return (
    <div className="app-root app-mode-app">
      <div className="app-top-controls">
        <NotificationsBell />
        <ThemeQuickToggle />
        {/* 모바일에서도 웹 레이아웃으로 전환 가능 (이전에는 버튼을 숨겨 되돌릴 수 없었다) */}
        <button className="app-web-hint" onClick={() => setLayoutMode('web')}
          title="웹(데스크톱) 화면으로 전환">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          웹
        </button>
      </div>
      <MarketBar />
      <main className="app-main" ref={appMainRef}>
        {tabBody}
      </main>
      <BottomNav />
      <InstallPrompt />
      <KeyboardShortcuts />
      {chromeReady && !tourOpen && <ChangelogModal />}
      <Tour />
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

import React, { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore } from './store'
import { getUsdKrw, getApiKey, authMe } from './api'
import MarketBar from './components/MarketBar'
import BottomNav from './components/BottomNav'
import HoldingsTab from './tabs/HoldingsTab'
import WatchlistTab from './tabs/WatchlistTab'
import ExploreTab from './tabs/ExploreTab'
import AllocationTab from './tabs/AllocationTab'
import ChartTab from './tabs/ChartTab'
import TrendsTab from './tabs/TrendsTab'
import AddTab from './tabs/AddTab'
import ManageTab from './tabs/ManageTab'
import GuideTab from './tabs/GuideTab'
import PresentationTab from './tabs/PresentationTab'
import LoginPage from './tabs/LoginPage'
import './App.css'

// 탭 순서: 보유(0) 관심(1) 탐색(2) 비중(3) 차트(4) 트렌드(5) 추가(6) 관리(7) 설명서(8) 여정(9)
const TABS = [HoldingsTab, WatchlistTab, ExploreTab, AllocationTab, ChartTab, TrendsTab, AddTab, ManageTab, GuideTab, PresentationTab]

export default function App() {
  const activeTab       = useStore(s => s.activeTab)
  const setUsdKrw       = useStore(s => s.setUsdKrw)
  const setHasAnthropicKey = useStore(s => s.setHasAnthropicKey)
  const appMode         = useStore(s => s.appMode)
  const setAppMode      = useStore(s => s.setAppMode)
  const authToken       = useStore(s => s.authToken)
  const setAuth         = useStore(s => s.setAuth)

  useEffect(() => {
    const el = document.getElementById('loading')
    if (el) el.style.display = 'none'
  }, [])

  // 앱 시작 시 토큰 유효성 확인
  const { data: meData, isError: meError } = useQuery({
    queryKey: ['auth-me'],
    queryFn: authMe,
    enabled: !!authToken,
    retry: false,
    staleTime: 5 * 60_000,
  })
  useEffect(() => {
    if (meData) setAuth(authToken, meData)
  }, [meData])
  useEffect(() => {
    if (meError) setAuth(null, null)  // 토큰 만료 → 로그아웃
  }, [meError])

  const { data: rateData } = useQuery({
    queryKey: ['usdkrw'],
    queryFn: getUsdKrw,
    enabled: !!authToken,
    staleTime: 3_600_000,
  })
  useEffect(() => {
    if (rateData?.rate) setUsdKrw(rateData.rate)
  }, [rateData])

  // 앱 시작 시 서버에서 API 키 로드 (모든 기기 공유)
  const { data: apikeyData } = useQuery({
    queryKey: ['apikey'],
    queryFn: getApiKey,
    enabled: !!authToken,
    staleTime: Infinity,
  })
  useEffect(() => {
    if (apikeyData) setHasAnthropicKey(apikeyData.has_key)
  }, [apikeyData])

  // 미로그인 → 로그인 페이지
  if (!authToken) return <LoginPage />

  const TabComponent = TABS[activeTab] || HoldingsTab
  const isApp = appMode === 'app'

  return (
    <div className={`app-root ${isApp ? 'app-mode-app' : 'app-mode-web'}`}>
      <div className="view-mode-toggle">
        <button className={`vmt-btn ${!isApp ? 'active' : ''}`} onClick={() => setAppMode('web')}>🖥 웹</button>
        <button className={`vmt-btn ${isApp ? 'active' : ''}`} onClick={() => setAppMode('app')}>📱 앱</button>
      </div>
      <MarketBar />
      <main className="app-main">
        <TabComponent />
      </main>
      <BottomNav />
    </div>
  )
}

import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 20_000,
})

// 모든 요청에 Bearer 토큰 자동 첨부
api.interceptors.request.use(config => {
  const token = localStorage.getItem('authToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const getPortfolio    = ()           => api.get('/portfolio').then(r => r.data)
export const savePortfolio   = (data)       => api.put('/portfolio', data).then(r => r.data)
export const addHolding      = (acct, h)    => api.post(`/portfolio/${acct}/add`, h).then(r => r.data)
export const deleteHolding   = (acct, tkr) => api.delete(`/portfolio/${acct}/${tkr}`).then(r => r.data)
export const addWatchlist    = (item)       => api.post('/watchlist/add', item).then(r => r.data)
export const deleteWatchlist = (tkr)        => api.delete(`/watchlist/${tkr}`).then(r => r.data)

export const getMarket       = ()           => api.get('/market').then(r => r.data)
export const getUsdKrw       = ()           => api.get('/usdkrw').then(r => r.data)
export const getStock        = (tkr)        => api.get(`/stock/${tkr}`).then(r => r.data)
export const getStockPrice   = (tkr)        => api.get(`/stock/${tkr}/price`).then(r => r.data)
export const getEarnings     = (tkr)        => api.get(`/stock/${tkr}/earnings`).then(r => r.data)
export const getNews         = (tkr)        => api.get(`/stock/${tkr}/news`).then(r => r.data)
export const searchStocks    = (q)          => api.get('/search', { params: { q } }).then(r => r.data)

export const getMostActiveUs = ()           => api.get('/most-active/us').then(r => r.data)
export const getMostActiveKr = ()           => api.get('/most-active/kr').then(r => r.data)
export const getSectorUs     = ()           => api.get('/sector/us').then(r => r.data)
export const getSectorKr     = ()           => api.get('/sector/kr').then(r => r.data)
export const getSectorStocks = (mkt, sec)  => api.get(`/sector/stocks/${mkt}/${encodeURIComponent(sec)}`).then(r => r.data)
export const getHeatmap      = ()           => api.get('/heatmap').then(r => r.data)
export const getTrendsNews   = ()           => api.get('/trends/news').then(r => r.data)
export const getDiscover     = (params)     => api.get('/discover', { params }).then(r => r.data)
export const rescanDiscover  = ()           => api.post('/discover/rescan').then(r => r.data)

export const getPricesBatch   = (tickers)   => api.get('/prices', { params: { tickers: tickers.join(',') } }).then(r => r.data)
export const analyzePortfolio  = (body)      => api.post('/portfolio/analyze', body, { timeout: 90_000 }).then(r => r.data)
export const getPortfolioMetrics  = (body)   => api.post('/portfolio/metrics', body, { timeout: 120_000 }).then(r => r.data)
export const getPortfolioMetricsCached = (scope = 'ALL') =>
  api.get('/portfolio/metrics/cached', { params: { scope } }).then(r => r.data)
export const getPortfolioStrategy = (body)   => api.post('/portfolio/strategy', body, { timeout: 60_000 }).then(r => r.data)
export const getPortfolioStrategyCached = (scope = 'ALL') =>
  api.get('/portfolio/strategy/cached', { params: { scope } }).then(r => r.data)
// 비동기 전략 생성 폴링 — status: done(+data) | running | error(+error) | unknown
export const pollPortfolioStrategy = (fp, scope = 'ALL') =>
  api.get('/portfolio/strategy/poll', { params: { fp, scope } }).then(r => r.data)

// ETF 비교 도구
export const getEtfCompare    = (tickers) =>
  api.get('/etf/compare', { params: { tickers: tickers.join(',') }, timeout: 30_000 }).then(r => r.data)
export const getEtfCompareAi  = (etfs) =>
  api.post('/etf/compare/ai', { etfs }, { timeout: 90_000 }).then(r => r.data)
export const analyzeYoutube   = (body)      => api.post('/youtube/analyze', body, { timeout: 60_000 }).then(r => r.data)

export const getFundamentals = (tkr)  => api.get(`/stock/${tkr}/fundamentals`).then(r => r.data)
export const getPeers        = (tkr)  => api.get(`/stock/${tkr}/peers`).then(r => r.data)
export const getFinancialsTrend = (tkr) => api.get(`/stock/${tkr}/financials-trend`).then(r => r.data)

// 웹 검색 + Sonnet 4.6 분석은 30~120초 소요 — 200초 타임아웃
// body: { name?, force_refresh? }
export const analyzeStock = (tkr, body)   => api.post(`/stock/${tkr}/analyze`, body, { timeout: 200_000 }).then(r => r.data)

// 캐시된 분석 조회 (분석 트리거 안 함). 응답: {cached: bool, data?, computed_at?}
export const getCachedAnalysis = (tkr, name='') =>
  api.get(`/stock/${tkr}/analyze/cached`, { params: { name } }).then(r => r.data)

export const getApiKey  = ()      => api.get('/settings/apikey').then(r => r.data)
export const getApiKeyStatus = () => api.get('/settings/apikey/status').then(r => r.data)
export const saveApiKey = (key)   => api.put('/settings/apikey', { key }).then(r => r.data)

export const getAdminStatus = () => api.get('/admin/status').then(r => r.data)
export const adminUnlock    = (password) => api.post('/admin/unlock', { password }).then(r => r.data)
export const adminLock      = ()         => api.post('/admin/lock').then(r => r.data)
export const adminSetPassword = (current_password, new_password) =>
  api.post('/admin/set-password', { current_password, new_password }).then(r => r.data)

export const authRegister = (body) => api.post('/auth/register', body).then(r => r.data)
export const authLogin    = (body) => api.post('/auth/login', body).then(r => r.data)
export const authDemo     = ()     => api.post('/auth/demo').then(r => r.data)   // 로그인 없이 둘러보기
export const authLogout   = ()     => api.post('/auth/logout').then(r => r.data)
export const authMe       = ()     => api.get('/auth/me').then(r => r.data)
export const updateProfile = (nickname) => api.put('/auth/profile', { nickname }).then(r => r.data)

export const listUsers     = ()    => api.get('/admin/users').then(r => r.data)
export const getBackup     = ()    => api.get('/portfolio/backup').then(r => r.data)
export const restoreBackup = ()    => api.post('/portfolio/restore').then(r => r.data)

// 사용자 가입 승인/거부/AI 권한 (admin 전용)
export const adminApproveUser  = (uid, reason='') => api.post(`/admin/users/${uid}/approve`,  { reason }).then(r => r.data)
export const adminRejectUser   = (uid, reason='') => api.post(`/admin/users/${uid}/reject`,   { reason }).then(r => r.data)
export const adminSuspendUser  = (uid, reason='') => api.post(`/admin/users/${uid}/suspend`,  { reason }).then(r => r.data)
export const adminReinstateUser = (uid) => api.post(`/admin/users/${uid}/reinstate`).then(r => r.data)
export const adminToggleAi     = (uid, enabled)   => api.post(`/admin/users/${uid}/ai-toggle`, { enabled }).then(r => r.data)
export const adminPromoteUser  = (uid, is_admin)  => api.post(`/admin/users/${uid}/promote`,  { is_admin }).then(r => r.data)
export const adminDeleteUser   = (uid)            => api.delete(`/admin/users/${uid}`).then(r => r.data)
export const adminGetStats     = ()               => api.get('/admin/stats').then(r => r.data)
export const adminGetAuditLog  = (params = {})    => api.get('/admin/audit-log', { params }).then(r => r.data)
export const getInviteCode     = ()               => api.get('/admin/invite_code').then(r => r.data)
export const setInviteCode     = (code)           => api.put('/admin/invite_code', { code }).then(r => r.data)

// 동적 계좌
export const getAccounts    = ()        => api.get('/accounts').then(r => r.data)
export const addAccount     = (body)    => api.post('/accounts', body).then(r => r.data)
export const updateAccount  = (key, body) => api.put(`/accounts/${key}`, body).then(r => r.data)
export const deleteAccount  = (key)     => api.delete(`/accounts/${key}`).then(r => r.data)

// 종목별 메모/투자노트 (P0-3)
export const getNote     = (ticker) => api.get(`/notes/${ticker}`).then(r => r.data)
export const listNotes   = ()       => api.get('/notes').then(r => r.data)
export const upsertNote  = (ticker, body) => api.put(`/notes/${ticker}`, body).then(r => r.data)

// 거래내역 (P0-4)
export const listTransactions = (ticker = '', limit = 200) =>
  api.get('/transactions', { params: { ticker, limit } }).then(r => r.data)
export const addTransaction = (body) => api.post('/transactions', body).then(r => r.data)
export const deleteTransaction = (id) => api.delete(`/transactions/${id}`).then(r => r.data)

// 백테스트 (P1-2)
export const runBacktest = (body) => api.post('/backtest', body, { timeout: 60_000 }).then(r => r.data)

// Net Worth 스냅샷 (A1)
export const captureNetWorthSnapshot = (body) =>
  api.post('/snapshots/capture', body, { timeout: 10_000 }).then(r => r.data)
export const getNetWorthSnapshots = (days = 365) =>
  api.get('/snapshots/networth', { params: { days } }).then(r => r.data)

// Portfolio Health Score (B1)
export const getPortfolioHealth = (body) =>
  api.post('/portfolio/health', body, { timeout: 30_000 }).then(r => r.data)

// 룰 기반 리밸런싱 경고 (B3)
export const getPortfolioAlerts = (body) =>
  api.post('/portfolio/alerts', body, { timeout: 15_000 }).then(r => r.data)

// E안-A2 종목별 P/L 스냅샷
export const capturePnLSnapshot = (body) =>
  api.post('/snapshots/pnl/capture', body, { timeout: 10_000 }).then(r => r.data)
export const getPnLHistory = (ticker, days = 365) =>
  api.get(`/snapshots/pnl/${ticker}`, { params: { days } }).then(r => r.data)

// C안-C1 관심종목 그룹
export const updateWatchlistGroup = (ticker, group_name) =>
  api.put(`/watchlist/${ticker}/group`, { ticker, group_name }).then(r => r.data)
export const getWatchlistGroups = () =>
  api.get('/watchlist/groups').then(r => r.data)

// B안-B2 상관관계 매트릭스
export const getCorrelation = (body) =>
  api.post('/portfolio/correlation', body, { timeout: 40_000 }).then(r => r.data)

// B안-B4 실적 캘린더
export const getEarningsCalendar = (body) =>
  api.post('/earnings/calendar', body, { timeout: 30_000 }).then(r => r.data)

// B안-B5 차트 비교 시계열
export const getCompareSeries = (body) =>
  api.post('/compare/series', body, { timeout: 20_000 }).then(r => r.data)

// 배당금 이력 + 연간 예상 + 다가오는 ex-date
export const getPortfolioDividends = (body) =>
  api.post('/portfolio/dividends', body, { timeout: 40_000 }).then(r => r.data)

// AI 분석 결과 외부 import (admin) — Claude Code/채팅 등에서 만든 JSON inject
export const importAiCache = (items, overwrite = true) =>
  api.post('/admin/ai_cache/import', { items, overwrite }, { timeout: 30_000 }).then(r => r.data)
export const listAiCache = () =>
  api.get('/admin/ai_cache/list').then(r => r.data)

// 가격 알림 (목표가·손절가)
export const listAlerts = () =>
  api.get('/alerts').then(r => r.data)
export const upsertAlert = (body) =>
  api.post('/alerts', body).then(r => r.data)
export const deleteAlert = (id) =>
  api.delete(`/alerts/${id}`).then(r => r.data)
export const listNotifications = (unreadOnly = false, limit = 50) =>
  api.get('/notifications', { params: { unread_only: unreadOnly, limit } }).then(r => r.data)
export const markNotificationRead = (id) =>
  api.post(`/notifications/${id}/read`).then(r => r.data)
export const markAllNotificationsRead = () =>
  api.post('/notifications/read_all').then(r => r.data)

// Web Push (V2) — 브라우저 종료 시에도 도달하는 푸시
export const getVapidPublicKey = () => api.get('/push/public_key').then(r => r.data)
export const subscribePush     = (sub) => api.post('/push/subscribe', sub).then(r => r.data)
export const unsubscribePush   = (endpoint) => api.post('/push/unsubscribe', { endpoint }).then(r => r.data)
export const sendTestPush      = () => api.post('/push/test').then(r => r.data)

// 목표 기반 포트폴리오 (Goal-Based Investing)
export const listGoals   = ()     => api.get('/goals').then(r => r.data)
export const upsertGoal  = (body) => api.post('/goals', body).then(r => r.data)
export const deleteGoal  = (id)   => api.delete(`/goals/${id}`).then(r => r.data)
export const projectGoal = (body) => api.post('/goals/project', body).then(r => r.data)

export default api

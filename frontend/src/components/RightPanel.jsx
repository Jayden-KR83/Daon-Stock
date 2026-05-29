import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMarket, getPortfolio, getPricesBatch, getNews, getPeers, addWatchlist, deleteWatchlist } from '../api'
import { useStore } from '../store'
import Sparkline from './Sparkline'
import LogoCircle from './LogoCircle'
import { SkeletonRow, SkeletonNews } from './Skeleton'
import { displayName } from '../utils/displayName'
import './RightPanel.css'

const isKr = tkr => /^A?\d{6}$/.test(tkr)

/* ── 가격 포맷 ── */
function fmtPrice(name, price) {
  if (price == null || isNaN(price)) return '—'
  if (name === 'KOSPI') return price.toFixed(0)
  if (name === 'VIX')   return price.toFixed(2)
  if (name === 'USD/KRW') return `₩${price.toFixed(0)}`
  if (name === '10Y채권') return `${price.toFixed(2)}%`
  if (name === 'Gold')  return `$${price.toFixed(0)}`
  if (price > 1000) return price.toFixed(0)
  return price.toFixed(2)
}

/* ── Market Status (공통 하단 위젯) ── */
function MarketStatus() {
  const now     = new Date()
  const kstHour = (now.getUTCHours() + 9) % 24
  const estHour = (now.getUTCHours() - 4 + 24) % 24
  const kstMin  = now.getUTCMinutes()
  const isKST   = (kstHour > 9 || (kstHour === 9 && kstMin >= 0))
    ? kstHour < 15 || (kstHour === 15 && kstMin < 30)
    : false
  const isNYSE  = estHour >= 9.5 && estHour < 16

  return (
    <div className="rp-market-status">
      <div className="rp-status-header">
        <span className="rp-status-label">Market Status</span>
        <div className="rp-status-dot-wrap">
          <span className={`rp-status-dot ${isNYSE || isKST ? 'open' : 'closed'}`} />
          <span className={`rp-status-text ${isNYSE || isKST ? 'open' : 'closed'}`}>
            {isNYSE || isKST ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
      </div>
      <div className="rp-status-rows">
        <div className="rp-status-row">
          <span className="rp-status-market">NYSE / NASDAQ</span>
          <span className={`rp-status-badge ${isNYSE ? 'open' : 'closed'}`}>
            {isNYSE ? '거래중' : '마감'}
          </span>
        </div>
        <div className="rp-status-row">
          <span className="rp-status-market">KRX (코스피)</span>
          <span className={`rp-status-badge ${isKST ? 'open' : 'closed'}`}>
            {isKST ? '거래중' : '마감'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Market Intel 공통 섹션 ── */
function MarketIntelSection({ market }) {
  const intelItems = market.filter(m =>
    ['S&P500', 'Nasdaq', 'KOSPI', 'VIX', 'Gold', 'USD/KRW'].includes(m.name)
  )
  if (intelItems.length === 0) return null
  return (
    <section>
      <div className="rp-section-header">
        <h2 className="rp-section-title">Market Intel</h2>
      </div>
      <div className="rp-intel-card">
        {intelItems.map(item => {
          const up = (item.pct ?? 0) >= 0
          return (
            <div key={item.ticker} className="rp-intel-row">
              <span className="rp-intel-label">{item.name}</span>
              <span className="rp-intel-value" style={{ color: up ? '#16A34A' : '#DC2626' }}>
                {fmtPrice(item.name, item.price)}
                <span style={{ fontSize: 10, marginLeft: 4, fontWeight: 700 }}>
                  {up ? '▲' : '▼'}{Math.abs(item.pct ?? 0).toFixed(2)}%
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════
   탭 0, 3: 포트폴리오 Today 패널
   보유 중 종목의 당일 등락 Top/Bottom
   ════════════════════════════════════════════ */
function PortfolioPanel({ market }) {
  const setChartTicker = useStore(s => s.setChartTicker)

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    staleTime: 60_000,
  })

  const allHoldings = React.useMemo(() => {
    if (!portfolio || !portfolio.portfolios) return []
    // 동적 계좌 — API 응답의 모든 키 순회 (사용자별 정의된 계좌)
    return Object.keys(portfolio.portfolios).flatMap(acc =>
      (portfolio.portfolios[acc] || []).map(h => ({ ...h, account: acc }))
    )
  }, [portfolio])

  const tickers = allHoldings.map(h => h.ticker)
  const { data: prices = {} } = useQuery({
    queryKey: ['prices-batch', tickers.join(',')],
    queryFn: () => getPricesBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 60_000,
  })

  const withPct = React.useMemo(() =>
    allHoldings
      .map(h => ({
        ...h,
        pct:   prices[h.ticker]?.change_pct ?? 0,
        price: prices[h.ticker]?.current_price ?? h.avg_price,
        spark: prices[h.ticker]?.spark,
      }))
      .sort((a, b) => b.pct - a.pct),
    [allHoldings, prices]
  )

  const gainers = withPct.filter(h => h.pct > 0).slice(0, 3)
  const losers  = withPct.filter(h => h.pct < 0).slice(-2).reverse()

  return (
    <>
      {/* ── Today's Winners ── */}
      <section>
        <div className="rp-section-header">
          <h2 className="rp-section-title">Today's Winners</h2>
          <span className="rp-section-badge">내 포트폴리오</span>
        </div>
        <div className="rp-list">
          {!portfolio
            ? [1,2,3].map(i => <SkeletonRow key={i} />)
            : gainers.length === 0
            ? <div className="rp-empty">오늘 상승 중인 종목 없음</div>
            : gainers.map(h => (
              <div key={h.ticker} className="rp-row rp-row-btn"
                onClick={() => setChartTicker(h.ticker)}>
                <LogoCircle ticker={h.ticker} size={36} />
                <div className="rp-row-info">
                  <div className="rp-row-name">{h.name || h.ticker}</div>
                  <div className="rp-row-price">
                    {isKr(h.ticker)
                      ? `₩${Math.round(h.price).toLocaleString()}`
                      : `$${h.price.toFixed(2)}`}
                  </div>
                </div>
                <div className="rp-row-right">
                  {h.spark && <Sparkline values={h.spark} positive={true} width={44} height={18} />}
                  <div className="rp-pct pos">+{h.pct.toFixed(2)}%</div>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* ── Today's Losers ── */}
      {losers.length > 0 && (
        <section>
          <div className="rp-section-header">
            <h2 className="rp-section-title">Today's Losers</h2>
          </div>
          <div className="rp-list">
            {losers.map(h => (
              <div key={h.ticker} className="rp-row rp-row-btn"
                onClick={() => setChartTicker(h.ticker)}>
                <LogoCircle ticker={h.ticker} size={36} />
                <div className="rp-row-info">
                  <div className="rp-row-name">{h.name || h.ticker}</div>
                  <div className="rp-row-price">
                    {isKr(h.ticker)
                      ? `₩${Math.round(h.price).toLocaleString()}`
                      : `$${h.price.toFixed(2)}`}
                  </div>
                </div>
                <div className="rp-row-right">
                  {h.spark && <Sparkline values={h.spark} positive={false} width={44} height={18} />}
                  <div className="rp-pct neg">{h.pct.toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <MarketIntelSection market={market} />
    </>
  )
}

/* ════════════════════════════════════════════
   탭 1: 관심 종목 뉴스 피드
   관심 목록 상위 종목의 최신 뉴스를 통합 표시
   ════════════════════════════════════════════ */
function WatchlistPanel() {
  const setChartTicker = useStore(s => s.setChartTicker)

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    staleTime: 60_000,
  })
  const watchlist = portfolio?.watchlist || []
  const topTickers = watchlist.slice(0, 5).map(w => w.ticker)

  // 관심 종목 상위 5개의 뉴스 병렬 조회
  const newsQueries = topTickers.map(tkr => useQuery({
    queryKey: ['stock-news', tkr],
    queryFn:  () => getNews(tkr),
    enabled:  !!tkr,
    staleTime: 1_800_000,
    retry: 0,
  }))

  const aggregatedNews = React.useMemo(() => {
    const seen = new Set()
    const out = []
    topTickers.forEach((tkr, i) => {
      const items = newsQueries[i]?.data?.news || []
      for (const n of items.slice(0, 2)) {
        if (!n.title || seen.has(n.title)) continue
        seen.add(n.title)
        out.push({ ...n, ticker: tkr })
      }
    })
    return out.slice(0, 8)
  }, [topTickers.join(','), newsQueries.map(q => q.data).join('|')])

  const anyLoading = newsQueries.some(q => q.isLoading)

  return (
    <>
      <section>
        <div className="rp-section-header">
          <h2 className="rp-section-title">관심 종목 뉴스</h2>
          {watchlist.length > 0 && (
            <span className="rp-section-badge">{watchlist.length}개 추적</span>
          )}
        </div>
        {watchlist.length === 0 ? (
          <div className="rp-empty">관심 종목을 먼저 추가해주세요</div>
        ) : anyLoading && aggregatedNews.length === 0 ? (
          <div className="rp-news-list">{[1,2,3,4].map(i => <SkeletonNews key={i} />)}</div>
        ) : aggregatedNews.length === 0 ? (
          <div className="rp-empty">관련 뉴스를 찾지 못했습니다</div>
        ) : (
          <div className="rp-news-list">
            {aggregatedNews.map((n, i) => {
              const w = watchlist.find(x => x.ticker === n.ticker)
              const label = displayName(n.ticker, w?.name)
              return (
              <a key={i} href={n.link} target="_blank" rel="noreferrer"
                className="rp-news-item">
                <div className="rp-news-dot" />
                <div style={{ minWidth: 0 }}>
                  <div className="rp-news-title">{n.title}</div>
                  <div className="rp-news-pub">
                    <span onClick={(e) => { e.preventDefault(); setChartTicker(n.ticker) }}
                      style={{ color: '#0EA5E9', fontWeight: 700, cursor: 'pointer' }}>
                      {label}
                    </span>
                    <span style={{ color: '#CBD5E1', margin: '0 6px' }}>·</span>
                    {n.publisher}{n.date ? ` · ${n.date}` : ''}
                  </div>
                </div>
              </a>
              )})}
          </div>
        )}
      </section>
    </>
  )
}

/* ════════════════════════════════════════════
   탭 4: 차트 종목 컨텍스트 패널
   해당 종목 뉴스 + 관련 종목 (Peers)
   ════════════════════════════════════════════ */
function ChartPanel() {
  const qc = useQueryClient()
  const chartTicker    = useStore(s => s.chartTicker)
  const setChartTicker = useStore(s => s.setChartTicker)
  const ticker = chartTicker || ''

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'], queryFn: getPortfolio, staleTime: 60_000,
  })
  const watchSet = React.useMemo(() =>
    new Set((portfolio?.watchlist || []).map(w => w.ticker)), [portfolio])
  const holdingSet = React.useMemo(() => {
    const s = new Set()
    const accs = Object.keys(portfolio?.portfolios || {})
    for (const acc of accs)
      for (const h of (portfolio?.portfolios?.[acc] || [])) s.add(h.ticker)
    return s
  }, [portfolio])

  async function toggleWatch(tkr, name = '') {
    if (watchSet.has(tkr)) {
      await deleteWatchlist(tkr)
    } else {
      await addWatchlist({ ticker: tkr, name: name || tkr, exchange: '', qtype: '' })
    }
    qc.invalidateQueries({ queryKey: ['portfolio'] })
  }

  const { data: newsData, isLoading: newsLoading } = useQuery({
    queryKey: ['stock-news', ticker],
    queryFn:  () => getNews(ticker),
    enabled:  !!ticker,
    staleTime: 1_800_000,
    retry: 0,
  })
  const newsItems = newsData?.news || []

  const isKrTicker = /^A?\d{6}$/.test(ticker)
  const { data: peers = [] } = useQuery({
    queryKey: ['stock-peers', ticker],
    queryFn:  () => getPeers(ticker),
    enabled:  !!ticker && !isKrTicker,   // KR 종목은 peers 없음 → 요청 안 함
    staleTime: 3_600_000,
    retry: 0,
  })

  if (!ticker) {
    return (
      <div className="rp-chart-placeholder">
        <div className="rp-chart-placeholder-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        </div>
        <div className="rp-chart-placeholder-text">종목을 선택하면<br />관련 뉴스와 유사 종목이<br />표시됩니다</div>
      </div>
    )
  }

  const isStarred = watchSet.has(ticker)
  const isOwned   = holdingSet.has(ticker)

  // 이름 후보: 보유 → 관심 → 티커 자체
  const nameFromPortfolio = React.useMemo(() => {
    const accs = Object.keys(portfolio?.portfolios || {})
    for (const acc of accs)
      for (const h of (portfolio?.portfolios?.[acc] || []))
        if (h.ticker === ticker) return h.name
    const w = (portfolio?.watchlist || []).find(w => w.ticker === ticker)
    return w?.name
  }, [portfolio, ticker])
  const displayed = displayName(ticker, nameFromPortfolio)

  return (
    <>
      {/* ── 뉴스 ── */}
      <section>
        <div className="rp-section-header">
          <h2 className="rp-section-title">{displayed} 뉴스</h2>
          {!isOwned && (
            <button
              onClick={() => toggleWatch(ticker)}
              title={isStarred ? '관심 목록에서 제거' : '관심 목록에 추가'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 14, border: '1px solid',
                borderColor: isStarred ? 'var(--clr-warn)' : 'var(--clr-border-strong)',
                background: isStarred ? 'var(--clr-warn-bg)' : 'var(--clr-surface)',
                color: isStarred ? 'var(--clr-warn-dark)' : 'var(--clr-text-sub)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <span>{isStarred ? '★' : '☆'}</span>
              <span>{isStarred ? '관심 등록됨' : '관심 추가'}</span>
            </button>
          )}
          {isOwned && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 14,
              background: 'var(--clr-pos-bg-soft)', color: '#15803D',
              fontSize: 11, fontWeight: 700,
            }}>💼 보유중</span>
          )}
        </div>
        {newsLoading
          ? <div className="rp-news-list">{[1,2,3].map(i => <SkeletonNews key={i} />)}</div>
          : newsItems.length === 0
            ? <div className="rp-empty">관련 뉴스 없음</div>
            : (
              <div className="rp-news-list">
                {newsItems.slice(0, 5).map((n, i) => (
                  <a key={i} href={n.link} target="_blank" rel="noreferrer"
                    className="rp-news-item">
                    <div className="rp-news-dot" />
                    <div>
                      <div className="rp-news-title">{n.title}</div>
                      <div className="rp-news-pub">{n.publisher}</div>
                    </div>
                  </a>
                ))}
              </div>
            )
        }
      </section>

      {/* ── 관련 종목 (Peers) ── */}
      {peers.length > 0 && (
        <section>
          <div className="rp-section-header">
            <h2 className="rp-section-title">관련 종목</h2>
          </div>
          <div className="rp-list">
            {peers.slice(0, 4).map(p => {
              const pct = p.change_pct ?? 0
              const up  = pct >= 0
              const starred = watchSet.has(p.ticker)
              const owned   = holdingSet.has(p.ticker)
              return (
                <div key={p.ticker} className="rp-row rp-row-btn"
                  onClick={() => setChartTicker(p.ticker)}>
                  <LogoCircle ticker={p.ticker} size={36} />
                  <div className="rp-row-info">
                    <div className="rp-row-name">{p.name || p.ticker}</div>
                    <div className="rp-row-price">{p.ticker}</div>
                  </div>
                  <div className="rp-row-right">
                    {pct !== 0 && (
                      <div className={`rp-pct ${up ? 'pos' : 'neg'}`}>
                        {up ? '+' : ''}{pct.toFixed(2)}%
                      </div>
                    )}
                    {!owned && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleWatch(p.ticker, p.name) }}
                        title={starred ? '관심 해제' : '관심 추가'}
                        style={{
                          padding: '2px 6px', borderRadius: 8, border: 'none',
                          background: 'transparent', fontSize: 16, cursor: 'pointer',
                          color: starred ? '#F59E0B' : '#CBD5E1',
                          lineHeight: 1, fontFamily: 'inherit',
                        }}>{starred ? '★' : '☆'}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

/* ════════════════════════════════════════════
   탭 5: 트렌드 패널 (기존 동일)
   글로벌 Top Gainers / Losers + Market Intel
   ════════════════════════════════════════════ */
function TrendsPanel({ market }) {
  const sorted  = [...market].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
  const gainers = sorted.filter(m => (m.pct ?? 0) > 0).slice(0, 4)
  const losers  = sorted.filter(m => (m.pct ?? 0) < 0).slice(-2).reverse()

  return (
    <>
      {/* Top Gainers */}
      <section>
        <div className="rp-section-header">
          <h2 className="rp-section-title">Top Gainers</h2>
        </div>
        <div className="rp-list">
          {gainers.length === 0
            ? [1,2,3].map(i => <SkeletonRow key={i} />)
            : gainers.map(item => (
              <a key={item.ticker} className="rp-row"
                href={item.yahoo_url || `https://finance.yahoo.com/chart/${encodeURIComponent(item.ticker)}`}
                target="_blank" rel="noreferrer">
                <div className="rp-row-logo">{item.name.slice(0, 5).toUpperCase()}</div>
                <div className="rp-row-info">
                  <div className="rp-row-name">{item.name}</div>
                  <div className="rp-row-price">{fmtPrice(item.name, item.price)}</div>
                </div>
                <div className="rp-row-right">
                  {item.spark && <Sparkline values={item.spark} positive={true} width={44} height={18} />}
                  <div className="rp-pct pos">+{(item.pct ?? 0).toFixed(2)}%</div>
                </div>
              </a>
            ))}
        </div>
      </section>

      {/* Top Losers */}
      {losers.length > 0 && (
        <section>
          <div className="rp-section-header">
            <h2 className="rp-section-title">Top Losers</h2>
          </div>
          <div className="rp-list">
            {losers.map(item => (
              <a key={item.ticker} className="rp-row"
                href={item.yahoo_url || `https://finance.yahoo.com/chart/${encodeURIComponent(item.ticker)}`}
                target="_blank" rel="noreferrer">
                <div className="rp-row-logo rp-row-logo-dn">{item.name.slice(0, 5).toUpperCase()}</div>
                <div className="rp-row-info">
                  <div className="rp-row-name">{item.name}</div>
                  <div className="rp-row-price">{fmtPrice(item.name, item.price)}</div>
                </div>
                <div className="rp-row-right">
                  {item.spark && <Sparkline values={item.spark} positive={false} width={44} height={18} />}
                  <div className="rp-pct neg">{(item.pct ?? 0).toFixed(2)}%</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <MarketIntelSection market={market} />
    </>
  )
}

/* ════════════════════════════════════════════
   기본 패널 (탐색/추가/관리/설명서/여정)
   Market Intel + Market Status
   ════════════════════════════════════════════ */
function DefaultPanel({ market }) {
  return <MarketIntelSection market={market} />
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
   activeTab에 따라 패널 선택
   ════════════════════════════════════════════ */
export default function RightPanel() {
  const activeTab = useStore(s => s.activeTab)

  const { data: market = [] } = useQuery({
    queryKey: ['market'],
    queryFn: getMarket,
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  const renderPanel = () => {
    if (activeTab === 0 || activeTab === 2) return <PortfolioPanel market={market} />
    if (activeTab === 1)                    return <WatchlistPanel />
    if (activeTab === 3)                    return <ChartPanel />
    if (activeTab === 4)                    return <TrendsPanel market={market} />
    return <DefaultPanel market={market} />
  }

  return (
    <aside className="right-panel">
      {renderPanel()}
      <MarketStatus />
    </aside>
  )
}

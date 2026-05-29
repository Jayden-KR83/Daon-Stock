import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { getPortfolio, getPricesBatch, deleteWatchlist, getNews, searchStocks, addWatchlist, updateWatchlistGroup } from '../api'
import { useStore } from '../store'
import LogoCircle from '../components/LogoCircle'
import Sparkline from '../components/Sparkline'
import { isKrTicker } from '../utils/displayName'

export default function WatchlistTab() {
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })
  const watchlist = portfolio?.watchlist || []

  const tickers = watchlist.map(w => w.ticker)
  const { data: prices = {} } = useQuery({
    queryKey: ['prices-batch', tickers.join(',')],
    queryFn: () => getPricesBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  // 그룹별 분류 (C1)
  const groups = React.useMemo(() => {
    const map = {}
    for (const w of watchlist) {
      const g = w.group_name || '기본'
      if (!map[g]) map[g] = []
      map[g].push(w)
    }
    return map
  }, [watchlist])
  const groupNames = Object.keys(groups).sort()
  const [activeGroup, setActiveGroup] = useState('전체')
  const visibleList = activeGroup === '전체' ? watchlist : (groups[activeGroup] || [])

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="section-title">
        관심 종목
        {watchlist.length > 0 && (
          <span className="muted" style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>({watchlist.length})</span>
        )}
      </div>

      <WatchlistSearch existing={new Set(tickers)}
        onAdded={() => qc.invalidateQueries({ queryKey: ['portfolio'] })} />

      {/* 그룹 토글 (C1) — 그룹이 2개 이상일 때만 표시 */}
      {groupNames.length >= 2 && (
        <div className="seg-ctrl" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          <button className={`seg-btn ${activeGroup === '전체' ? 'active' : ''}`}
            onClick={() => setActiveGroup('전체')} style={{ fontSize: 11 }}>
            전체 ({watchlist.length})
          </button>
          {groupNames.map(g => (
            <button key={g} className={`seg-btn ${activeGroup === g ? 'active' : ''}`}
              onClick={() => setActiveGroup(g)} style={{ fontSize: 11 }}>
              {g} ({groups[g].length})
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 10 }}>
        종목명 클릭 → 차트로 이동 (뉴스·지표 함께 표시) · 🏷 → 그룹 변경
      </div>

      {visibleList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⭐</div>
          <div>{activeGroup === '전체' ? '관심 종목이 없습니다' : `'${activeGroup}' 그룹에 종목이 없습니다`}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>위 검색창에서 종목을 추가하세요</div>
        </div>
      ) : (
        <motion.div
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence initial={false}>
            {visibleList.map(item => (
              <motion.div
                key={item.ticker}
                layout
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show:   { opacity: 1, y: 0 },
                }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
                transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <WatchlistRow
                  item={item}
                  priceData={prices[item.ticker]}
                  onChart={() => setChartTicker(item.ticker)}
                  onDelete={async () => {
                    await deleteWatchlist(item.ticker)
                    qc.invalidateQueries({ queryKey: ['portfolio'] })
                  }}
                  onGroupChange={async (newGroup) => {
                    await updateWatchlistGroup(item.ticker, newGroup)
                    qc.invalidateQueries({ queryKey: ['portfolio'] })
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}

function WatchlistSearch({ existing, onAdded }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [adding, setAdding] = useState('')
  const inputRef = useRef(null)
  const dropRef  = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function h(e) {
      if (!dropRef.current || !inputRef.current) return
      if (!dropRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['watchlist-search', debounced],
    queryFn: () => searchStocks(debounced),
    enabled: debounced.length >= 1,
    staleTime: 60_000,
  })

  async function add(item) {
    if (existing.has(item.symbol)) return
    setAdding(item.symbol)
    try {
      await addWatchlist({
        ticker: item.symbol,
        name: item.shortname,
        exchange: item.exchange || '',
        qtype: item.quoteType || '',
      })
      onAdded?.()
      setQ('')
      setShowDrop(false)
    } finally {
      setAdding('')
    }
  }

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          className="input"
          placeholder="관심 종목 검색 추가 (AAPL, 005930, 애플...)"
          value={q}
          onChange={e => { setQ(e.target.value); setShowDrop(e.target.value.length >= 1) }}
          onFocus={() => q.length >= 1 && setShowDrop(true)}
          autoComplete="off"
        />
        {isFetching && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10, color: 'var(--clr-text-muted)' }}>검색 중...</div>
        )}
      </div>
      {showDrop && results.length > 0 && (
        <div ref={dropRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--clr-surface)', border: '1px solid var(--clr-border-md)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,.12)', zIndex: 50, maxHeight: 320, overflowY: 'auto',
        }}>
          {results.slice(0, 10).map(r => {
            const already = existing.has(r.symbol)
            return (
              <div key={r.symbol}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderBottom: '1px solid var(--clr-border)' }}>
                <LogoCircle ticker={r.symbol} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--clr-text-strong)', fontSize: 13 }}>{r.symbol}</div>
                  <div style={{ color: 'var(--clr-text-muted)', fontSize: 11, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.shortname}</div>
                </div>
                <button
                  disabled={already || adding === r.symbol}
                  onMouseDown={e => { e.preventDefault(); if (!already) add(r) }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid',
                    borderColor: already ? '#CBD5E1' : '#0EA5E9',
                    background: already ? '#F8FAFC' : '#EFF6FF',
                    color: already ? '#94A3B8' : '#0369A1',
                    fontSize: 12, fontWeight: 700, cursor: already ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}>
                  {already ? '✓ 추가됨' : adding === r.symbol ? '추가 중...' : '⭐ 추가'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WatchlistRow({ item, priceData, onChart, onDelete, onGroupChange }) {
  const cur    = priceData?.current_price
  const chgPct = priceData?.change_pct ?? 0
  const up     = chgPct >= 0
  const isUs   = !/^A?\d{6}$/.test(item.ticker)

  // 뉴스 패널 제거 — 종목 클릭 시 차트 탭에서 뉴스 확인 가능 (중복 제거)
  // expanded 상태 제거. 본 컴포넌트는 보유 카드 그대로 클릭 = 차트 이동
  const expanded = false
  const newsData = null
  const newsLoading = false

  const _unused_news_q = useQuery({
    queryKey: ['news', item.ticker],
    queryFn: () => getNews(item.ticker),
    enabled: expanded,
    staleTime: 1_800_000,
    retry: 0,
  })

  return (
    <div style={{ borderRadius: 12, background: 'var(--clr-surface)', marginBottom: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,.05)', overflow: 'hidden' }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        {/* Logo + clickable info → chart */}
        <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}
          onClick={onChart}>
          <LogoCircle ticker={item.ticker} size={42} />
          <div style={{ minWidth: 0 }}>
            {isKrTicker(item.ticker) && item.name ? (
              <>
                <div className="stock-ticker" style={{ color: 'var(--clr-info-dark)' }}>{item.name}</div>
                <div className="stock-name">{item.ticker}</div>
              </>
            ) : (
              <>
                <div className="stock-ticker" style={{ color: 'var(--clr-info-dark)' }}>{item.ticker}</div>
                <div className="stock-name">{item.name}</div>
              </>
            )}
          </div>
        </div>

        {/* Sparkline */}
        {priceData?.spark && (
          <Sparkline values={priceData.spark} positive={up} width={60} height={24} />
        )}

        {/* Price */}
        <div style={{ textAlign: 'right', minWidth: 80 }}>
          <div className="price-main">
            {cur != null ? (isUs ? `$${cur.toFixed(2)}` : `₩${Math.round(cur).toLocaleString()}`) : '—'}
          </div>
          <div className={`price-change ${up ? 'pos' : 'neg'}`}>
            {up ? '+' : ''}{(chgPct ?? 0).toFixed(2)}%
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button className="btn-icon" onClick={() => {
            const g = window.prompt(`'${item.ticker}' 그룹 이름 (예: AI인프라, 배당)`,
              item.group_name || '기본')
            if (g != null) onGroupChange?.(g.trim() || '기본')
          }} title="그룹 변경"
            style={{ fontSize: 11, color: 'var(--clr-info-dark)' }}>
            🏷
          </button>
          <button className="btn-icon" onClick={onDelete} style={{ color: 'var(--clr-neg-dark)' }}
            title="삭제">🗑️</button>
        </div>
      </div>

      {/* News panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--clr-border)', padding: '10px 14px 10px 58px',
          background: 'var(--clr-bg)' }}>
          {newsLoading ? (
            <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', padding: '4px 0' }}>뉴스 로딩 중...</div>
          ) : newsData?.news?.length > 0 ? (
            newsData.news.map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noreferrer"
                style={{ display: 'block', textDecoration: 'none', padding: '6px 0',
                  borderBottom: i < newsData.news.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-strong)', lineHeight: 1.5 }}>
                  {n.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 2 }}>
                  {n.publisher}{n.date ? ` · ${n.date}` : ''}
                  <span style={{ color: 'var(--clr-info)', marginLeft: 6 }}>→ 기사 보기</span>
                </div>
              </a>
            ))
          ) : (
            <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>관련 뉴스가 없습니다</div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchStocks } from '../api'
import { useStore } from '../store'
import NotificationsBell from './NotificationsBell'
import './TopNavBar.css'

export default function TopNavBar() {
  const setChartTicker = useStore(s => s.setChartTicker)
  const setAppMode     = useStore(s => s.setAppMode)
  const currentUser    = useStore(s => s.currentUser)
  const [searchVal, setSearchVal] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const dropRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchVal.trim()), 300)
    return () => clearTimeout(t)
  }, [searchVal])

  const { data: results = [] } = useQuery({
    queryKey: ['topnav-search', debouncedQ],
    queryFn: () => searchStocks(debouncedQ),
    enabled: debouncedQ.length >= 1,
    staleTime: 60_000,
  })

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

  const gotoChart = (ticker) => {
    const t = String(ticker || '').trim().toUpperCase()
    if (!t) return
    setChartTicker(t)
    setSearchVal('')
    setShowDrop(false)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (results.length > 0) gotoChart(results[0].symbol)
    else if (searchVal.trim()) gotoChart(searchVal)
  }

  const initials = currentUser?.name
    ? currentUser.name.slice(0, 2).toUpperCase()
    : 'DA'

  return (
    <header className="top-nav">
      {/* Right: 검색 + 앱모드 + 아바타 */}
      <div className="top-nav-right">
        <form className="top-nav-search" onSubmit={handleSearch} style={{ position: 'relative' }}>
          <svg className="top-nav-search-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="top-nav-search-input"
            placeholder="종목 검색 (AAPL, 005930, 애플...)"
            value={searchVal}
            onChange={e => { setSearchVal(e.target.value); setShowDrop(e.target.value.length >= 1) }}
            onFocus={() => searchVal.length >= 1 && setShowDrop(true)}
            autoComplete="off"
          />
          {showDrop && results.length > 0 && (
            <div ref={dropRef} style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: 'var(--clr-surface)', border: '1px solid var(--clr-border-md)', borderRadius: 4,
              boxShadow: '0 8px 24px rgba(15,23,42,.12)', zIndex: 1000, maxHeight: 320, overflowY: 'auto',
            }}>
              {results.slice(0, 8).map(r => (
                <div key={r.symbol}
                  onMouseDown={() => gotoChart(r.symbol)}
                  style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--clr-border)',
                    display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, color: 'var(--clr-text-strong)', minWidth: 70 }}>{r.symbol}</span>
                  <span style={{ color: 'var(--clr-text-muted)', fontSize: 12, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.shortname}</span>
                </div>
              ))}
            </div>
          )}
          {/* 최근 검색 — 빈 입력 시 표시 (C5) */}
          {showDrop && results.length === 0 && searchVal.length === 0 && (
            <RecentSearches onPick={gotoChart} dropRef={dropRef} />
          )}
        </form>

        <NotificationsBell />

        <ThemeQuickBtn />

        <button className="top-nav-app-btn" onClick={() => setAppMode('app')} title="앱 모드로 전환">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </button>

        <div className="top-nav-avatar" title={currentUser?.name || ''}>
          {initials}
        </div>
      </div>
    </header>
  )
}

/* 최근 검색 — localStorage 기반 (C5) */
function RecentSearches({ onPick, dropRef }) {
  const recent = (() => {
    try { return JSON.parse(localStorage.getItem('recentTickers') || '[]') } catch { return [] }
  })()
  if (recent.length === 0) return null
  return (
    <div ref={dropRef} style={{
      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
      background: 'var(--clr-surface)', border: '1px solid var(--clr-border-md)',
      borderRadius: 4, boxShadow: '0 8px 24px rgba(15,23,42,.12)',
      zIndex: 1000, padding: '6px 0',
    }}>
      <div style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700,
        color: 'var(--clr-text-muted)', letterSpacing: '.05em',
        textTransform: 'uppercase' }}>최근 검색</div>
      {recent.map(t => (
        <div key={t} onMouseDown={() => onPick(t)}
          style={{ padding: '8px 12px', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, color: 'var(--clr-text-strong)',
            display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="emoji-mute" style={{ fontSize: 10 }}>🕐</span>
          {t}
        </div>
      ))}
    </div>
  )
}

/* 웹 모드 상단 테마 빠른 전환 버튼 */
function ThemeQuickBtn() {
  const theme      = useStore(s => s.theme)
  const cycleTheme = useStore(s => s.cycleTheme)
  const icon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '📈'
  const label = theme === 'light' ? '화이트' : theme === 'dark' ? '다크' : '프로'
  return (
    <button className="top-nav-app-btn" onClick={cycleTheme}
      title={`테마: ${label} (탭하여 변경)`}
      style={{ fontSize: 14, lineHeight: 1 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
    </button>
  )
}

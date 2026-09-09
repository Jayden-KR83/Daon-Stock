import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchStocks } from '../api'
import { useStore, THEME_META } from '../store'
import NotificationsBell from './NotificationsBell'
import './TopNavBar.css'

export default function TopNavBar() {
  const setChartTicker = useStore(s => s.setChartTicker)
  const setLayoutMode  = useStore(s => s.setLayoutMode)
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

  /* 아바타 약자 — 이름을 앞에서 두 글자 자르면 '김은숙'이 '김은'이 된다.
     그건 줄임말이 아니라 **다른 이름**으로 읽힌다(지인 피드백 5).
     한글·한자 이름은 통째로 쓰되(보통 2~3자) 길면 성 한 글자만,
     라틴 이름은 관례대로 단어 첫 글자들(John Smith → JS)을 쓴다. */
  const initials = avatarInitials(currentUser?.name)

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

        <button className="top-nav-app-btn" onClick={() => setLayoutMode('app')} title="앱 모드로 전환">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </button>

        {/* 이름은 아바타 옆에 그대로 적는다. 원의 약자만으로는 누구인지 확인이 안 된다.
            폭이 좁아지면 CSS 로 이름만 숨고 아바타는 남는다. */}
        <div className="top-nav-user" title={currentUser?.name || ''}>
          <div className="top-nav-avatar" style={initials.length > 2 ? { fontSize: 10 } : undefined}>
            {initials}
          </div>
          {currentUser?.name && (
            <span className="top-nav-username">{currentUser.name}</span>
          )}
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

/* 이름 → 아바타 약자.
   ⚠ 앞 두 글자 자르기는 금지 — '김은숙' → '김은' 처럼 다른 이름이 된다. */
export function avatarInitials(name) {
  const n = String(name || '').trim()
  if (!n) return 'DA'
  const cjk = /[ㄱ-힝一-鿿぀-ヿ]/.test(n)
  if (cjk) {
    const clean = n.replace(/\s+/g, '')
    return clean.length <= 3 ? clean : clean.slice(0, 1)
  }
  const words = n.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  return words[0].slice(0, 2).toUpperCase()
}

/* 웹 모드 상단 테마 빠른 전환 버튼 */
function ThemeQuickBtn() {
  const theme      = useStore(s => s.theme)
  const cycleTheme = useStore(s => s.cycleTheme)
  /* 앱 모드 알약과 같은 표(THEME_META)를 본다. 예전에는 여기서도
     'light/dark 가 아니면 프로' 로 판정해 auto 가 '프로'로 찍혔다. */
  const meta  = THEME_META[theme] || THEME_META.light
  const icon  = meta.icon
  const label = meta.label
  return (
    // 스타일은 앱 전환 버튼과 공유하되 클래스는 분리 — 같은 클래스만 쓰면
    // .top-nav-app-btn 선택이 모호해진다(테마 버튼이 먼저 잡힘)
    <button className="top-nav-app-btn top-nav-theme-btn" onClick={cycleTheme}
      title={theme === 'auto'
        ? '테마: 자동 — OS 설정을 따릅니다 (클릭하여 변경)'
        : `테마: ${label} (클릭하여 변경)`}
      style={{ fontSize: 14, lineHeight: 1 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
    </button>
  )
}

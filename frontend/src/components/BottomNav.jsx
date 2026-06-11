import React, { useRef, useEffect, useState } from 'react'
import { useStore } from '../store'
import './BottomNav.css'

/* ── SVG 아이콘 ── */
const icons = {
  holdings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="1"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
      <line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  watchlist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  allocation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
      <path d="M22 12A10 10 0 0 0 12 2v10z"/>
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  market: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  register: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  guide: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  journey: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  ),
}

/* 전체 탭 — 한 줄 가로 스크롤 (더보기 시트 폐지). adminOnly 는 관리자만 노출 */
const ALL_TABS = [
  { label: '포트폴리오', idx: 0, iconKey: 'holdings'   },
  { label: '관심',       idx: 1, iconKey: 'watchlist'  },
  { label: '분석',       idx: 2, iconKey: 'allocation' },
  { label: '종목',       idx: 3, iconKey: 'chart'      },
  { label: '시장',       idx: 4, iconKey: 'market'     },
  { label: '등록',       idx: 5, iconKey: 'register'   },
  { label: '설정',       idx: 6, iconKey: 'settings'   },
  { label: '가이드',     idx: 7, iconKey: 'guide'      },
  { label: '여정',       idx: 8, iconKey: 'journey', adminOnly: true },
  { label: '관리자',     idx: 9, iconKey: 'admin',   adminOnly: true },
]

export default function BottomNav() {
  const activeTab    = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const currentUser  = useStore(s => s.currentUser)
  const isAdmin = !!currentUser?.is_admin
  const tabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin)

  const navRef = useRef(null)
  const activeRef = useRef(null)
  // 양 끝 페이드 힌트 — 더 스크롤할 게 있을 때만 표시
  const [edges, setEdges] = useState({ left: false, right: false })

  function updateEdges() {
    const el = navRef.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setEdges(prev => (prev.left === left && prev.right === right) ? prev : { left, right })
  }

  // 스크롤/리사이즈/탭수 변경 시 페이드 상태 갱신
  useEffect(() => {
    updateEdges()
    const el = navRef.current
    el?.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    return () => {
      el?.removeEventListener('scroll', updateEdges)
      window.removeEventListener('resize', updateEdges)
    }
  }, [tabs.length])

  // 활성 탭이 화면 밖이면 가로 스크롤로 가운데 정렬 (스크롤 이벤트가 페이드도 갱신)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeTab])

  return (
    <div className={`bottom-nav-wrap${edges.left ? ' can-left' : ''}${edges.right ? ' can-right' : ''}`}>
      <nav className="bottom-nav" ref={navRef}>
        {tabs.map(tab => {
          const active = activeTab === tab.idx
          return (
            <button
              key={tab.idx}
              ref={active ? activeRef : null}
              className={`nav-btn ${active ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.idx)}
            >
              <span className="nav-icon">{icons[tab.iconKey]}</span>
              <span className="nav-label">{tab.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="nav-fade nav-fade-left" aria-hidden="true" />
      <div className="nav-fade nav-fade-right" aria-hidden="true" />
    </div>
  )
}

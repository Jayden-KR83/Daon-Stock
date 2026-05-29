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
  explore: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
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
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
    </svg>
  ),
}

/* 하단 5개 주요 탭 */
const PRIMARY_TABS = [
  { label: '포트폴리오', idx: 0, iconKey: 'holdings'   },
  { label: '관심',       idx: 1, iconKey: 'watchlist'  },
  { label: '분석',       idx: 2, iconKey: 'allocation' },
  { label: '종목',       idx: 3, iconKey: 'chart'      },
]

/* 더보기 시트에 들어갈 나머지 탭 */
const MORE_TABS_BASE = [
  { label: '시장', idx: 4,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  },
  { label: '등록', idx: 5,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  },
  { label: '설정', idx: 6,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  },
  { label: '가이드', idx: 7,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  },
  { label: '여정', idx: 8, adminOnly: true,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  },
]

const ADMIN_TAB = { label: '관리자', idx: 9, adminOnly: true,
  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
}

export default function BottomNav() {
  const activeTab    = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const currentUser  = useStore(s => s.currentUser)
  const [sheetOpen, setSheetOpen] = useState(false)

  const isAdmin = !!currentUser?.is_admin
  const MORE_TABS = (isAdmin ? [...MORE_TABS_BASE, ADMIN_TAB] : MORE_TABS_BASE)
    .filter(t => !t.adminOnly || isAdmin)
  const isMoreActive = activeTab >= 4

  const handleMoreTab = (idx) => {
    setActiveTab(idx)
    setSheetOpen(false)
  }

  return (
    <>
      {/* 더보기 시트 오버레이 */}
      {sheetOpen && (
        <div className="more-sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="more-sheet" onClick={e => e.stopPropagation()}>
            <div className="more-sheet-handle" />
            <div className="more-sheet-title">더보기</div>
            <div className="more-sheet-grid">
              {MORE_TABS.map(tab => (
                <button
                  key={tab.idx}
                  className={`more-sheet-btn ${activeTab === tab.idx ? 'active' : ''}`}
                  onClick={() => handleMoreTab(tab.idx)}
                >
                  <span className="more-sheet-icon">{tab.icon}</span>
                  <span className="more-sheet-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 하단 네비게이션 */}
      <nav className="bottom-nav">
        {PRIMARY_TABS.map(tab => (
          <button
            key={tab.idx}
            className={`nav-btn ${activeTab === tab.idx ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.idx)}
          >
            <span className="nav-icon">{icons[tab.iconKey]}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}

        {/* 더보기 버튼 */}
        <button
          className={`nav-btn ${isMoreActive ? 'active' : ''}`}
          onClick={() => setSheetOpen(o => !o)}
        >
          <span className="nav-icon">{icons.more}</span>
          <span className="nav-label">{isMoreActive
            ? MORE_TABS.find(t => t.idx === activeTab)?.label || '더보기'
            : '더보기'
          }</span>
        </button>
      </nav>
    </>
  )
}

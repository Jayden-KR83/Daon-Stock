import React, { useRef, useEffect } from 'react'
import { useStore } from '../store'
import './BottomNav.css'

const TABS = [
  { label: '보유',   icon: '🏛️' },
  { label: '관심',   icon: '🔖' },
  { label: '탐색',   icon: '🧭' },
  { label: '비중',   icon: '⚖️' },
  { label: '차트',   icon: '📊' },
  { label: '트렌드', icon: '⚡' },
  { label: '추가',   icon: '📌' },
  { label: '관리',   icon: '🗂️' },
  { label: '설명서', icon: '📋' },
  { label: '여정',   icon: '🗺️' },
]

export default function BottomNav() {
  const activeTab    = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const navRef       = useRef(null)
  const btnRefs      = useRef([])

  // 활성 탭이 바뀔 때 자동 스크롤
  useEffect(() => {
    const btn = btnRefs.current[activeTab]
    if (btn && navRef.current) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeTab])

  return (
    <nav className="bottom-nav" ref={navRef}>
      {TABS.map((tab, i) => (
        <button
          key={i}
          ref={el => { btnRefs.current[i] = el }}
          className={`nav-btn ${activeTab === i ? 'active' : ''}`}
          onClick={() => setActiveTab(i)}
        >
          <span className="nav-icon">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

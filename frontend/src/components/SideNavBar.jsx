import React from 'react'
import { useStore } from '../store'
import './SideNavBar.css'

const SIDE_TABS = [
  {
    label: '포트폴리오', idx: 0,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  },
  {
    label: '관심', idx: 1,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  },
  {
    label: '분석', idx: 2,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
    </svg>
  },
  {
    label: '종목', idx: 3,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  },
  { type: 'divider' },
  {
    label: '시장', idx: 4,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  },
  {
    label: '등록', idx: 5,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  },
  {
    label: '설정', idx: 6,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  },
  {
    label: '가이드', idx: 7,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  },
  {
    label: '발굴', idx: 10,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  },
  {
    label: '여정', idx: 8, adminOnly: true,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  },
]

export default function SideNavBar() {
  const activeTab    = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const setAppMode   = useStore(s => s.setAppMode)
  const currentUser  = useStore(s => s.currentUser)

  return (
    <aside className="side-nav">
      {/* 로고 (클릭 시 홈/보유 탭으로) */}
      <div className="side-nav-logo-area"
        onClick={() => setActiveTab(0)}
        style={{ cursor: 'pointer' }}
        title="홈으로 (보유 탭)">
        <div className="side-nav-logo-text">
          <span>D</span>AON
        </div>
      </div>

      {/* 포트폴리오 라벨 */}
      <div className="side-nav-label-box">
        <div className="side-nav-label-box-title">다온 포트폴리오</div>
        <div className="side-nav-label-box-sub">
          {currentUser?.nickname || currentUser?.name || '투자자'}
        </div>
      </div>

      {/* 탭 목록 — adminOnly 항목은 관리자에게만 노출 */}
      <div className="side-nav-inner">
        {SIDE_TABS
          .filter(item => !item.adminOnly || !!currentUser?.is_admin)
          .map((item, i) => {
            if (item.type === 'divider') {
              return <div key={`div-${i}`} className="side-nav-divider" />
            }
            return (
              <button
                key={item.idx}
                className={`side-nav-btn ${activeTab === item.idx ? 'active' : ''}`}
                onClick={() => setActiveTab(item.idx)}
              >
                <span className="side-nav-icon">{item.icon}</span>
                <span className="side-nav-label">{item.label}</span>
              </button>
            )
          })}
        {/* 관리자 전용 탭 — is_admin 일 때만 표시 */}
        {currentUser?.is_admin && (
          <>
            <div className="side-nav-divider" />
            <button
              className={`side-nav-btn ${activeTab === 9 ? 'active' : ''}`}
              onClick={() => setActiveTab(9)}
              style={{ color: 'var(--clr-ai)' }}
              title="앱 사용자 및 사용 현황 관리"
            >
              <span className="side-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              </span>
              <span className="side-nav-label">관리자</span>
            </button>
          </>
        )}
      </div>

      {/* 하단: 앱 모드 전환 */}
      <div className="side-nav-footer">
        <button
          className="side-nav-btn"
          onClick={() => setAppMode('app')}
        >
          <span className="side-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </span>
          <span className="side-nav-label">앱 모드</span>
        </button>
      </div>
    </aside>
  )
}

import React, { useEffect, useRef, useState } from 'react'
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
  discover: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
    </svg>
  ),
}

/* 하단 네비 = 전체 탭을 담은 가로 스크롤 스트립 + 오른쪽에 고정된 '전체' 버튼.
 *
 * 이력: 가로 스크롤 탭바 → 5칸 고정(2026-07, 발견성) → 다시 스크롤 스트립(2026-07-30).
 * 5칸 고정의 문제는 나머지 7개 탭이 점 3개 뒤에 완전히 숨어, 스와이프로 탭을 넘겨도
 * 하단바는 그대로여서 "지금 어디에 있는지"가 안 보였다는 것.
 * 이제 활성 탭이 바뀌면 스트립이 그 탭을 가운데로 스크롤해, 안 보였던 탭이 자연히 드러난다.
 * '전체' 버튼은 스크롤 밖에 고정해 5칸 고정이 노렸던 발견성도 유지한다. */
// adminOnly 는 관리자만 노출
const ALL_TABS = [
  { label: '포트폴리오', idx: 0, iconKey: 'holdings'   },
  { label: '분석',       idx: 2, iconKey: 'allocation' },
  { label: '종목',       idx: 3, iconKey: 'chart'      },
  { label: '관심',       idx: 1, iconKey: 'watchlist'  },
  { label: '발굴',       idx: 10, iconKey: 'discover'  },
  { label: '시장',       idx: 4, iconKey: 'market'     },
  { label: '등록',       idx: 5, iconKey: 'register'   },
  { label: '설정',       idx: 6, iconKey: 'settings'   },
  { label: '가이드',     idx: 7, iconKey: 'guide'      },
  { label: '여정',       idx: 8, iconKey: 'journey', adminOnly: true },
  { label: '관리자',     idx: 9, iconKey: 'admin',   adminOnly: true },
]

/* 스와이프 전환 순서 = 하단바에 보이는 순서. App.jsx가 이걸 그대로 쓰므로
   두 곳이 어긋날 수 없다(예전에는 배열을 각자 하드코딩해 동기화가 수동이었다). */
export function navTabOrder(isAdmin) {
  return ALL_TABS.filter(t => !t.adminOnly || isAdmin).map(t => t.idx)
}

export default function BottomNav() {
  const activeTab     = useStore(s => s.activeTab)
  const setActiveTab  = useStore(s => s.setActiveTab)
  const currentUser   = useStore(s => s.currentUser)
  const setLayoutMode = useStore(s => s.setLayoutMode)
  const isAdmin = !!currentUser?.is_admin

  const [moreOpen, setMoreOpen] = useState(false)
  const stripRef = useRef(null)
  const btnRefs  = useRef({})

  const visible = ALL_TABS.filter(t => !t.adminOnly || isAdmin)

  // 활성 탭을 스트립 가운데로 — scrollIntoView는 페이지 전체를 함께 스크롤할 수 있어
  // 컨테이너 기준으로 직접 계산한다.
  useEffect(() => {
    const box = stripRef.current
    const el  = btnRefs.current[activeTab]
    if (!box || !el) return
    const target = el.offsetLeft - (box.clientWidth - el.clientWidth) / 2
    const max = box.scrollWidth - box.clientWidth
    box.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: 'smooth' })
  }, [activeTab, isAdmin])

  // 시트 열림 중 뒤 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [moreOpen])

  const go = (idx) => { setActiveTab(idx); setMoreOpen(false) }

  return (
    <>
      <div className="bottom-nav-wrap">
        <nav className="bottom-nav" aria-label="주요 메뉴">
          {/* data-noswipe: 탭 전환 스와이프가 이 스트립의 가로 스크롤을 삼키지 않도록 */}
          <div className="nav-strip" ref={stripRef} data-noswipe>
            {visible.map(tab => {
              const active = activeTab === tab.idx
              return (
                <button key={tab.idx}
                  ref={el => { btnRefs.current[tab.idx] = el }}
                  data-tour={`nav-${tab.idx}`}
                  className={`nav-btn ${active ? 'active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => go(tab.idx)}>
                  <span className="nav-icon">{icons[tab.iconKey]}</span>
                  <span className="nav-label">{tab.label}</span>
                </button>
              )
            })}
          </div>
          <button className="nav-btn nav-btn-more"
            aria-haspopup="dialog" aria-expanded={moreOpen}
            onClick={() => setMoreOpen(v => !v)}>
            <span className="nav-icon">{icons.more}</span>
            <span className="nav-label">전체</span>
          </button>
        </nav>
      </div>

      {moreOpen && (
        <div className="nav-sheet-scrim" onClick={() => setMoreOpen(false)}>
          <div className="nav-sheet" role="dialog" aria-modal="true" aria-label="전체 메뉴"
            onClick={e => e.stopPropagation()}>
            <div className="nav-sheet-handle" aria-hidden="true" />
            <div className="nav-sheet-title">전체 메뉴</div>
            <div className="nav-sheet-grid">
              {visible.map(tab => {
                const active = activeTab === tab.idx
                return (
                  <button key={tab.idx}
                    className={`nav-sheet-item ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => go(tab.idx)}>
                    <span className="nav-sheet-icon">{icons[tab.iconKey]}</span>
                    <span className="nav-sheet-label">{tab.label}</span>
                  </button>
                )
              })}
            </div>
            <button className="nav-sheet-wide"
              onClick={() => { setLayoutMode('web'); setMoreOpen(false) }}>
              <span className="nav-sheet-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </span>
              웹(데스크톱) 화면으로 보기
            </button>
          </div>
        </div>
      )}
    </>
  )
}

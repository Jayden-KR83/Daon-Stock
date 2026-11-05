import React from 'react'
import { displayNameOf } from '../utils/userName'
import { useStore } from '../store'
import './SideNavBar.css'

/* 2026-11-03 네비 재편 — **하단 바(모바일)와 같은 구조**로 맞춘다.
 *
 * 전에는 여기만 옛 구조(포트폴리오·분석·종목…)로 남아 있었다. 오너가 PC 웹으로
 * 보는데 모바일만 고쳐 놓고 "반영됐다"고 한 것이다 — 리스크 목록에 'SideNavBar 도
 * 같이' 라고 적어 두고 빠뜨렸다.
 *
 * 주 5개: 계좌 · 관심 · 발굴 · 시장 · 설정
 * 구분선 아래: 종목 (차트는 어느 화면에서든 종목을 누르면 열리지만, 직전에
 *   보던 종목으로 되돌아올 길이 하나 있어야 한다)
 *
 * 2026-11-05 — 오너가 같은 지적을 두 번 했다: "분석 탭도 없애고(계좌에 편입),
 * 등록·여정·가이드 모두 설정에 넣어." 앞선 재편에서 **모바일 하단 바만** 고치고
 * 여기는 '데스크톱은 폭이 넉넉하니 길을 하나 더'라는 이유로 네 개를 남겼다.
 * 그 이유가 틀렸다 — 폭이 남는다는 것은 메뉴를 늘릴 **권리**가 아니다.
 * 두 화면의 메뉴가 다르면 "내가 아까 본 그 메뉴가 어디 갔지"가 생긴다.
 *   분석 -> 계좌 탭 상단 '보유 종목 종합 분석' 버튼
 *   등록·가이드·여정 -> 설정 탭 '바로가기' 카드
 */
const SIDE_TABS = [
  {
    label: '계좌', idx: 0,
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
    label: '발굴', idx: 10,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  },
  {
    label: '시장', idx: 4,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  },
  {
    label: '설정', idx: 6,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  },
  { type: 'divider' },
  {
    label: '종목', idx: 3,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  },
]

/* 단축키 정본 — 화면에 보이는 순서가 곧 1,2,3… 이다.
   예전에는 KeyboardShortcuts 가 내부 탭 번호(0~10)를 그대로 썼다. 내부 번호는
   기능이 추가된 순서라 화면 순서와 아무 관계가 없어서, 3번을 누르면 '분석'이
   아니라 엉뚱한 탭이 열렸다(2026-09-14 지적). 순서를 두 곳에서 정하면 반드시
   어긋나므로 여기 하나만 둔다.
   관리자 전용(여정)은 번호를 주지 않는다 — 대부분의 사용자에게는 없는 메뉴다. */
export const SHORTCUT_TABS = SIDE_TABS
  // 구분선({type:'divider'})은 메뉴가 아니다. 걸러내지 않으면 번호를 하나 먹어
  // 6번부터 한 칸씩 밀린다 — 실제로 그랬다.
  .filter(t => t.type !== 'divider' && t.idx != null && !t.adminOnly)
  .map((t, i) => ({ key: String(i + 1), idx: t.idx, label: t.label }))

export default function SideNavBar() {
  const activeTab    = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const setLayoutMode = useStore(s => s.setLayoutMode)
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
          {displayNameOf(currentUser)}
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
                data-tour={`side-nav-${item.idx}`}
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
          onClick={() => setLayoutMode('app')}
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

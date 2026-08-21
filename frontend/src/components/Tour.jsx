import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import './Tour.css'

/* ────────────────────────────────────────────────────────────────────────────
 * 최초 로그인 온보딩 투어 (스포트라이트 코치마크)
 *
 * 설계 메모
 * - 화면의 **실제 요소**를 뚫어서 비춘다. 그림 설명이 아니라 지금 보는 화면을 그대로
 *   가리키므로, 투어가 끝난 뒤 "아까 그 자리"를 다시 찾을 수 있다.
 * - 어두운 막은 4개의 사각형으로 만든다(box-shadow spread 트릭 대신).
 *   design.md R1ب 가 카드 그림자를 금지하고, 4분할이 경계도 더 또렷하다.
 * - 하이라이트 위를 누르면 다음으로 넘어간다 — "클릭하며 따라가는" 느낌을 위해.
 * - 대상이 **없으면 그 단계는 자동으로 건너뛴다.** 보유 종목이 0개인 신규 사용자에게
 *   '종목 한 줄 읽는 법'을 비출 수는 없기 때문. 이게 없으면 투어가 빈 화면에서 멈춘다.
 * ──────────────────────────────────────────────────────────────────────────── */

const TOUR_VERSION = 'v1'
const doneKey = (userId) => 'daon.tour.' + TOUR_VERSION + '.' + (userId || 'anon')

export function isTourDone(userId) {
  try { return localStorage.getItem(doneKey(userId)) === 'done' } catch { return false }
}
export function markTourDone(userId) {
  try { localStorage.setItem(doneKey(userId), 'done') } catch {}
}

/* 단계 정의
 *  tab      : 이 단계에서 보여줄 탭(없으면 탭 전환 안 함)
 *  find     : 대상 셀렉터 후보. 앞에서부터 처음 찾히는 것을 쓴다.
 *             (앱 모드=하단바 / 웹 모드=좌측바 라 둘 다 넣어둔다)
 *  optional : 대상이 없으면 조용히 건너뛴다
 *  body     : 문장 단위 배열 — design.md R6(문장마다 줄바꿈)
 */
const STEPS = [
  {
    id: 'welcome',
    center: true,
    title: '다온에 오신 걸 환영합니다',
    body: [
      '주식을 처음 보셔도 괜찮습니다.',
      '1분만 따라오시면 어디에 뭐가 있는지 알게 됩니다.',
      '화면에서 밝게 표시되는 곳을 눌러 따라오세요.',
    ],
  },
  {
    id: 'hero',
    tab: 0,
    find: ['[data-tour="hero"]', '.hero-card'],
    // 금액은 새로고침마다 점(●)으로 가려진 채 시작한다.
    // 가려진 화면을 두고 '맨 위 큰 숫자'를 설명하면 말이 헛돈다 → 이 단계에서 직접 벗긴다.
    reveal: true,
    title: '지금 내 돈이 얼마인지',
    body: [
      '맨 위 큰 숫자가 가진 주식을 모두 합한 현재 가치입니다.',
      '그 아래 손익은 산 가격보다 얼마나 오르거나 내렸는지를 뜻합니다.',
      '초록은 이익, 빨강은 손실입니다.',
    ],
  },
  {
    id: 'privacy',
    tab: 0,
    find: ['[data-tour="privacy"]'],
    optional: true,
    title: '금액 가리기',
    body: [
      '방금 이 버튼으로 금액을 보이게 했습니다.',
      '옆에 사람이 있을 때 누르면 다시 점으로 가려집니다.',
      '새로고침하면 항상 가려진 상태로 시작합니다.',
    ],
  },
  {
    // 적응형 단계 — 화면 상태에 따라 둘 중 하나가 잡힌다.
    //   보유 있음 → 첫 종목 줄 / 보유 0개 → 빈 화면의 '첫 종목 추가하기' 버튼
    // 두 개를 별도 단계로 두면 하나는 반드시 건너뛰어져 '4 / 11' 처럼 번호가 비어 보인다.
    // 한 단계로 합치고 문구만 갈아 끼우는 편이 사용자에게 자연스럽다.
    id: 'row-or-empty',
    tab: 0,
    find: ['[data-tour="holding-row"]', '[data-tour="empty-add"]'],
    variants: [
      {
        title: '종목 한 줄 읽는 법',
        body: [
          '한 줄이 주식 하나입니다.',
          '왼쪽은 이름, 가운데는 최근 흐름, 오른쪽은 평가액과 손익입니다.',
          '줄을 누르면 그 종목의 상세 화면으로 넘어갑니다.',
        ],
      },
      {
        title: '아직 등록된 주식이 없습니다',
        body: [
          '이 버튼을 누르면 첫 종목을 넣는 화면으로 갑니다.',
          '하나만 넣어도 평가액과 비중, 분석이 한꺼번에 살아납니다.',
        ],
      },
    ],
    // 둘 다 없을 때(로딩 실패 등)의 안전한 기본값
    title: '보유 종목',
    body: ['등록한 주식이 여기에 한 줄씩 쌓입니다.'],
  },
  {
    id: 'add',
    tab: 5,
    find: ['[data-tour="nav-5"]', '[data-tour="side-nav-5"]'],
    title: '내 주식 등록하기',
    body: [
      '가진 주식을 여기에 넣으면 나머지 화면이 모두 채워집니다.',
      '엑셀처럼 생긴 표에 종목코드와 수량, 산 가격을 넣고 저장하면 끝입니다.',
      '가장 먼저 하실 일입니다.',
    ],
  },
  {
    id: 'allocation',
    tab: 2,
    find: ['[data-tour="nav-2"]', '[data-tour="side-nav-2"]'],
    title: '분석 — 내 돈이 어디에 몰려 있나',
    body: [
      '한 곳에 너무 몰려 있으면 그 하나가 흔들릴 때 전체가 흔들립니다.',
      '이 탭은 나라·업종·종목별로 비중을 보여줍니다.',
      '막대나 조각에 손을 올리면 금액이 나옵니다.',
    ],
  },
  {
    id: 'chart',
    tab: 3,
    find: ['[data-tour="nav-3"]', '[data-tour="side-nav-3"]'],
    title: '종목 — 하나를 깊게 보기',
    body: [
      '종목 하나의 가격 흐름과 배당, 실적을 모아 봅니다.',
      '용어가 어려우면 물음표 아이콘을 누르세요.',
      '그 자리에서 뜻을 풀어 설명합니다.',
    ],
  },
  {
    id: 'watchlist',
    tab: 1,
    find: ['[data-tour="nav-1"]', '[data-tour="side-nav-1"]'],
    title: '관심 — 사기 전에 지켜보기',
    body: [
      '아직 안 샀지만 궁금한 종목을 모아두는 곳입니다.',
      '실제로 사기 전에 얼마나 움직이는지 지켜보기 좋습니다.',
    ],
  },
  {
    id: 'guide',
    tab: 7,
    find: ['[data-tour="nav-7"]', '[data-tour="side-nav-7"]'],
    title: '가이드 — 모르는 말이 나오면',
    body: [
      '평가액, 배당, ETF 같은 말이 막힐 때 여기를 보세요.',
      '앱에서 쓰는 용어를 쉬운 말로 정리해 두었습니다.',
    ],
  },
  {
    id: 'finish',
    center: true,
    tab: 0,
    title: '준비 끝났습니다',
    body: [
      '이제 등록 탭에서 가진 주식을 넣어보세요.',
      '이 안내는 설정 탭에서 언제든 다시 볼 수 있습니다.',
    ],
  },
]

const PAD = 6              // 하이라이트 여백
const TIP_W = 340          // 말풍선 기본 폭
const FIND_TIMEOUT     = 2200  // 필수 단계 탐색 제한 시간(ms)
const FIND_TIMEOUT_OPT = 600   // 선택 단계는 짧게 — 없으면 바로 다음으로 넘겨야
                               // 빈 암막이 오래 이어지지 않는다

/* 후보 셀렉터 중 처음 잡히는 것을 돌려준다. 몇 번째가 잡혔는지(matched)도 함께 —
   variants 가 있는 단계는 그 번호로 문구를 고른다. */
function findTarget(step) {
  if (!step || !step.find) return null
  for (let i = 0; i < step.find.length; i++) {
    const el = document.querySelector(step.find[i])
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return { el, matched: i }
    }
  }
  return null
}

export default function Tour() {
  const tourOpen     = useStore(s => s.tourOpen)
  const closeTour    = useStore(s => s.closeTour)
  const activeTab    = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  const currentUser   = useStore(s => s.currentUser)
  const privacyMode   = useStore(s => s.privacyMode)
  const togglePrivacy = useStore(s => s.togglePrivacy)

  const [idx, setIdx]     = useState(0)
  const [rect, setRect]   = useState(null)   // null = 대상 없음(가운데 카드로 표시)
  const [ready, setReady] = useState(false)
  const [matched, setMatched] = useState(0)   // find 후보 중 몇 번째가 잡혔나 (variants 선택용)
  const rafRef   = useRef(0)
  const sinceRef = useRef(0)

  const step  = STEPS[idx]
  const total = STEPS.length

  const finish = useCallback(() => {
    markTourDone(currentUser && currentUser.user_id)
    closeTour()
  }, [currentUser, closeTour])

  const go = useCallback((delta) => {
    setIdx(i => {
      const next = i + delta
      if (next < 0) return 0
      if (next >= total) { finish(); return i }
      return next
    })
  }, [total, finish])

  // 투어를 열 때마다 처음부터
  useEffect(() => { if (tourOpen) { setIdx(0); setReady(false) } }, [tourOpen])

  // 단계가 바뀌면 필요한 탭으로 이동
  useEffect(() => {
    if (!tourOpen || !step) return
    if (step.tab != null && step.tab !== activeTab) setActiveTab(step.tab)
    if (step.reveal && privacyMode) togglePrivacy()
    setReady(false)
    setRect(null)
    setMatched(0)
    sinceRef.current = performance.now()
  }, [tourOpen, idx])

  // 대상 추적 — 탭 전환·레이지 로딩·하단바 자동 스크롤로 위치가 계속 변한다.
  // rAF 로 따라가되 값이 실제로 바뀔 때만 setState 한다.
  useLayoutEffect(() => {
    if (!tourOpen || !step) return
    let stopped = false

    const tick = () => {
      if (stopped) return
      if (step.center || !step.find) {
        setRect(null); setReady(true)
      } else {
        const found = findTarget(step)
        if (found) {
          const r = found.el.getBoundingClientRect()
          setMatched(found.matched)
          const nr = { x: r.left, y: r.top, w: r.width, h: r.height }
          setRect(prev => {
            if (prev && Math.abs(prev.x - nr.x) < 0.5 && Math.abs(prev.y - nr.y) < 0.5
              && Math.abs(prev.w - nr.w) < 0.5 && Math.abs(prev.h - nr.h) < 0.5) return prev
            return nr
          })
          setReady(true)
          // 화면 밖이면 끌어온다
          if (r.top < 8 || r.bottom > window.innerHeight - 8) {
            found.el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        } else if (performance.now() - sinceRef.current >
                   (step.optional ? FIND_TIMEOUT_OPT : FIND_TIMEOUT)) {
          // 못 찾음 → 선택 단계면 건너뛰고, 필수 단계면 가운데 카드로라도 보여준다
          if (step.optional) { stopped = true; go(1); return }
          setRect(null); setReady(true)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { stopped = true; cancelAnimationFrame(rafRef.current) }
  }, [tourOpen, idx, step, go])

  // 키보드
  useEffect(() => {
    if (!tourOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish() }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [tourOpen, go, finish])

  // 뒤 스크롤 잠금
  useEffect(() => {
    if (!tourOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [tourOpen])

  if (!tourOpen || !step) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const hole = rect
    ? { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 }
    : null

  // 말풍선 위치 — 대상 아래가 좁으면 위로, 둘 다 좁으면 화면 가운데
  const tipW = Math.min(TIP_W, vw - 24)
  let tipStyle
  if (!hole) {
    tipStyle = { left: (vw - tipW) / 2, top: Math.max(24, vh * 0.26), width: tipW }
  } else {
    const below = vh - (hole.y + hole.h)
    const placeBelow = below > 210 || below >= hole.y
    const left = Math.max(12, Math.min(hole.x + hole.w / 2 - tipW / 2, vw - tipW - 12))
    tipStyle = placeBelow
      ? { left, top: Math.min(hole.y + hole.h + 10, vh - 200), width: tipW }
      : { left, bottom: Math.max(12, vh - hole.y + 10), width: tipW }
  }

  const isLast = idx === total - 1
  // 화면 상태에 따라 문구가 갈리는 단계(보유 있음 / 보유 0개)는 여기서 고른다
  const view = (step.variants && step.variants[matched]) || step

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="다온 사용 안내">
      {/* 어두운 막 — 하이라이트 구멍을 뺀 4방향 */}
      {hole ? (
        <>
          <div className="tour-scrim" onClick={finish}
            style={{ left: 0, top: 0, width: vw, height: Math.max(0, hole.y) }} />
          <div className="tour-scrim" onClick={finish}
            style={{ left: 0, top: hole.y + hole.h, width: vw, height: Math.max(0, vh - hole.y - hole.h) }} />
          <div className="tour-scrim" onClick={finish}
            style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }} />
          <div className="tour-scrim" onClick={finish}
            style={{ left: hole.x + hole.w, top: hole.y, width: Math.max(0, vw - hole.x - hole.w), height: hole.h }} />
          {/* 구멍 위 투명 버튼 — 눌러서 다음으로 (클릭하며 따라가는 느낌) */}
          <button className="tour-hole" aria-label="다음 단계" onClick={() => go(1)}
            style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
          <div className="tour-ring" aria-hidden="true"
            style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
        </>
      ) : (
        <div className="tour-scrim tour-scrim-full" onClick={finish} />
      )}

      {/* 말풍선 */}
      <div className={'tour-tip' + (ready ? ' is-ready' : '')} style={tipStyle}>
        <div className="tour-tip-head">
          <span className="tour-step-count">{idx + 1} / {total}</span>
          <button className="tour-skip" onClick={finish}>건너뛰기</button>
        </div>
        <div className="tour-tip-title">{view.title}</div>
        {/* R6 — 문장마다 줄바꿈 */}
        <div className="tour-tip-body">
          {view.body.map((line, i) => <div key={i} className="tour-line">{line}</div>)}
        </div>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.id} className={'tour-dot' + (i === idx ? ' on' : '')} />
          ))}
        </div>
        <div className="tour-tip-actions">
          <button className="btn-secondary tour-btn" onClick={() => go(-1)} disabled={idx === 0}>이전</button>
          <button className="btn-primary tour-btn" onClick={() => go(1)}>
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

/* 접근 가능한 도움말 툴팁 — 네이티브 title(마우스 전용) 대체.
 * 데스크톱: hover, 모바일: 탭, 키보드: 포커스+Enter/Space 로 동일 접근 (design.md R3).
 * 팝오버는 portal+position:fixed 로 렌더 → transform 조상(framer-motion)·overflow 컨테이너에
 * 잘리지 않고, 뷰포트 안으로 clamp 되어 좁은 화면(360px)에서도 안 넘친다. */
export default function InfoTip({ text, label = '설명', size = 12 }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const closeTimer = useRef(null)

  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
  const deferClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 120) }

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const m = 8
    const width = Math.min(280, window.innerWidth - m * 2)
    let left = r.left + r.width / 2 - width / 2
    left = Math.max(m, Math.min(left, window.innerWidth - width - m))
    const preferAbove = window.innerHeight - r.bottom < 170  // 아래 공간 부족 → 위로
    setPos({ left, width, top: r.bottom + 6, bottom: window.innerHeight - r.top + 6, preferAbove })
  }, [])

  const openTip = () => { cancelClose(); place(); setOpen(true) }
  const toggle = (e) => { e.preventDefault(); e.stopPropagation(); if (open) setOpen(false); else openTip() }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  useEffect(() => () => cancelClose(), [])

  return (
    <>
      <button
        ref={btnRef} type="button"
        className="infotip-btn" style={{ fontSize: `${size}px` }}
        aria-label={`${label} 도움말`} aria-expanded={open}
        onClick={toggle}
        onMouseEnter={openTip} onMouseLeave={deferClose}
        onFocus={openTip} onBlur={() => setOpen(false)}
      >ⓘ</button>
      {open && pos && createPortal(
        <div
          ref={popRef} role="tooltip" className="infotip-pop"
          onMouseEnter={cancelClose} onMouseLeave={deferClose}
          style={{
            position: 'fixed', left: pos.left, width: pos.width,
            ...(pos.preferAbove ? { bottom: pos.bottom } : { top: pos.top }),
          }}
        >{text}</div>,
        document.body,
      )}
    </>
  )
}

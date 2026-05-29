import React, { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'

/**
 * 숫자 값이 변할 때 부드럽게 카운트업/다운 애니메이션을 적용.
 * - value: 숫자 (필수)
 * - format: (n) => string  표시 포맷터
 * - duration: 초 단위, 기본 0.7
 * - prefers-reduced-motion 사용자에게는 즉시 갱신
 */
export default function NumberTicker({ value, format = v => v, duration = 0.7 }) {
  const safeValue = Number.isFinite(value) ? value : 0
  const reducedMotion = useReducedMotion()
  const fmtRef = useRef(format)
  fmtRef.current = format
  const prevRef = useRef(safeValue)
  const [display, setDisplay] = useState(safeValue)

  useEffect(() => {
    const from = prevRef.current
    const to = safeValue
    if (from === to) {
      setDisplay(to)
      return
    }
    if (reducedMotion) {
      setDisplay(to)
      prevRef.current = to
      return
    }
    const controls = animate(from, to, {
      duration,
      ease: [0.22, 0.61, 0.36, 1],
      onUpdate: v => setDisplay(v),
    })
    prevRef.current = to
    return () => controls.stop()
  }, [safeValue, duration, reducedMotion])

  return <>{fmtRef.current(display)}</>
}

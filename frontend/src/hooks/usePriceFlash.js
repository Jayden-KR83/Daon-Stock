import { useRef, useState, useEffect } from 'react'

/**
 * 숫자 값이 변경될 때 flash-up / flash-dn CSS 클래스를 반환합니다.
 * tokens.css 의 @keyframes flashUp / flashDn 과 연동됩니다.
 *
 * @param {number|null} value — 감시할 숫자 (가격, % 등)
 * @returns {string} '' | 'flash-up' | 'flash-dn'
 */
export function usePriceFlash(value) {
  const prevRef = useRef(null)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    // 첫 렌더: 기준값만 저장, 플래시 없음
    if (prevRef.current === null) {
      prevRef.current = value
      return
    }

    if (value == null || prevRef.current == null) {
      prevRef.current = value
      return
    }

    if (value !== prevRef.current) {
      const dir = value > prevRef.current ? 'flash-up' : 'flash-dn'
      prevRef.current = value
      setFlash(dir)
      const t = setTimeout(() => setFlash(''), 700)
      return () => clearTimeout(t)
    }
  }, [value])

  return flash
}

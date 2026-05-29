import { useEffect, useRef } from 'react'

/**
 * 가로 스크롤 컨테이너에 마우스/터치 드래그 스크롤 기능을 추가합니다.
 * 데스크톱: 클릭 후 좌우 드래그로 스크롤
 * 모바일: 기본 터치 스크롤이 이미 작동하므로 추가 처리 불필요
 */
export function useDragScroll() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let isDown = false
    let startX = 0
    let scrollLeft = 0
    let moved = false

    const onDown = (e) => {
      // 버튼·링크·입력 요소는 드래그 대상에서 제외 (클릭 이벤트 우선)
      if (e.button !== 0 && e.pointerType === 'mouse') return
      isDown = true
      moved = false
      startX = (e.touches ? e.touches[0].pageX : e.pageX) - el.offsetLeft
      scrollLeft = el.scrollLeft
      el.style.cursor = 'grabbing'
    }
    const onLeave = () => {
      isDown = false
      el.style.cursor = ''
    }
    const onUp = () => {
      isDown = false
      el.style.cursor = ''
    }
    const onMove = (e) => {
      if (!isDown) return
      const pageX = e.touches ? e.touches[0].pageX : e.pageX
      const x = pageX - el.offsetLeft
      const walk = (x - startX) * 1.1
      if (Math.abs(walk) > 3) moved = true
      el.scrollLeft = scrollLeft - walk
      if (moved && !e.touches) e.preventDefault()
    }
    const onClickCapture = (e) => {
      // 드래그 후 발생하는 click 이벤트는 억제 (의도치 않은 버튼 클릭 방지)
      if (moved) {
        e.stopPropagation()
        e.preventDefault()
        moved = false
      }
    }

    el.addEventListener('mousedown', onDown)
    el.addEventListener('mouseleave', onLeave)
    el.addEventListener('mouseup', onUp)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('click', onClickCapture, true)

    return () => {
      el.removeEventListener('mousedown', onDown)
      el.removeEventListener('mouseleave', onLeave)
      el.removeEventListener('mouseup', onUp)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  return ref
}

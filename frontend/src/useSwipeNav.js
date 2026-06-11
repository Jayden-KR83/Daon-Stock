import { useEffect } from 'react'

/* 모바일/앱 모드 좌우 스와이프 → 인접 탭 전환.
   가로 스크롤 영역(보유 pills·마켓바)·차트 SVG 드래그·입력칸과 충돌하지 않도록,
   제스처 시작점이 그런 요소 안이면 무시한다. (실기기 회귀 방지용 보수적 가드) */
export function useSwipeNav(ref, { order, active, onChange, enabled = true }) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    let x0 = 0, y0 = 0, t0 = 0, skip = false

    function startsInNoSwipe(target) {
      let n = target
      while (n && n !== el) {
        if (n.dataset && n.dataset.noswipe != null) return true
        const tag = n.tagName
        if (tag === 'SVG' || tag === 'CANVAS' || tag === 'INPUT'
            || tag === 'TEXTAREA' || tag === 'SELECT') return true
        try {
          const st = getComputedStyle(n)
          if ((st.overflowX === 'auto' || st.overflowX === 'scroll')
              && n.scrollWidth > n.clientWidth + 4) return true
        } catch {}
        n = n.parentElement
      }
      return false
    }

    function onStart(e) {
      if (e.touches.length !== 1) { skip = true; return }
      const t = e.touches[0]
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now()
      skip = startsInNoSwipe(e.target)
    }
    function onEnd(e) {
      if (skip) return
      const t = e.changedTouches[0]
      const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0
      if (dt > 700) return                       // 너무 느린 제스처 무시
      if (Math.abs(dx) < 70) return              // 최소 이동거리
      if (Math.abs(dx) < Math.abs(dy) * 2) return // 가로 우세만 (세로 스크롤 보호)
      const i = order.indexOf(active)
      if (i < 0) return
      const ni = dx < 0 ? Math.min(i + 1, order.length - 1)
                        : Math.max(i - 1, 0)
      if (ni !== i) onChange(order[ni])
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchend', onEnd)
    }
  }, [ref, order, active, onChange, enabled])
}

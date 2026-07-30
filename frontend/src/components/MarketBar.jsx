import React, { useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMarket } from '../api'
import { useStore } from '../store'
import Sparkline from './Sparkline'
import './MarketBar.css'

/**
 * 우→좌로 흐르는 지수 티커 테이프.
 *
 * 구현이 CSS 애니메이션(translateX) → 실제 스크롤(scrollLeft)로 바뀌었다.
 * 이유: transform 마퀴는 사용자가 위치를 바꿀 방법이 없어서, "흐르는 항목을
 * 눌렀을 때만" 접근이 가능했다. 스크롤 컨테이너로 만들면 ◀▶ 버튼·터치 스와이프·
 * 트랙패드가 모두 그대로 동작한다.
 *
 * - 시퀀스를 2배 복제하고 절반 지점에서 되돌려 무한 루프(이음매 없음).
 * - hover/터치/버튼 조작 중에는 자동 흐름 정지 후 일정 시간 뒤 재개.
 */
const AUTO_PX_PER_SEC = 26      // 자동 흐름 속도
const RESUME_DELAY_MS = 2600    // 조작 후 자동 흐름 재개까지

export default function MarketBar() {
  const setChartTicker = useStore(s => s.setChartTicker)
  const viewRef = useRef(null)
  const pausedUntil = useRef(0)
  const hovering = useRef(false)

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['market'],
    queryFn: getMarket,
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  const hasData = !!data && data.length > 0

  // 자동 흐름 — rAF로 scrollLeft를 직접 밀고, 절반 넘어가면 되돌려 루프
  useEffect(() => {
    if (!hasData) return
    const el = viewRef.current
    if (!el) return
    let raf = 0, last = 0

    const step = (ts) => {
      raf = requestAnimationFrame(step)
      if (!last) { last = ts; return }
      const dt = ts - last
      last = ts
      const half = el.scrollWidth / 2
      if (half <= 0) return
      // 루프 보정은 정지 중에도 수행 — 수동 스크롤로 끝에 도달한 경우 대비
      if (el.scrollLeft >= half) el.scrollLeft -= half
      else if (el.scrollLeft < 0) el.scrollLeft += half
      if (hovering.current || performance.now() < pausedUntil.current) return
      el.scrollLeft += (AUTO_PX_PER_SEC * dt) / 1000
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [hasData])

  const pause = useCallback(() => {
    pausedUntil.current = performance.now() + RESUME_DELAY_MS
  }, [])

  const page = useCallback((dir) => {
    const el = viewRef.current
    if (!el) return
    pause()
    const half = el.scrollWidth / 2
    const amount = Math.max(120, el.clientWidth * 0.8)
    // 왼쪽 끝에서 ◀ 를 누르면 더 갈 곳이 없다 → 복제된 뒤쪽 절반으로 순간 이동 후 스크롤
    if (dir < 0 && el.scrollLeft < amount) el.scrollLeft += half
    el.scrollBy({ left: dir * amount, behavior: 'smooth' })
  }, [pause])

  // 응답이 비었을 때 — 로딩/오류 구분해서 사용자에게 명확히 알림
  if (!hasData) {
    if (isLoading) {
      return (
        <div className="mbar mbar-empty" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, color: 'var(--m-text-tertiary)',
          letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700,
        }}>마켓 데이터 로딩…</div>
      )
    }
    if (isError) {
      return (
        <div className="mbar mbar-empty" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, color: 'var(--m-negative)', fontWeight: 700,
        }}>마켓 데이터 일시 미연결 — 5분 후 자동 재시도</div>
      )
    }
    return <div className="mbar mbar-empty" />
  }

  // 무한 루프를 위해 정확히 2회 반복
  const sequence = [...data, ...data]

  return (
    <div className="mbar"
      onMouseEnter={() => { hovering.current = true }}
      onMouseLeave={() => { hovering.current = false }}>

      <button className="mbar-nav mbar-nav-prev" type="button"
        aria-label="지수 왼쪽으로 이동" onClick={() => page(-1)}>‹</button>

      {/* data-noswipe: 탭 전환 스와이프가 이 안의 가로 스크롤을 가로채지 않도록 */}
      <div className="mbar-view mbar-fade" ref={viewRef} data-noswipe
        onPointerDown={pause} onWheel={pause} onTouchStart={pause}
        role="group" aria-label="주요 지수 시세">
        <div className="mbar-track">
          {sequence.map((item, idx) => {
            const up = (item.pct ?? 0) >= 0
            return (
              <button
                className="mi"
                key={`${item.ticker}-${idx}`}
                onClick={() => setChartTicker(item.ticker)}
                title={`${item.name} 차트 보기`}
                aria-hidden={idx >= data.length ? 'true' : undefined}
                tabIndex={idx >= data.length ? -1 : undefined}
              >
                <div className="mi-spark">
                  <Sparkline values={item.spark} positive={up} width={36} height={18} />
                </div>
                <div className="mi-info">
                  <span className="ml">{item.name}</span>
                  <span className="mp">{fmtPrice(item.name, item.price)}</span>
                  <span className={up ? 'mu' : 'md'}>{up ? '+' : ''}{(item.pct ?? 0).toFixed(2)}%</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <button className="mbar-nav mbar-nav-next" type="button"
        aria-label="지수 오른쪽으로 이동" onClick={() => page(1)}>›</button>
    </div>
  )
}

function fmtPrice(name, price) {
  if (price == null || isNaN(price)) return '—'
  if (name === 'KOSPI') return price.toFixed(0)
  if (name === 'VIX')   return price.toFixed(2)
  if (name === 'USD/KRW') return price.toFixed(0)
  if (name === '10Y채권') return `${price.toFixed(2)}%`
  if (price > 1000) return price.toFixed(0)
  return price.toFixed(2)
}

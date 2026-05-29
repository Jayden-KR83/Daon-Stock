import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMarket } from '../api'
import { useStore } from '../store'
import Sparkline from './Sparkline'
import './MarketBar.css'

/**
 * 우→좌로 자동 흐르는 티커 테이프 (마퀴).
 * - 시퀀스를 2배 복제하여 translateX(0% → -50%) 무한 루프, 끊김 없음.
 * - 마우스 hover / 터치 중에는 일시정지.
 * - 항목 클릭 시 차트로 이동.
 * - prefers-reduced-motion 시 자동 정지.
 */
export default function MarketBar() {
  const setChartTicker = useStore(s => s.setChartTicker)

  const { data = [] } = useQuery({
    queryKey: ['market'],
    queryFn: getMarket,
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  if (!data || data.length === 0) {
    return <div className="mbar mbar-empty" />
  }

  // 무한 루프를 위해 정확히 2회 반복
  const sequence = [...data, ...data]
  // 항목당 2.2초 페이스 — 12개면 26초, 8개면 약 18초 (체감 가능 속도)
  const durationSec = Math.max(18, Math.round(data.length * 2.2))

  return (
    <div className="mbar mbar-fade">
      <div
        className="mbar-track"
        style={{ animationDuration: `${durationSec}s` }}
      >
        {sequence.map((item, idx) => {
          const up = (item.pct ?? 0) >= 0
          return (
            <button
              className="mi"
              key={`${item.ticker}-${idx}`}
              onClick={() => setChartTicker(item.ticker)}
              title={`${item.name} 차트 보기`}
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

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useStore } from '../store'
import { getEarningsCalendar, getPortfolio } from '../api'

/**
 * 보유·관심 종목의 다음 실적 발표일 캘린더.
 * TrendsTab 또는 ChartTab에 임베드 가능.
 */
export default function EarningsCalendar() {
  const setChartTicker = useStore(s => s.setChartTicker)
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'], queryFn: getPortfolio, staleTime: 60_000,
  })

  // 보유 + 관심 종목 티커 통합
  const tickers = React.useMemo(() => {
    if (!portfolio?.portfolios) return []
    const set = new Set()
    for (const acc of Object.keys(portfolio.portfolios)) {
      for (const h of (portfolio.portfolios[acc] || [])) set.add(h.ticker)
    }
    for (const w of (portfolio.watchlist || [])) set.add(w.ticker)
    return [...set]
  }, [portfolio])

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (tickers.length === 0) return
    let aborted = false
    setLoading(true); setErr('')
    getEarningsCalendar({ tickers, days_ahead: 90 })
      .then(r => { if (!aborted) setData(r) })
      .catch(e => { if (!aborted) setErr(e.response?.data?.detail || '실패') })
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [tickers.join(',')])

  if (tickers.length === 0) return null

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header" style={{ marginBottom: 10 }}>
        <div>
          <div className="mono-section-title">
            다음 실적 캘린더
            {data?.events?.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600,
                color: 'var(--m-text-tertiary)' }}>{data.events.length}건</span>
            )}
          </div>
          <div className="mono-section-sub ko-keep">
            US 종목 향후 90일 · 한국 종목은 데이터 미제공
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 20,
          fontSize: 12, color: 'var(--clr-text-muted)' }}>분석 중…</div>
      )}
      {/* 진짜 에러만 실패로 표시 — 빈 결과는 정상 상태 */}
      {err && !data && (
        <div style={{ padding: 10, fontSize: 12, borderRadius: 8,
          background: 'var(--clr-neg-bg-soft)', color: 'var(--clr-neg-dark)' }}>
          <strong>일정 조회 실패</strong>: {err}
        </div>
      )}
      {data && data.events.length === 0 && !loading && (
        <div className="ko-keep" style={{ textAlign: 'center', padding: 24,
          fontSize: 12.5, color: 'var(--clr-text-muted)',
          background: 'var(--clr-bg)', borderRadius: 10,
          border: '1px dashed var(--clr-border-md)', lineHeight: 1.7 }}>
          <div className="emoji-mute" style={{ fontSize: 24, marginBottom: 4, opacity: .6 }}>📅</div>
          향후 90일 내 예정된 US 종목 실적 발표가 없습니다.<br/>
          <span style={{ fontSize: 10.5, opacity: .8 }}>
            ({data.tickers_checked}개 종목 조회 · 한국 종목은 자동 제외)
          </span>
        </div>
      )}
      {data && data.events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.events.slice(0, 20).map((e, i) => {
            const d = new Date(e.date + 'T00:00:00')
            const now = new Date()
            const daysAway = Math.ceil((d - now) / (1000 * 60 * 60 * 24))
            const isUrgent = daysAway <= 7
            return (
              <motion.div key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setChartTicker(e.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  background: isUrgent ? 'var(--clr-warn-bg, #FEF3C7)' : 'var(--clr-bg)',
                  border: `1px solid ${isUrgent ? '#FCD34D' : 'var(--clr-border-md)'}`,
                  borderRadius: 8, cursor: 'pointer',
                }}>
                <div style={{ minWidth: 64, textAlign: 'center',
                  padding: '4px 6px', background: 'var(--clr-surface)',
                  borderRadius: 6, fontSize: 11, fontWeight: 700,
                  color: isUrgent ? 'var(--clr-warn-dark, #92400E)' : 'var(--clr-text-mid)',
                  fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.75 }}>
                    {d.toLocaleDateString('ko-KR', { weekday: 'short' })}
                  </div>
                  <div>{e.date.slice(5)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800,
                    color: 'var(--clr-text-strong)' }}>
                    {e.ticker}
                    {isUrgent && (
                      <span style={{ marginLeft: 6, fontSize: 9,
                        background: 'var(--clr-neg)', color: '#fff',
                        padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                        D-{daysAway}
                      </span>
                    )}
                  </div>
                  {e.eps_estimate != null && (
                    <div style={{ fontSize: 10.5, color: 'var(--clr-text-muted)',
                      fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                      EPS 컨센서스: {e.eps_estimate.toFixed(2)}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

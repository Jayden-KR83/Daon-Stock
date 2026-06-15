import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore } from '../store'
import { getEarningsCalendar, getPortfolio } from '../api'
import LogoCircle from './LogoCircle'
import { displayName, isKrTicker } from '../utils/displayName'

/**
 * 실적 캘린더 — 이번 달(이동 가능) 월~금 달력 그리드.
 * 날짜칸에 보유·관심 종목 로고로 실적 발표일을 직관 표시. (US 종목 / 한국 미제공)
 * 일부 종목 조회 실패해도 조회된 종목은 그대로 노출.
 */
const WEEKDAYS = ['월', '화', '수', '목', '금']

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

  // ticker → 종목명 맵 (보유·관심) — KR 종목 툴팁에 코드 대신 이름 표시용
  const nameByTicker = React.useMemo(() => {
    const m = {}
    if (portfolio?.portfolios) {
      for (const acc of Object.keys(portfolio.portfolios)) {
        for (const h of (portfolio.portfolios[acc] || [])) {
          if (h.ticker) m[String(h.ticker).toUpperCase()] = h.name
        }
      }
    }
    for (const w of (portfolio?.watchlist || [])) {
      if (w.ticker) m[String(w.ticker).toUpperCase()] = w.name
    }
    return m
  }, [portfolio])

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [monthOffset, setMonthOffset] = useState(0)   // 0 = 이번 달

  React.useEffect(() => {
    if (tickers.length === 0) return
    let aborted = false
    setLoading(true); setErr('')
    getEarningsCalendar({ tickers, days_ahead: 120 })
      .then(r => { if (!aborted) setData(r) })
      .catch(e => { if (!aborted) setErr(e.response?.data?.detail || '실패') })
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [tickers.join(',')])

  // 날짜('YYYY-MM-DD') → 이벤트 배열
  const eventsByDate = React.useMemo(() => {
    const m = {}
    for (const e of data?.events || []) {
      const key = String(e.date || '').slice(0, 10)
      if (!key) continue
      ;(m[key] = m[key] || []).push(e)
    }
    return m
  }, [data])

  if (tickers.length === 0) return null

  const today = new Date()
  const view = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = view.getFullYear()
  const month = view.getMonth()              // 0~11
  const monthLabel = `${year}년 ${month + 1}월`
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const ymd = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const isCurMonth = year === today.getFullYear() && month === today.getMonth()

  // 월~금(주말 제외) 주별 그리드 구성
  const weeks = []
  let week = [null, null, null, null, null]
  for (let d = 1; d <= daysInMonth; d++) {
    const w = (new Date(year, month, d).getDay() + 6) % 7   // 월=0 … 일=6
    if (w <= 4) {
      week[w] = d
      if (w === 4) { weeks.push(week); week = [null, null, null, null, null] }
    }
  }
  if (week.some(x => x != null)) weeks.push(week)

  const totalInMonth = weeks.reduce((s, wk) =>
    s + wk.reduce((a, d) => a + (d && eventsByDate[ymd(d)] ? eventsByDate[ymd(d)].length : 0), 0), 0)

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header" style={{ marginBottom: 10 }}>
        <div>
          <div className="mono-section-title">실적 캘린더</div>
          <div className="mono-section-sub ko-keep">
            보유·관심 + S&amp;P500·Nasdaq100 상위 종목 실적일 · 보유 종목은 파란 테두리 (한국 종목 미제공)
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setMonthOffset(o => o - 1)} className="mono-pill"
            aria-label="이전 달" style={{ cursor: 'pointer' }}>‹</button>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-text)',
            minWidth: 78, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{monthLabel}</span>
          <button onClick={() => setMonthOffset(o => o + 1)} className="mono-pill"
            aria-label="다음 달" style={{ cursor: 'pointer' }}>›</button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 20, fontSize: 12,
          color: 'var(--m-text-tertiary)' }}>실적 일정 불러오는 중…</div>
      )}
      {err && !data && (
        <div className="ko-keep" style={{ padding: 10, fontSize: 12, borderRadius: 4,
          border: '1px solid var(--m-outline-variant)', color: 'var(--m-text-secondary)' }}>
          일부 조회 실패: {err} — 조회된 종목만 캘린더에 표시됩니다.
        </div>
      )}

      {!loading && (
        <>
          {/* 요일 헤더 (조회 실패/빈 결과여도 달력 자체는 항상 표시) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 4, marginBottom: 4 }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800,
                color: 'var(--m-text-tertiary)', padding: '2px 0' }}>{w}</div>
            ))}
          </div>

          {/* 주별 날짜 셀 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {weeks.map((wk, wi) => (
              <div key={wi} style={{ display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {wk.map((d, ci) => {
                  const evs = d ? (eventsByDate[ymd(d)] || []) : []
                  const isToday = isCurMonth && d === today.getDate()
                  return (
                    <div key={ci} style={{
                      minHeight: 74, padding: '4px 4px 6px',
                      border: d ? '1px solid var(--m-outline-variant)' : '1px solid transparent',
                      borderRadius: 4,
                      background: d ? 'var(--m-surface)' : 'transparent',
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                      {d && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 700,
                          color: isToday ? 'var(--m-on-primary)' : 'var(--m-text-secondary)',
                          background: isToday ? 'var(--m-primary)' : 'transparent',
                          borderRadius: isToday ? 999 : 0,
                          minWidth: isToday ? 18 : 'auto', height: isToday ? 18 : 'auto',
                          padding: isToday ? '0 4px' : 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          alignSelf: 'flex-start', fontVariantNumeric: 'tabular-nums',
                        }}>{d}</span>
                      )}
                      {evs.length > 0 && (() => {
                        const sorted = [...evs].sort((a, b) => (b.held ? 1 : 0) - (a.held ? 1 : 0))
                        const n = sorted.length
                        // 종목이 적을수록 크게 — 1개 34, 2개 28, 3~4개 22, 그 이상 16
                        const sz = n <= 1 ? 34 : n === 2 ? 28 : n <= 4 ? 22 : 16
                        const showText = n <= 2   // 적을 땐 티커 글자도 표시
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap',
                            gap: showText ? 8 : 4,
                            justifyContent: n <= 2 ? 'center' : 'flex-start',
                            paddingTop: 2 }}>
                            {sorted.slice(0, 8).map((e, i) => {
                              // KR 종목은 코드 대신 종목명(백엔드 name 또는 보유·관심 맵). US는 티커.
                              const label = isKrTicker(e.ticker)
                                ? displayName(e.ticker, e.name || nameByTicker[String(e.ticker).toUpperCase()])
                                : e.ticker
                              return (
                              <div key={i}
                                onClick={() => setChartTicker(e.ticker)}
                                title={`${label}${e.held ? ' (보유)' : ''} 실적 발표${e.eps_estimate != null
                                  ? ` · EPS 컨센 ${e.eps_estimate.toFixed(2)}` : ''}`}
                                style={{ cursor: 'pointer', display: 'flex',
                                  flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <div style={{ lineHeight: 0, borderRadius: '50%',
                                  border: e.held ? '2px solid var(--m-primary)' : '1.5px solid transparent',
                                  opacity: e.held ? 1 : 0.7 }}>
                                  <LogoCircle ticker={e.ticker} size={sz} />
                                </div>
                                {showText && (
                                  <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1,
                                    color: e.held ? 'var(--m-text)' : 'var(--m-text-tertiary)',
                                    maxWidth: sz + 14, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                                )}
                              </div>
                              )
                            })}
                            {n > 8 && (
                              <span style={{ fontSize: 9, color: 'var(--m-text-tertiary)',
                                alignSelf: 'center' }}>+{n - 8}</span>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="ko-keep" style={{ fontSize: 10, color: 'var(--m-text-tertiary)',
            marginTop: 8, lineHeight: 1.5 }}>
            {totalInMonth > 0
              ? `${monthLabel} 실적 발표 ${totalInMonth}건 · 로고를 누르면 종목 차트로 이동`
              : `${monthLabel}엔 예정된 실적 발표가 없습니다 (US 기준 · 한국 종목 제외).`}
          </div>
        </>
      )}
    </div>
  )
}

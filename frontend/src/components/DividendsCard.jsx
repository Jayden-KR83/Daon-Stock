import React, { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { useStore } from '../store'
import { getPortfolioDividends } from '../api'

/**
 * 배당금 이력 + 연간 예상 — A안 무채색 + 직사각형.
 * 분석 탭에 임베드.
 */
export default function DividendsCard({ allHoldings = [], usdKrw = 1380 }) {
  const privacyMode = useStore(s => s.privacyMode)
  const setChartTicker = useStore(s => s.setChartTicker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('timeline')   // 'timeline' | 'overview' | 'upcoming' | 'history'

  useEffect(() => {
    if (allHoldings.length === 0) return
    let aborted = false
    setLoading(true); setErr('')
    getPortfolioDividends({
      holdings: allHoldings.map(h => ({
        ticker: h.ticker, quantity: h.quantity, name: h.name,
      })),
      months_back: 48,   // 최근 4년 — 분기 히스토그램으로 과거 이력 표시
      usd_krw: usdKrw,
    })
      .then(r => { if (!aborted) setData(r) })
      .catch(e => { if (!aborted) setErr(e.response?.data?.detail || '배당 데이터 조회 실패') })
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHoldings.length, usdKrw])

  if (allHoldings.length === 0) return null

  const fmtKrw = (v) => {
    if (privacyMode) return '••••'
    if (!v || v === 0) return '₩0'
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)}억`
    if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`
    return `₩${Math.round(v).toLocaleString()}`
  }
  const byTicker = data?.by_ticker || {}
  const tickerList = Object.entries(byTicker)
    .filter(([, v]) => v.annual_estimate_krw > 0)
    .sort((a, b) => b[1].annual_estimate_krw - a[1].annual_estimate_krw)
  const hasAnyDividend = tickerList.length > 0

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header">
        <div>
          <div className="mono-section-title is-accent">배당금 이력 · 캘린더</div>
          <div className="mono-section-sub ko-keep">
            연간 예상 배당과 최근 24개월 수령 이력 · 한국 종목은 yfinance 데이터 한정
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 20,
          fontSize: 12, color: 'var(--m-text-tertiary)' }}>배당 데이터 조회 중…</div>
      )}

      {err && !data && (
        <div style={{ padding: 8, fontSize: 11, borderRadius: 2,
          border: '1px solid var(--m-negative)', color: 'var(--m-negative)' }}>{err}</div>
      )}

      {data && !hasAnyDividend && !loading && (
        <div className="ko-keep" style={{ padding: '14px 12px',
          border: '1px dashed var(--m-outline-variant)', borderRadius: 2,
          fontSize: 12, color: 'var(--m-text-secondary)', textAlign: 'center' }}>
          보유 종목 중 배당 지급 데이터가 있는 종목이 없습니다
          <br/>
          <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
            ({data.tickers_checked}개 종목 조회 · 한국 종목 일부는 데이터 미제공)
          </span>
        </div>
      )}

      {data && hasAnyDividend && (
        <>
          {/* 상단 요약 — 큰 평가액 + 부속 */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <div className="m3-label" style={{ marginBottom: 3 }}>연간 예상 배당</div>
              <div style={{ fontSize: 22, fontWeight: 900,
                color: 'var(--m-text)', letterSpacing: '-.025em',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
                {fmtKrw(data.annual_estimate_krw)}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <div className="m3-label" style={{ marginBottom: 3 }}>지난 12개월 수령</div>
              <div style={{ fontSize: 18, fontWeight: 800,
                color: 'var(--m-text-secondary)',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {fmtKrw(data.ttm_received_krw)}
              </div>
            </div>
            <div style={{ minWidth: 90 }}>
              <div className="m3-label" style={{ marginBottom: 3 }}>배당 종목</div>
              <div style={{ fontSize: 18, fontWeight: 800,
                color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {tickerList.length}<span style={{ fontSize: 10,
                  color: 'var(--m-text-tertiary)', fontWeight: 600 }}>
                  /{data.tickers_checked}</span>
              </div>
            </div>
          </div>

          {/* 탭 토글 */}
          <div className="seg-ctrl" style={{ marginBottom: 10 }}>
            {[
              ['timeline', '타임라인'],
              ['overview', `종목별 (${tickerList.length})`],
              ['upcoming', `예정 (${data.upcoming?.length || 0})`],
              ['history',  `이력 (${data.events?.length || 0})`],
            ].map(([v, label]) => (
              <button key={v}
                className={`seg-btn ${tab === v ? 'active' : ''}`}
                onClick={() => setTab(v)}
                style={{ fontSize: 11 }}>
                {label}
              </button>
            ))}
          </div>

          {/* 타임라인 — 최근 18개월 수령 + 향후 6개월 예정 히스토그램 */}
          {tab === 'timeline' && (
            <DividendHistogram events={data.events} upcoming={data.upcoming} fmtKrw={fmtKrw} />
          )}

          {/* 종목별 */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {tickerList.map(([tkr, v], i) => (
                <motion.div key={tkr}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setChartTicker(tkr)}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                    gap: 10, alignItems: 'baseline',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--m-outline-variant)',
                    cursor: 'pointer',
                  }}>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800,
                      color: 'var(--m-text)', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {v.name}
                      <span style={{ fontSize: 10, fontWeight: 600,
                        color: 'var(--m-text-tertiary)', marginLeft: 6 }}>
                        {tkr}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--m-text-tertiary)',
                      marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                      주당 ${v.per_share_annual.toFixed(2)}/년
                      {v.ex_date && <span style={{ marginLeft: 6 }}>· ex-date {v.ex_date}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="m3-label" style={{ fontSize: 8.5 }}>수익률</div>
                    <div style={{ fontSize: 12, fontWeight: 800,
                      color: 'var(--m-text)',
                      fontVariantNumeric: 'tabular-nums' }}>
                      {v.dividend_yield_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 70 }}>
                    <div className="m3-label" style={{ fontSize: 8.5 }}>연 예상</div>
                    <div style={{ fontSize: 12.5, fontWeight: 800,
                      color: 'var(--m-text)',
                      fontVariantNumeric: 'tabular-nums' }}>
                      {fmtKrw(v.annual_estimate_krw)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* 예정 ex-date */}
          {tab === 'upcoming' && (
            data.upcoming.length === 0 ? (
              <div className="ko-keep" style={{ padding: '14px 12px',
                border: '1px dashed var(--m-outline-variant)', borderRadius: 2,
                fontSize: 12, color: 'var(--m-text-secondary)', textAlign: 'center' }}>
                다음 ex-dividend date 정보가 없습니다
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.upcoming.map((e, i) => {
                  const d = new Date(e.ex_date + 'T00:00:00')
                  const daysAway = Math.ceil((d - new Date()) / 86400000)
                  const isUrgent = daysAway >= 0 && daysAway <= 14
                  return (
                    <div key={i} onClick={() => setChartTicker(e.ticker)}
                      style={{
                        display: 'grid', gridTemplateColumns: '64px 1fr auto',
                        gap: 10, alignItems: 'center', padding: '8px 0',
                        borderBottom: '1px solid var(--m-outline-variant)',
                        cursor: 'pointer',
                      }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800,
                          color: isUrgent ? 'var(--m-text)' : 'var(--m-text-secondary)',
                          fontVariantNumeric: 'tabular-nums' }}>
                          {e.ex_date.slice(5)}
                        </div>
                        {isUrgent && (
                          <span className="sev-label is-critical"
                            style={{ marginTop: 2, display: 'inline-block' }}>
                            D-{daysAway}
                          </span>
                        )}
                      </div>
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800,
                          color: 'var(--m-text)', whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.name}
                          <span style={{ fontSize: 10, fontWeight: 600,
                            color: 'var(--m-text-tertiary)', marginLeft: 6 }}>{e.ticker}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right',
                        fontSize: 12, fontWeight: 800, color: 'var(--m-text)',
                        fontVariantNumeric: 'tabular-nums' }}>
                        ~ {fmtKrw(e.est_total_krw)}
                      </div>
                    </div>
                  )
                })}
                <div className="ko-keep" style={{ fontSize: 10,
                  color: 'var(--m-text-tertiary)', marginTop: 6 }}>
                  분기 배당 가정으로 예상치 계산. 실제 금액은 회사 결의·환율에 따라 변동.
                </div>
              </div>
            )
          )}

          {/* 과거 이력 */}
          {tab === 'history' && (
            data.events.length === 0 ? (
              <div className="ko-keep" style={{ padding: '14px 12px',
                border: '1px dashed var(--m-outline-variant)', borderRadius: 2,
                fontSize: 12, color: 'var(--m-text-secondary)', textAlign: 'center' }}>
                최근 수령 이력 없음
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {data.events.slice(0, 80).map((e, i) => (
                  <div key={i} onClick={() => setChartTicker(e.ticker)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '70px 1fr auto auto',
                      gap: 10, alignItems: 'baseline', padding: '7px 0',
                      borderBottom: '1px solid var(--m-outline-variant)',
                      cursor: 'pointer',
                    }}>
                    <span style={{ fontSize: 11, color: 'var(--m-text-secondary)',
                      fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{e.date}</span>
                    <span style={{ fontSize: 12, fontWeight: 700,
                      color: 'var(--m-text)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {e.name}
                      <span style={{ fontSize: 10, fontWeight: 600,
                        color: 'var(--m-text-tertiary)', marginLeft: 5 }}>{e.ticker}</span>
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)',
                      fontVariantNumeric: 'tabular-nums' }}>${e.per_share.toFixed(2)}/주</span>
                    <span style={{ fontSize: 12, fontWeight: 800,
                      color: 'var(--m-positive)',
                      fontVariantNumeric: 'tabular-nums', minWidth: 64,
                      textAlign: 'right' }}>
                      +{fmtKrw(e.total_krw)}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}

/* 분기 버킷 — 과거 ~3.5년(14분기 수령) + 향후 2분기(예정).
   events.date / upcoming.ex_date 'YYYY-MM-DD' → 분기 키 'YYYY-Q'로 집계. x축은 'YY/NQ. */
function _quarterKey(year, q) { return `${year}-${q}` }
function buildDividendQuarters(events, upcoming) {
  const now = new Date()
  const curQ = Math.floor(now.getMonth() / 3) + 1
  const quarters = []
  const idx = {}
  // 과거 14분기 ~ 미래 2분기
  for (let i = -14; i <= 2; i++) {
    let y = now.getFullYear(), q = curQ + i
    while (q < 1) { q += 4; y -= 1 }
    while (q > 4) { q -= 4; y += 1 }
    const key = _quarterKey(y, q)
    if (idx[key] != null) continue
    idx[key] = quarters.length
    quarters.push({ key, year: y, q, received: 0, expected: 0, isFuture: i > 0 })
  }
  const toKey = (dateStr) => {
    const d = new Date(dateStr)
    if (isNaN(d)) return null
    return _quarterKey(d.getFullYear(), Math.floor(d.getMonth() / 3) + 1)
  }
  for (const e of events || []) {
    const k = toKey(e.date); if (k != null && idx[k] != null) quarters[idx[k]].received += (e.total_krw || 0)
  }
  for (const u of upcoming || []) {
    const k = toKey(u.ex_date); if (k != null && idx[k] != null) quarters[idx[k]].expected += (u.est_total_krw || 0)
  }
  return quarters
}

function DividendHistogram({ events, upcoming, fmtKrw }) {
  const quarters = React.useMemo(() => buildDividendQuarters(events, upcoming), [events, upcoming])
  const max = Math.max(1, ...quarters.map(m => Math.max(m.received, m.expected)))
  const sumReceived = quarters.reduce((s, m) => s + m.received, 0)
  const sumExpected = quarters.reduce((s, m) => s + m.expected, 0)

  if (sumReceived === 0 && sumExpected === 0) {
    return (
      <div className="ko-keep" style={{ padding: '14px 12px',
        border: '1px dashed var(--m-outline-variant)', borderRadius: 2,
        fontSize: 12, color: 'var(--m-text-secondary)', textAlign: 'center' }}>
        해당 구간에 집계된 배당 내역이 없습니다
      </div>
    )
  }

  return (
    <div>
      {/* 범례 + 합계 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap',
        fontSize: 11, color: 'var(--m-text-secondary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 9, height: 9, background: '#1F4FD3', borderRadius: 1 }} />
          수령 누계 <strong style={{ color: 'var(--m-text)', marginLeft: 2 }}>{fmtKrw(sumReceived)}</strong>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 9, height: 9, background: 'rgba(31,79,211,0.32)',
            borderRadius: 1 }} />
          예정 <strong style={{ color: 'var(--m-text)', marginLeft: 2 }}>{fmtKrw(sumExpected)}</strong>
        </span>
      </div>

      {/* 막대 — 분기별 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 112,
        borderBottom: '1px solid var(--m-outline-variant)' }}>
        {quarters.map(m => {
          const rH = (m.received / max) * 100
          const eH = (m.expected / max) * 100
          const title = `'${String(m.year).slice(2)}/${m.q}Q`
            + (m.received ? ` · 수령 ${fmtKrw(m.received)}` : '')
            + (m.expected ? ` · 예정 ${fmtKrw(m.expected)}` : '')
          return (
            <div key={m.key} title={title}
              style={{ flex: 1, minWidth: 0, height: '100%',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {eH > 0 && (
                <div style={{ height: `${eH}%`, background: 'rgba(31,79,211,0.32)',
                  borderRadius: '2px 2px 0 0' }} />
              )}
              {rH > 0 && (
                <div style={{ height: `${rH}%`, background: '#1F4FD3',
                  borderRadius: eH > 0 ? 0 : '2px 2px 0 0' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* x축 라벨 — 분기마다 'YY/NQ (1Q·3Q만 표기해 과밀 방지) */}
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {quarters.map(m => (
          <div key={m.key} style={{ flex: 1, minWidth: 0, textAlign: 'center',
            fontSize: 8, fontWeight: 700, color: 'var(--m-text-tertiary)',
            whiteSpace: 'nowrap', overflow: 'visible' }}>
            {(m.q === 1 || m.q === 3) ? `'${String(m.year).slice(2)}/${m.q}Q` : ''}
          </div>
        ))}
      </div>

      <div className="ko-keep" style={{ fontSize: 10,
        color: 'var(--m-text-tertiary)', marginTop: 8, lineHeight: 1.55 }}>
        진한 막대 = 실제 수령, 옅은 막대 = 예정(분기 배당 가정). <strong>현재 보유 수량 기준</strong>으로 환산해
        매수 이전 분기는 가상 추정입니다. 과거 시세 출처(yfinance)에 배당 데이터가 없는 한국 펀드·일부 ETF는 제외됩니다.
      </div>
    </div>
  )
}

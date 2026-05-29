import React, { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { getCorrelation } from '../api'

/**
 * 종목 간 상관관계 매트릭스 (히트맵 테이블).
 * Allocation 탭에 임베드 — 보유 종목 ≥ 2개일 때 자동 계산.
 */
export default function CorrelationCard({ allHoldings = [] }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [period, setPeriod] = useState('1y')
  const [open, setOpen] = useState(true)

  async function run() {
    if (allHoldings.length < 2) return
    setLoading(true); setErr(''); setData(null)
    try {
      const r = await getCorrelation({
        holdings: allHoldings.map(h => ({ ticker: h.ticker })),
        period,
      })
      setData(r)
    } catch (e) {
      setErr(e.response?.data?.detail || '상관관계 계산 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period, allHoldings.length])

  if (allHoldings.length < 2) return null

  return (
    <div style={{ background: 'var(--clr-surface)', borderRadius: 14,
      padding: 16, marginBottom: 12,
      boxShadow: '0 1px 3px rgba(15,23,42,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="emoji-mute" style={{ fontSize: 14 }}>🔗</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--clr-text-strong)' }}>
              종목 간 상관관계
            </span>
            {data && (
              <span style={{ padding: '2px 8px', borderRadius: 10,
                fontSize: 10, fontWeight: 800,
                background: data.avg_correlation < 0.3 ? 'var(--clr-pos)'
                          : data.avg_correlation < 0.6 ? 'var(--clr-warn, #F59E0B)'
                          : 'var(--clr-neg)',
                color: '#fff' }}>
                평균 {data.avg_correlation}
              </span>
            )}
          </div>
          <div className="ko-keep" style={{ fontSize: 10.5,
            color: 'var(--clr-text-muted)', marginTop: 2 }}>
            낮을수록(파란색) 분산 효과 ↑ / 1에 가까울수록 같이 움직임 (빨간색)
          </div>
        </div>
        <div className="seg-ctrl" style={{ flex: 'none' }}>
          {['3mo','6mo','1y','2y'].map(p => (
            <button key={p} className={`seg-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)} style={{ fontSize: 10, minWidth: 30 }}>
              {p.replace('mo','M').replace('y','Y')}
            </button>
          ))}
          <button onClick={() => setOpen(o => !o)} className="seg-btn"
            style={{ fontSize: 10 }}>{open ? '접기' : '펼치기'}</button>
        </div>
      </div>

      {open && (
        <>
          {loading && (
            <div style={{ textAlign: 'center', padding: 20,
              fontSize: 12, color: 'var(--clr-text-muted)' }}>
              종목별 일별 데이터 분석 중… (5~15초)
            </div>
          )}
          {err && (
            <div style={{ padding: 8, fontSize: 11, borderRadius: 8,
              background: 'var(--clr-neg-bg-soft)', color: 'var(--clr-neg-dark)' }}>{err}</div>
          )}
          {data && <Heatmap data={data} />}
        </>
      )}
    </div>
  )
}

function Heatmap({ data }) {
  const { tickers, matrix, interpretation, data_points } = data
  // 셀 색상: -1(파랑) → 0(흰색) → +1(빨강)
  function color(v) {
    const intensity = Math.abs(v)
    if (v >= 0) {
      // 0(흰) → 1(빨강)
      const r = 255
      const g = Math.round(255 - intensity * 180)
      const b = Math.round(255 - intensity * 180)
      return `rgb(${r}, ${g}, ${b})`
    } else {
      // 0(흰) → -1(파랑)
      const b = 255
      const g = Math.round(255 - intensity * 130)
      const r = Math.round(255 - intensity * 180)
      return `rgb(${r}, ${g}, ${b})`
    }
  }
  const textColor = (v) => Math.abs(v) > 0.55 ? '#fff' : '#0F172A'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 2,
          fontSize: 11, margin: '0 auto' }}>
          <thead>
            <tr>
              <th></th>
              {tickers.map(t => (
                <th key={t} style={{ padding: '4px 6px', fontSize: 10,
                  fontWeight: 800, color: 'var(--clr-text-strong)',
                  writingMode: 'vertical-rl', textOrientation: 'mixed',
                  whiteSpace: 'nowrap', height: 60 }}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={row.ticker}>
                <th style={{ padding: '4px 8px', fontSize: 10.5,
                  fontWeight: 800, color: 'var(--clr-text-strong)',
                  textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {row.ticker}
                </th>
                {row.values.map((v, j) => (
                  <td key={j} style={{
                    width: 36, height: 28, textAlign: 'center',
                    background: color(v), color: textColor(v),
                    fontSize: 9.5, fontWeight: 700, borderRadius: 3,
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'default',
                  }} title={`${tickers[i]} ↔ ${tickers[j]}: ${v}`}>
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ko-keep" style={{ fontSize: 11,
        color: 'var(--clr-text), var(--clr-text-strong)',
        marginTop: 10, textAlign: 'center', lineHeight: 1.6 }}>
        <strong>{interpretation}</strong>
        <span style={{ marginLeft: 6, color: 'var(--clr-text-muted)',
          fontWeight: 500, fontSize: 10 }}>
          · {data_points}일 데이터 / 평균 상관계수 {data.avg_correlation}
        </span>
      </div>
    </motion.div>
  )
}

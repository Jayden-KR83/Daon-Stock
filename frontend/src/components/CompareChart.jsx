import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  Legend, ReferenceLine,
} from 'recharts'
import { searchStocks, getCompareSeries } from '../api'
import LogoCircle from './LogoCircle'

const COLORS = ['#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444']

/**
 * 차트 비교 모드 — 2~6종목 정규화(=100) 동시 비교.
 * TrendsTab 또는 ExploreTab에 임베드.
 */
export default function CompareChart() {
  const [selected, setSelected] = useState([])
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [period, setPeriod] = useState('1y')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const dropRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const h = (e) => {
      if (!dropRef.current || !inputRef.current) return
      if (!dropRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const [searchResults, setSearchResults] = useState([])
  useEffect(() => {
    if (debouncedQ.length < 1) { setSearchResults([]); return }
    let aborted = false
    searchStocks(debouncedQ).then(r => { if (!aborted) setSearchResults(r || []) })
    return () => { aborted = true }
  }, [debouncedQ])

  function addStock(item) {
    if (selected.length >= 6) return
    if (selected.find(s => s.ticker === item.symbol)) return
    setSelected([...selected, { ticker: item.symbol, name: item.shortname || item.symbol }])
    setQ('')
    setShowDrop(false)
    setData(null)
  }
  function removeStock(t) {
    setSelected(selected.filter(s => s.ticker !== t))
    setData(null)
  }

  async function runCompare() {
    if (selected.length < 2) { setErr('2종목 이상 선택하세요'); return }
    setLoading(true); setErr('')
    try {
      const r = await getCompareSeries({
        tickers: selected.map(s => s.ticker), period,
      })
      setData(r)
    } catch (e) {
      setErr(e.response?.data?.detail || '비교 실패')
    } finally {
      setLoading(false)
    }
  }

  // 정규화: 각 종목의 첫 가격을 100으로
  const chartData = React.useMemo(() => {
    if (!data?.series || data.series.length === 0) return []
    // 공통 timestamp만 사용
    const tsMaps = data.series.map(s => Object.fromEntries(s.series))
    const allTs = new Set()
    data.series.forEach(s => s.series.forEach(([t]) => allTs.add(t)))
    const sortedTs = [...allTs].sort()
    const firstPrice = {}
    data.series.forEach(s => {
      if (s.series.length > 0) firstPrice[s.ticker] = s.series[0][1]
    })
    return sortedTs.map(t => {
      const point = {
        date: new Date(t * 1000).toLocaleDateString('ko-KR',
          { month: '2-digit', day: '2-digit' }),
      }
      for (const s of data.series) {
        const price = tsMaps[data.series.indexOf(s)][t]
        const base = firstPrice[s.ticker]
        if (price != null && base > 0) {
          point[s.ticker] = +(price / base * 100).toFixed(2)
        }
      }
      return point
    })
  }, [data])

  // 각 종목의 변동률
  const summaries = React.useMemo(() => {
    if (!data?.series) return []
    return data.series.map(s => {
      if (s.series.length < 2) return { ticker: s.ticker, change: 0 }
      const first = s.series[0][1]
      const last = s.series[s.series.length - 1][1]
      return {
        ticker: s.ticker,
        first, last,
        change: ((last - first) / first * 100),
      }
    })
  }, [data])

  return (
    <div className="tt-card" style={{ marginBottom: 12 }}>
      <div className="tt-card-header">
        <div>
          <div className="tt-card-title">
            <span className="emoji-mute" style={{ marginRight: 6 }}>📊</span>
            차트 비교
          </div>
          <div className="tt-card-sub">
            2~6종목을 동일 시작점(=100)으로 정규화하여 수익률 비교
          </div>
        </div>
      </div>

      {/* 선택된 종목 칩 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0' }}>
        {selected.map((s, i) => (
          <motion.div key={s.ticker}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 9px', borderRadius: 4,
              background: `${COLORS[i]}22`,
              border: `1px solid ${COLORS[i]}66`,
              fontSize: 11, fontWeight: 700, color: COLORS[i],
            }}>
            <LogoCircle ticker={s.ticker} size={14} />
            <span>{s.ticker}</span>
            <button onClick={() => removeStock(s.ticker)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: COLORS[i], fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </motion.div>
        ))}
        {selected.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
            아래 검색창에서 비교할 종목을 추가하세요 (예: AAPL, NVDA, TSLA)
          </div>
        )}
      </div>

      {/* 검색창 */}
      {selected.length < 6 && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input ref={inputRef} className="input"
            placeholder="종목 검색 (티커 또는 종목명)"
            value={q}
            onChange={e => { setQ(e.target.value); setShowDrop(e.target.value.length >= 1) }}
            onFocus={() => q.length >= 1 && setShowDrop(true)} />
          {showDrop && searchResults.length > 0 && (
            <div ref={dropRef} style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: 'var(--clr-surface)',
              border: '1px solid var(--clr-border-md)', borderRadius: 4,
              boxShadow: '0 8px 24px rgba(15,23,42,.12)', zIndex: 50,
              maxHeight: 260, overflowY: 'auto',
            }}>
              {searchResults.slice(0, 8).map(r => (
                <div key={r.symbol}
                  onMouseDown={e => { e.preventDefault(); addStock(r) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderBottom: '1px solid var(--clr-border)',
                    cursor: 'pointer' }}>
                  <LogoCircle ticker={r.symbol} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12,
                      color: 'var(--clr-text-strong)' }}>{r.symbol}</div>
                    <div style={{ color: 'var(--clr-text-muted)', fontSize: 10.5,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' }}>{r.shortname}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 기간 + 실행 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <div className="seg-ctrl" style={{ flex: 1 }}>
          {['1mo','3mo','6mo','1y','2y','5y'].map(p => (
            <button key={p} className={`seg-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
              style={{ fontSize: 11 }}>
              {p.replace('mo','M').replace('y','Y')}
            </button>
          ))}
        </div>
        <button onClick={runCompare} disabled={loading || selected.length < 2}
          style={{
            padding: '8px 16px', borderRadius: 8,
            background: 'linear-gradient(135deg, var(--clr-info) 0%, var(--clr-ai) 100%)',
            color: '#fff', border: 'none', fontSize: 12, fontWeight: 800,
            cursor: (loading || selected.length < 2) ? 'not-allowed' : 'pointer',
            opacity: (loading || selected.length < 2) ? 0.5 : 1,
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
          {loading ? '비교 중…' : '비교'}
        </button>
      </div>

      {err && (
        <div style={{ padding: 8, fontSize: 11, borderRadius: 8,
          background: 'var(--clr-neg-bg-soft)', color: 'var(--clr-neg-dark)' }}>{err}</div>
      )}

      <AnimatePresence>
        {chartData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}>
            {/* 차트 */}
            <div style={{ background: 'var(--clr-bg)', borderRadius: 4,
              padding: 8, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94A3B8' }}
                    interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} width={42}
                    domain={['auto', 'auto']}
                    tickFormatter={v => v.toFixed(0)} />
                  <Tooltip
                    formatter={(v, name) => [`${v}`, name]}
                    contentStyle={{ borderRadius: 8, fontSize: 11,
                      border: '1px solid var(--clr-border-md)',
                      background: 'var(--clr-surface)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={100} stroke="#94A3B8"
                    strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: '시작점 100', position: 'right',
                      fontSize: 9, fill: '#64748B' }} />
                  {selected.map((s, i) => (
                    <Line key={s.ticker} type="monotone" dataKey={s.ticker}
                      stroke={COLORS[i]} strokeWidth={2}
                      dot={false} isAnimationActive={true} animationDuration={500} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 종목별 변동률 요약 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {summaries
                .sort((a, b) => b.change - a.change)
                .map((s, i) => {
                  const idx = selected.findIndex(x => x.ticker === s.ticker)
                  const color = COLORS[idx] || '#64748B'
                  return (
                    <div key={s.ticker} style={{
                      flex: '1 1 100px', padding: '8px 10px',
                      background: 'var(--clr-bg)', borderRadius: 4,
                      border: '1px solid var(--m-outline-variant)',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700,
                        color: 'var(--clr-text-strong)', display: 'flex',
                        alignItems: 'center', gap: 5 }}>
                        <i style={{ width: 8, height: 8, borderRadius: 2,
                          background: color, flexShrink: 0 }} />
                        {s.ticker}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900,
                        color: s.change >= 0 ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)',
                        fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                        {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                      </div>
                    </div>
                  )
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

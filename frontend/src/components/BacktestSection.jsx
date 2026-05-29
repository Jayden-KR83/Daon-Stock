import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import { runBacktest } from '../api'

/**
 * 백테스트 시뮬레이션 — 현재 보유 구성으로 과거 N개월 가치 곡선.
 * AllocationTab에 임베드.
 */
export default function BacktestSection({ allHoldings = [] }) {
  const [months, setMonths] = useState(12)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function run() {
    if (allHoldings.length === 0) { setErr('보유 종목이 없습니다'); return }
    setLoading(true); setErr(''); setData(null)
    try {
      const r = await runBacktest({
        holdings: allHoldings.map(h => ({
          ticker: h.ticker, quantity: h.quantity, account: h.account,
        })),
        months,
      })
      setData(r)
    } catch (e) {
      setErr(e.response?.data?.detail || '백테스트 실패')
    } finally {
      setLoading(false)
    }
  }

  // recharts용 데이터 가공
  const chartData = data?.series?.map(p => ({
    date: new Date(p.ts * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: p.value,
  })) || []
  const startValue = data?.start_value || 0
  const isPositive = (data?.return_pct ?? 0) >= 0

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header" style={{ marginBottom: 6 }}>
        <div>
          <div className="mono-section-title">백테스트 시뮬레이션</div>
          <div className="mono-section-sub ko-keep">
            현재 보유 비중으로 과거 N개월 보유했다면 어떤 수익이었을지
          </div>
        </div>
      </div>

      {/* 기간 선택 */}
      <div className="seg-ctrl" style={{ marginBottom: 10 }}>
        {[
          { v: 3,  label: '3M' },
          { v: 6,  label: '6M' },
          { v: 12, label: '1Y' },
          { v: 24, label: '2Y' },
          { v: 60, label: '5Y' },
        ].map(({ v, label }) => (
          <button key={v}
            className={`seg-btn ${months === v ? 'active' : ''}`}
            onClick={() => setMonths(v)}
            style={{ fontSize: 11 }}>
            {label}
          </button>
        ))}
      </div>

      <button onClick={run} disabled={loading || allHoldings.length === 0}
        style={{
          width: '100%', padding: '10px', borderRadius: 8,
          background: 'linear-gradient(135deg, var(--clr-info) 0%, var(--clr-ai) 100%)',
          color: '#fff', border: 'none', fontSize: 12, fontWeight: 800,
          cursor: (loading || allHoldings.length === 0) ? 'not-allowed' : 'pointer',
          opacity: (loading || allHoldings.length === 0) ? 0.5 : 1,
          fontFamily: 'inherit', letterSpacing: '-.01em',
        }}>
        {loading ? '시뮬레이션 실행 중… (10~30초)' : `${months}개월 시뮬레이션 실행`}
      </button>

      {err && (
        <div style={{ marginTop: 10, padding: 8, borderRadius: 8,
          background: 'var(--clr-neg-bg-soft)', color: 'var(--clr-neg-dark)',
          fontSize: 11, lineHeight: 1.5 }}>{err}</div>
      )}

      <AnimatePresence>
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{ marginTop: 14 }}>
            {/* 핵심 지표 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: 6, marginBottom: 12 }}>
              <Tile label="수익률"
                value={`${data.return_pct >= 0 ? '+' : ''}${data.return_pct}%`}
                color={isPositive ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)'} />
              <Tile label="MDD" value={`-${data.mdd_pct}%`}
                color={data.mdd_pct <= 15 ? 'var(--clr-pos-dark)'
                     : data.mdd_pct <= 25 ? '#D97706' : 'var(--clr-neg-dark)'} />
              <Tile label="변동성" value={`${data.volatility}%`}
                color="var(--clr-text-strong)" />
              <Tile label="샤프"  value={`${data.sharpe}`}
                color={data.sharpe >= 1 ? 'var(--clr-pos-dark)'
                     : data.sharpe >= 0 ? '#D97706' : 'var(--clr-neg-dark)'} />
            </div>

            {/* Area 차트 */}
            <div style={{ background: 'var(--clr-bg)', borderRadius: 10, padding: 8 }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}
                  margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="bt-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isPositive ? '#22C55E' : '#EF4444'} stopOpacity="0.45" />
                      <stop offset="100%" stopColor={isPositive ? '#22C55E' : '#EF4444'} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94A3B8' }}
                    interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} width={56}
                    tickFormatter={v => v >= 1e8 ? `${(v/1e8).toFixed(1)}억`
                                       : v >= 1e4 ? `${(v/1e4).toFixed(0)}만`
                                       : v.toLocaleString()}
                    domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={v => `₩${Math.round(v).toLocaleString()}`}
                    labelFormatter={l => l}
                    contentStyle={{ borderRadius: 8, fontSize: 11,
                      border: '1px solid var(--clr-border-md)' }} />
                  <ReferenceLine y={startValue} stroke="#94A3B8"
                    strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: '시작', position: 'insideTopLeft',
                      fontSize: 9, fill: '#64748B' }} />
                  <Area type="monotone" dataKey="value"
                    stroke={isPositive ? '#16A34A' : '#DC2626'}
                    strokeWidth={2}
                    fill="url(#bt-area)" isAnimationActive={true}
                    animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="ko-keep" style={{ fontSize: 10, color: 'var(--clr-text-muted)',
              textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
              시작 ₩{Math.round(data.start_value).toLocaleString()}
              {' → '}현재 ₩{Math.round(data.end_value).toLocaleString()}
              <span style={{ marginLeft: 6, color: isPositive ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)',
                fontWeight: 700 }}>
                ({isPositive ? '+' : ''}₩{Math.round(data.end_value - data.start_value).toLocaleString()})
              </span>
              <br />
              <span style={{ fontSize: 9.5 }}>
                · {data.data_points}일 데이터 / {data.tickers_used?.length || 0}종목 사용
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Tile({ label, value, color }) {
  // A안: 카드는 무채색, 숫자만 의미색
  return (
    <div style={{ background: 'var(--m-surface)', borderRadius: 6,
      padding: '8px 4px', textAlign: 'center',
      border: '1px solid var(--m-outline-variant)' }}>
      <div style={{ fontSize: 15, fontWeight: 900, color,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em',
        lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--m-text-tertiary)',
        marginTop: 2, fontWeight: 700, letterSpacing: '.05em',
        textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

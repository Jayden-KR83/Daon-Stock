import React, { useState, useEffect, useRef } from 'react'
import { motion, animate } from 'motion/react'
import { getPortfolioHealth } from '../api'

/**
 * Portfolio Health Score — 0-100 종합 점수 + 등급 + 4개 하위 지표 + 약점 코멘트.
 * 비중 탭의 NetWorthChart 다음에 임베드.
 */
export default function HealthScoreCard({ allHoldings = [], prices = {}, usdKrw = 1380 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  // 최초 진입 시 자동 계산 (보유 종목 ≥ 1일 때만)
  const triedRef = useRef(false)

  useEffect(() => {
    if (triedRef.current || allHoldings.length === 0) return
    // prices가 일부라도 로드된 후 시작 (정확도 향상)
    if (Object.keys(prices).length === 0) return
    triedRef.current = true
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHoldings.length, Object.keys(prices).length])

  async function run() {
    setLoading(true); setErr('')
    try {
      const r = await getPortfolioHealth({
        holdings: allHoldings.map(h => ({
          ticker: h.ticker, quantity: h.quantity, avg_price: h.avg_price,
          account: h.account, sector: h.sector,
        })),
        prices,
        usd_krw: usdKrw,
      })
      setData(r)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Health Score 계산 실패')
    } finally {
      setLoading(false)
    }
  }

  if (allHoldings.length === 0) return null

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header">
        <div>
          <div className="mono-section-title">Portfolio Health Score</div>
          <div className="mono-section-sub ko-keep">
            분산도·섹터·변동성·위험조정 수익 종합 100점 평가
          </div>
        </div>
        <button onClick={run} disabled={loading} className="mono-pill"
          style={{ cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? '계산 중…' : '재계산'}
        </button>
      </div>

      {err && (
        <div style={{ padding: 8, fontSize: 11, borderRadius: 8,
          background: 'var(--clr-neg-bg-soft)', color: 'var(--clr-neg-dark)' }}>{err}</div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 30,
          color: 'var(--clr-text-muted)', fontSize: 12 }}>
          종목별 1년 데이터 분석 중… (10~20초)
        </div>
      )}

      {data && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}>
          {/* 게이지 + 우측 등급 범위 */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScoreGauge value={data.overall} grade={data.grade} color={data.grade_color} />
            </div>
            <GradeScale current={data.grade} />
          </div>

          {/* 4개 하위 점수 — 설명 toggleable */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 8, marginTop: 14 }}>
            {Object.entries(data.sub_scores).map(([k, v]) => (
              <SubScoreBar key={k} label={k} value={v}
                isWeakest={k === data.weakest} />
            ))}
          </div>

          {/* 4지표 의미 + 통계 + 코멘트 — 항상 표시 */}
          <details open style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', padding: '8px 12px',
              background: 'var(--clr-bg)', borderRadius: 8,
              fontSize: 11, fontWeight: 800, color: 'var(--clr-text-sub)',
              letterSpacing: '.04em', textTransform: 'uppercase',
              border: '1px solid var(--clr-border-md)' }}>
              📖 4지표 의미 보기
            </summary>
            <div style={{ padding: '10px 12px',
              background: 'var(--clr-bg)', borderRadius: 8,
              marginTop: 6, border: '1px solid var(--clr-border-md)',
              fontSize: 11.5, lineHeight: 1.7 }}>
              {[
                ['분산도', '종목 수 + Herfindahl 지수 → 한 종목·소수에 쏠릴수록 낮음. 5종 이상부터 50점, 10종+ 90점, 20종+ 100점'],
                ['섹터 집중도', '단일 섹터 최대 비중 → 한 섹터에 50%+ 몰리면 위험. 20% 이하 100점, 40% 50점, 80%+ 0점'],
                ['변동성 관리', '1년 평균 MDD(최대 낙폭) → 작을수록 안정적. 0% → 100점, 25% → 50점, 50%+ → 0점'],
                ['위험조정 수익', '평균 샤프지수 → 위험 대비 초과수익. 샤프 1+ → 100점 (우수), 0 → 50점 (보통), -1 이하 → 0점'],
              ].map(([k, desc]) => (
                <div key={k} style={{ marginBottom: 5 }}>
                  <strong style={{ color: 'var(--clr-text-strong)' }}>{k}</strong>
                  <span className="ko-keep" style={{ color: 'var(--clr-text-mid)', marginLeft: 4 }}>
                    — {desc}
                  </span>
                </div>
              ))}
            </div>
          </details>

          {/* 통계 + 코멘트 */}
          <div style={{ marginTop: 10, padding: '10px 12px',
            background: 'var(--clr-bg)', borderRadius: 10,
            border: '1px solid var(--clr-border-md)' }}>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.6 }}>
              {data.stats.holdings_count}종 보유 · 최대 섹터 {data.stats.max_sector_pct}% ·
              평균 MDD -{data.stats.avg_mdd}% · 샤프 {data.stats.avg_sharpe}
            </div>
            <div className="ko-keep" style={{ fontSize: 12,
              color: 'var(--clr-text-strong)', fontWeight: 600,
              marginTop: 6, lineHeight: 1.6 }}>
              💡 {data.comment}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/* 등급 범위 막대 — 현재 등급 강조 표시 */
function GradeScale({ current }) {
  const grades = [
    { g: 'S', min: 85, color: '#16A34A', label: '우수' },
    { g: 'A', min: 70, color: '#22C55E', label: '양호' },
    { g: 'B', min: 55, color: '#F59E0B', label: '보통' },
    { g: 'C', min: 40, color: '#F97316', label: '주의' },
    { g: 'D', min: 0,  color: '#DC2626', label: '취약' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3,
      minWidth: 76, flex: 'none' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--clr-text-muted)',
        letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 2 }}>
        등급 범위
      </div>
      {grades.map(({ g, min, color, label }) => {
        const isCur = g === current
        return (
          <div key={g} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 7px', borderRadius: 6,
            background: isCur ? color : 'transparent',
            border: `1px solid ${isCur ? color : 'var(--clr-border-md)'}`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 900,
              color: isCur ? '#fff' : color, minWidth: 12 }}>{g}</span>
            <span style={{ fontSize: 9, fontWeight: 700,
              color: isCur ? '#fff' : 'var(--clr-text-muted)',
              fontVariantNumeric: 'tabular-nums' }}>
              {min}+
            </span>
            <span style={{ fontSize: 9, color: isCur ? '#fff' : 'var(--clr-text-muted)',
              opacity: isCur ? 0.95 : 0.7, marginLeft: 'auto' }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function ScoreGauge({ value, grade, color }) {
  const [displayVal, setDisplayVal] = useState(0)
  const arcRef = useRef(null)
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.9, ease: [0.22, 0.61, 0.36, 1],
      onUpdate: v => setDisplayVal(Math.round(v)),
    })
    return () => controls.stop()
  }, [value])

  // 반원 게이지 — 0(왼) ~ 100(오른)
  // SVG: viewBox 100 60, 반원 path arc
  const angle = (displayVal / 100) * 180  // 0~180도
  const radians = (180 - angle) * Math.PI / 180
  const x = 50 + 40 * Math.cos(radians)
  const y = 50 - 40 * Math.sin(radians)
  const largeArc = angle > 180 ? 1 : 0

  return (
    <div style={{ position: 'relative', textAlign: 'center', padding: '8px 0 4px' }}>
      <svg viewBox="0 0 100 60" width="100%"
        style={{ maxWidth: 240, display: 'block', margin: '0 auto' }}>
        {/* 배경 반원 */}
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none"
          stroke="var(--clr-border)" strokeWidth="6" strokeLinecap="round" />
        {/* 현재 점수 호 */}
        <path d={`M 10 50 A 40 40 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}`}
          fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          style={{ transition: 'd 0.05s linear' }} />
        {/* 마커 점 */}
        <circle cx={x} cy={y} r="3.5" fill={color}
          stroke="var(--clr-surface)" strokeWidth="1.5" />
      </svg>
      <div style={{ position: 'relative', marginTop: -22 }}>
        <div style={{ fontSize: 36, fontWeight: 900, color,
          lineHeight: 1, letterSpacing: '-.04em',
          fontVariantNumeric: 'tabular-nums' }}>
          {displayVal}
        </div>
        <div style={{ display: 'inline-block', marginTop: 4,
          padding: '2px 14px', borderRadius: 20,
          background: color, color: '#fff',
          fontSize: 12, fontWeight: 900, letterSpacing: '.04em' }}>
          {grade} 등급
        </div>
      </div>
    </div>
  )
}

function SubScoreBar({ label, value, isWeakest }) {
  // A안: 무채색 베이스 + 숫자만 색상 (점수에 따라 emerald/amber/red)
  const valueColor = value >= 70 ? 'var(--m-positive)'
                   : value >= 50 ? '#D97706'
                   : 'var(--m-negative)'
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--m-surface)',
      border: '1px solid var(--m-outline-variant)',
      borderRadius: 8,
      position: 'relative',
    }}>
      {isWeakest && (
        <span style={{ position: 'absolute', top: 6, right: 8,
          fontSize: 8.5, fontWeight: 700, letterSpacing: '.06em',
          color: 'var(--m-text-tertiary)', textTransform: 'uppercase' }}>
          약점
        </span>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700,
          color: 'var(--m-text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 900, color: valueColor,
          fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <div style={{ height: 3, background: 'var(--m-outline-variant)',
        borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${value}%`,
          background: 'var(--m-text-secondary)',
          opacity: 0.85,
          borderRadius: 2, transition: 'width .8s ease-out',
        }} />
      </div>
    </div>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import { motion, animate } from 'motion/react'
import { getPortfolioHealth } from '../api'

/* 최약점 지표별 — S 등급(85+)으로 끌어올리기 위한 구체 액션 제안.
   sub_scores 키와 동일한 라벨을 키로 사용. */
const S_GRADE_TIPS = {
  '분산도': '보유 종목을 10종 이상으로 늘리고 한 종목 비중이 20%를 넘지 않게 분산하면 분산도 점수가 크게 오릅니다.',
  '섹터 집중도': '한 섹터 비중을 40% 이하로 낮추세요 — 쏠린 섹터 일부를 정리하고 다른 섹터(헬스케어·필수소비재 등)를 더하면 개선됩니다.',
  '변동성 관리': '낙폭(MDD)이 큰 고변동 종목 비중을 줄이고 배당주·채권형 ETF 같은 방어 자산을 섞으면 안정성 점수가 올라갑니다.',
  '위험조정 수익': '샤프지수가 낮은 종목을 점검하세요 — 변동성 대비 수익이 부진한 종목을 효율 높은 종목으로 교체하면 개선됩니다.',
}

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
          account: h.account, sector: h.sector, manual_price: h.manual_price || 0,
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

          {/* 종합 평가 — 코멘트 + 개선 포인트 + 핵심 통계 통합 (간결) */}
          <div style={{ marginTop: 10, padding: '10px 12px',
            background: 'var(--clr-bg)', borderRadius: 4,
            border: '1px solid var(--clr-border-md)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--clr-text-sub)',
              letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>
              종합 평가
            </div>
            <div className="ko-keep" style={{ fontSize: 12,
              color: 'var(--clr-text-strong)', fontWeight: 600, lineHeight: 1.6 }}>
              {data.comment}
            </div>
            {data.grade !== 'S' && data.weakest && S_GRADE_TIPS[data.weakest] && (
              <div className="ko-keep" style={{ fontSize: 11.5,
                color: 'var(--m-text-secondary)', lineHeight: 1.6, marginTop: 6 }}>
                <strong style={{ color: 'var(--m-text)' }}>개선 포인트 「{data.weakest}」</strong>
                {' '}— {S_GRADE_TIPS[data.weakest]}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 6,
              fontVariantNumeric: 'tabular-nums' }}>
              {data.stats.holdings_count}종 · 최대섹터 {data.stats.max_sector_pct}% ·
              MDD -{data.stats.avg_mdd}% · 샤프 {data.stats.avg_sharpe}
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
          padding: '2px 14px', borderRadius: 4,
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
    }}>
      {/* 라벨 + (약점 배지) 좌측 묶음 · 값은 우측 — 배지가 값과 겹치지 않도록 flow 안에 배치 */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
          minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700,
            color: 'var(--m-text-secondary)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {isWeakest && (
            <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800,
              letterSpacing: '.06em', textTransform: 'uppercase',
              color: 'var(--m-negative)', border: '1px solid var(--m-negative)',
              borderRadius: 3, padding: '0 4px', lineHeight: 1.6 }}>
              약점
            </span>
          )}
        </span>
        <span style={{ fontSize: 16, fontWeight: 900, color: valueColor,
          fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{value}</span>
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

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { getPortfolioAlerts } from '../api'
import { displayName, isKrTicker } from '../utils/displayName'

/**
 * 룰 기반 리밸런싱 경고 — A안 무채색, rule별 그룹핑, sev-dot 제거.
 * 동일 메시지 반복 없이 group header + 한 줄 row로 압축.
 */
export default function AlertsCard({ allHoldings = [], prices = {}, usdKrw = 1380 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [thresholds, setThresholds] = useState({
    ticker_max: 30, sector_max: 50, loss_max: -20,
  })
  const [showSettings, setShowSettings] = useState(false)

  async function run() {
    if (allHoldings.length === 0) return
    setLoading(true); setErr('')
    try {
      const r = await getPortfolioAlerts({
        holdings: allHoldings.map(h => ({
          ticker: h.ticker, quantity: h.quantity, avg_price: h.avg_price,
          account: h.account, sector: h.sector, name: h.name,
        })),
        prices, usd_krw: usdKrw,
        target_max_ticker_pct: thresholds.ticker_max,
        target_max_sector_pct: thresholds.sector_max,
        target_max_loss_pct:   thresholds.loss_max,
      })
      setData(r)
    } catch (e) {
      setErr(e.response?.data?.detail || '경고 분석 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (allHoldings.length === 0) return
    if (Object.keys(prices).length === 0) return
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHoldings.length, Object.keys(prices).length, thresholds])

  if (allHoldings.length === 0) return null

  const summary = data?.summary || { critical: 0, high: 0, med: 0, total: 0 }
  const grouped = groupByRule(data?.alerts || [])
  // ticker → name 맵 — 경고에 한국 종목 코드(005930) 대신 종목명 표시용
  const nameByTicker = React.useMemo(() => {
    const m = {}
    for (const h of allHoldings) {
      if (h.ticker) m[String(h.ticker).toUpperCase()] = h.name
    }
    return m
  }, [allHoldings])

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header">
        <div>
          <div className="mono-section-title is-accent">자동 리밸런싱 경고</div>
          <div className="mono-section-sub ko-keep">
            룰 엔진 — 단일 종목·섹터 집중·큰 손실·중복 노출 자동 감지
          </div>
        </div>
        <button onClick={() => setShowSettings(s => !s)} className="mono-pill"
          style={{ cursor: 'pointer',
            color: showSettings ? 'var(--m-text)' : 'var(--m-text-tertiary)' }}>
          임계값 {showSettings ? '닫기' : '설정'}
        </button>
      </div>

      {/* 요약 라인 — 텍스트 카운트만 (점 X) */}
      {data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '2px 0 10px', fontSize: 11.5, color: 'var(--m-text-secondary)' }}>
          {summary.total === 0 ? (
            <span style={{ color: 'var(--m-positive)', fontWeight: 800 }}>
              현재 안전 — 모든 룰 통과
            </span>
          ) : (
            <>
              <SummaryItem label="심각" n={summary.critical} klass="num-neg" />
              <SummaryItem label="주의" n={summary.high}     klass="num-chip is-neutral"
                color="#B45309" />
              <SummaryItem label="관찰" n={summary.med}      klass="num-neutral" />
            </>
          )}
        </div>
      )}

      {/* 임계값 설정 */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ padding: 12, background: 'var(--m-surface-variant)',
              borderRadius: 2, border: '1px solid var(--m-outline-variant)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: 10, fontSize: 10.5 }}>
                <ThresholdInput label="단일 종목 최대"
                  value={thresholds.ticker_max} suffix="%" min={10} max={80} step={5}
                  onChange={v => setThresholds(p => ({ ...p, ticker_max: v }))} />
                <ThresholdInput label="단일 섹터 최대"
                  value={thresholds.sector_max} suffix="%" min={20} max={90} step={5}
                  onChange={v => setThresholds(p => ({ ...p, sector_max: v }))} />
                <ThresholdInput label="손실 경고 임계"
                  value={thresholds.loss_max} suffix="%" min={-50} max={-5} step={5}
                  onChange={v => setThresholds(p => ({ ...p, loss_max: v }))} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 20,
          fontSize: 12, color: 'var(--m-text-tertiary)' }}>분석 중…</div>
      )}

      {err && (
        <div style={{ padding: 8, fontSize: 11, borderRadius: 2,
          border: '1px solid var(--m-negative)', color: 'var(--m-negative)' }}>{err}</div>
      )}

      {data && data.alerts.length === 0 && !loading && (
        <div style={{ padding: '14px 12px',
          border: '1px dashed var(--m-outline-variant)', borderRadius: 2,
          fontSize: 12, color: 'var(--m-text-secondary)', textAlign: 'center' }}>
          현재 임계값 기준 경고 없음 — 모든 종목·섹터 비중 균형, 큰 손실 종목 없음
        </div>
      )}

      {/* 그룹별 표시 */}
      {data && data.alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {grouped.map(g => (
            <RuleGroup key={g.rule} group={g} nameByTicker={nameByTicker} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryItem({ label, n, klass, color }) {
  if (!n) return null
  return (
    <span>{label}{' '}
      <strong className={klass} style={color ? { color } : undefined}>{n}</strong>
    </span>
  )
}

/* 룰별 그룹: 같은 종류 메시지를 한 헤더로 묶고 inline list로 압축 */
function RuleGroup({ group, nameByTicker = {} }) {
  const max = group.alerts.reduce((m, a) =>
    Math.max(m, Math.abs(a.value || 0)), 0)
  const topSev = group.alerts[0]?.severity || 'med'
  const sevClass = `is-${topSev}`

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--m-outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8,
          minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)' }}>
            {group.title}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)',
            fontWeight: 600 }}>{group.alerts.length}건</span>
        </div>
        <span className={`sev-label ${sevClass}`}>{group.severityLabel}</span>
      </div>

      {/* compact line — 종목/섹터 + 값 inline */}
      <div className="ko-keep" style={{ fontSize: 11.5,
        color: 'var(--m-text-secondary)', lineHeight: 1.65 }}>
        {group.alerts.map((a, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: 'var(--m-text-tertiary)', margin: '0 6px' }}>·</span>}
            <CompactItem alert={a} ruleKind={group.rule} nameByTicker={nameByTicker} />
          </React.Fragment>
        ))}
      </div>

      {/* group hint — 한 줄, 음영 없음 */}
      <div className="ko-keep" style={{ fontSize: 10.5,
        color: 'var(--m-text-tertiary)', marginTop: 4, lineHeight: 1.55 }}>
        {group.hint}
      </div>
    </div>
  )
}

function CompactItem({ alert, ruleKind, nameByTicker = {} }) {
  const tkr = alert.ticker
  // 한국 종목은 코드(005930) 대신 종목명 — 경고 메시지 가독성. 미국은 티커 그대로.
  const name = tkr
    ? displayName(tkr, alert.name || nameByTicker[String(tkr).toUpperCase()])
    : (alert.sector
       || alert.title?.split(/[—-]/)[0]?.trim()
       || alert.title)
  const showCode = tkr && isKrTicker(tkr) && name !== tkr
  const v = alert.value
  // value 표시 형식 (룰별)
  let valueText = null
  let chipClass = 'num-chip is-neutral'
  if (ruleKind === 'ticker_concentration' || ruleKind === 'sector_concentration') {
    valueText = v != null ? `${v.toFixed(1)}%` : null
    chipClass = 'num-chip is-neutral'
  } else if (ruleKind === 'large_loss') {
    valueText = v != null ? `${v.toFixed(1)}%` : null
    chipClass = 'num-chip is-neg'
  } else if (ruleKind === 'too_few_holdings') {
    valueText = v != null ? `${v}종` : null
    chipClass = 'num-chip is-neg'
  }
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 700, color: 'var(--m-text)' }}>{name}</span>
      {showCode && (
        <span style={{ fontSize: 9.5, fontWeight: 600,
          color: 'var(--m-text-tertiary)', marginLeft: 3 }}>{tkr}</span>
      )}
      {valueText && (
        <span className={chipClass} style={{ marginLeft: 4 }}>
          {valueText}
        </span>
      )}
    </span>
  )
}

/* 동일 rule끼리 묶고, 그룹 헤더 메타데이터 부여 */
function groupByRule(alerts) {
  const meta = {
    large_loss: {
      title: '큰 손실 종목',
      hint: '평단가 대비 손실 임계 초과 — 손절·추가매수·관망 전략 점검',
      severityLabel: '심각',
    },
    ticker_concentration: {
      title: '단일 종목 과집중',
      hint: '단일 종목 권장 한도 초과 — 일부 정리 또는 다른 종목 확대',
      severityLabel: '주의',
    },
    sector_concentration: {
      title: '단일 섹터 과집중',
      hint: '단일 섹터 권장 한도 초과 — 타 섹터 분산 권장',
      severityLabel: '주의',
    },
    overlap_exposure: {
      title: '중복 노출',
      hint: 'ETF에 이미 포함된 개별 종목 동시 보유 — 비중 중복 가능',
      severityLabel: '관찰',
    },
    too_few_holdings: {
      title: '극단적 미분산',
      hint: '분산 효과를 위해 최소 5종목 이상 보유 권장',
      severityLabel: '주의',
    },
  }
  const order = ['large_loss', 'ticker_concentration', 'sector_concentration',
                 'overlap_exposure', 'too_few_holdings']
  const groups = {}
  for (const a of alerts) {
    if (!groups[a.rule]) groups[a.rule] = { rule: a.rule, alerts: [], ...(meta[a.rule] || {
      title: a.rule, hint: '', severityLabel: a.severity,
    }) }
    groups[a.rule].alerts.push(a)
  }
  return order.filter(k => groups[k])
    .map(k => groups[k])
    .concat(Object.values(groups).filter(g => !order.includes(g.rule)))
}

function ThresholdInput({ label, value, suffix, min, max, step, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700,
        color: 'var(--m-text-tertiary)', marginBottom: 4,
        letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input type="number" value={value}
          onChange={e => onChange(Number(e.target.value))}
          min={min} max={max} step={step}
          className="input" style={{ paddingRight: 24, borderRadius: 2,
            fontFamily: 'inherit', fontSize: 12,
            fontVariantNumeric: 'tabular-nums', fontWeight: 700 }} />
        <span style={{ position: 'absolute', right: 8, top: '50%',
          transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700,
          color: 'var(--m-text-tertiary)', pointerEvents: 'none' }}>{suffix}</span>
      </div>
    </div>
  )
}

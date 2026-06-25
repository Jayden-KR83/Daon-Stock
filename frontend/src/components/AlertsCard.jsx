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
    // 시세가 아직 안 실려도 실행 — 백엔드가 평단가로 대체 계산하므로 본문이 공백으로 남지 않음.
    // 시세가 도착하면 deps(prices 키 수) 변화로 자동 재실행되어 정확한 비중으로 갱신.
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
            룰 엔진 — 단일 종목·섹터 집중·큰 손실·중복 노출·고위험 위성 한도 자동 감지
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

/* 심각도 → 배지/제목 글자색. design.md R1: 좌측 색띠 금지 → 의미는 글자색·배지로만. */
const SEV_META = {
  critical: { badge: 'CRITICAL', color: 'var(--m-negative)', bg: 'rgba(220,38,38,.10)' },
  high:     { badge: 'HIGH',     color: 'var(--m-negative)', bg: 'rgba(220,38,38,.08)' },
  med:      { badge: 'MEDIUM',   color: '#D97706',           bg: 'rgba(217,119,6,.12)' },
  low:      { badge: '관찰',     color: 'var(--m-text-tertiary)', bg: 'var(--m-surface-variant)' },
}

/* 리스크 진단 카드 — 정량 경고(제목·종목 값) + 정성 진단(하단 문장) 결합.
   design.md 준수: 4면 hairline 직사각 카드, 좌측 색띠 없음, 심각도=배지+제목 글자색, ▪ 사각 마커. */
function RuleGroup({ group, nameByTicker = {} }) {
  const topSev = group.alerts[0]?.severity || 'med'
  const sev = SEV_META[topSev] || SEV_META.med
  // 큰 손실: 손실 큰 순(value 오름차순=가장 음수 먼저), 그 외: 값 내림차순
  const rows = [...group.alerts].sort((a, b) =>
    group.rule === 'large_loss' ? (a.value || 0) - (b.value || 0)
                                : (b.value || 0) - (a.value || 0))

  return (
    <div style={{ border: '1px solid var(--m-outline-variant)', borderRadius: 4,
      background: 'var(--m-surface)', padding: '12px 14px', marginBottom: 8 }}>
      {/* 배지(좌·심각도) + 카테고리(우) — 좌측 색띠 대신 배지로 위험도 표현 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em',
          color: sev.color, background: sev.bg, padding: '2px 7px' }}>{sev.badge}</span>
        <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>{group.category || ''}</span>
      </div>

      {/* ▪ 제목 — 의미는 제목 글자색으로 (design.md) */}
      <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ flexShrink: 0, width: 5, height: 5, background: sev.color,
          alignSelf: 'flex-start', marginTop: 6 }} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: sev.color, lineHeight: 1.5 }}>
          {group.title}
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--m-text-tertiary)',
            marginLeft: 6 }}>{group.alerts.length}건</span>
        </h3>
      </div>

      {/* 정량 — 종목·값 행 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {group.rule === 'overlap_exposure'
          ? rows.map((a, i) => <OverlapRows key={i} alert={a} nameByTicker={nameByTicker} />)
          : rows.map((a, i) => <AlertRow key={i} alert={a} ruleKind={group.rule} nameByTicker={nameByTicker} />)}
      </div>

      {/* 정성 진단 — 본문은 검정(--m-text) 기본 (design.md: 읽는 문장에 회색 금지) */}
      <div className="ko-keep" style={{ fontSize: 12, color: 'var(--m-text)',
        lineHeight: 1.6, marginTop: 8 }}>
        {group.hint}
      </div>
    </div>
  )
}

/* 종목명 한 행 — 좌: 종목명(+KR코드), 우: 값(우정렬) */
function AlertRow({ alert, ruleKind, nameByTicker = {} }) {
  const tkr = alert.ticker
  const name = tkr
    ? displayName(tkr, alert.name || nameByTicker[String(tkr).toUpperCase()])
    : (alert.sector || alert.title?.split(/[—-]/)[0]?.trim() || alert.title)
  const showCode = tkr && isKrTicker(tkr) && name !== tkr
  const v = alert.value
  let valueText = null, neg = false
  if (ruleKind === 'large_loss') { valueText = v != null ? `${v.toFixed(1)}%` : null; neg = true }
  else if (ruleKind === 'too_few_holdings') { valueText = v != null ? `${v}종` : null; neg = true }
  else if (v != null) valueText = `${v.toFixed(1)}%`
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 10, padding: '4px 0', borderTop: '1px dotted var(--m-outline-variant)' }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: 'var(--m-text)' }}>
        {name}
        {showCode && <span style={{ fontSize: 9.5, fontWeight: 600,
          color: 'var(--m-text-tertiary)', marginLeft: 4 }}>{tkr}</span>}
      </span>
      {valueText && (
        <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800,
          color: neg ? 'var(--m-negative)' : 'var(--m-text)',
          fontVariantNumeric: 'tabular-nums' }}>{valueText}</span>
      )}
    </div>
  )
}

/* 중복 노출 — 섹터/ETF + 겹치는 개별 종목(종목명 + 비중%) 행 */
function OverlapRows({ alert, nameByTicker = {} }) {
  const overlaps = alert.overlaps || []
  return (
    <div style={{ padding: '4px 0', borderTop: '1px dotted var(--m-outline-variant)' }}>
      <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-secondary)', marginBottom: 2 }}>
        섹터 <strong style={{ color: 'var(--m-text)' }}>{alert.sector}</strong>
        {alert.etfs?.length > 0 && <span> · ETF {alert.etfs.join(', ')}</span>}
      </div>
      {overlaps.map((o, i) => {
        const nm = displayName(o.ticker, o.name || nameByTicker[String(o.ticker).toUpperCase()])
        const showCode = isKrTicker(o.ticker) && nm !== o.ticker
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline',
            justifyContent: 'space-between', gap: 10, padding: '2px 0 2px 10px' }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', fontSize: 11.5, color: 'var(--m-text)' }}>
              {nm}
              {showCode && <span style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)',
                marginLeft: 4 }}>{o.ticker}</span>}
            </span>
            <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700,
              color: 'var(--m-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {o.value}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* 동일 rule끼리 묶고, 그룹 헤더 메타데이터 부여 */
function groupByRule(alerts) {
  const meta = {
    large_loss: {
      title: '큰 손실 종목', category: '손실 누적 진단',
      hint: '평단가 대비 손실 임계 초과 — 손절·추가매수·관망 전략 점검',
      severityLabel: '심각',
    },
    ticker_concentration: {
      title: '단일 종목 과집중', category: '종목 집중도',
      hint: '단일 종목 권장 한도 초과 — 일부 정리 또는 다른 종목 확대',
      severityLabel: '주의',
    },
    sector_concentration: {
      title: '단일 섹터 과집중', category: '섹터 노출도',
      hint: '단일 섹터 권장 한도 초과 — 타 섹터 분산 권장',
      severityLabel: '주의',
    },
    overlap_exposure: {
      title: '중복 노출', category: '동조화 리스크',
      hint: 'ETF에 이미 포함된 개별 종목 동시 보유 — 비중 중복 가능',
      severityLabel: '관찰',
    },
    too_few_holdings: {
      title: '극단적 미분산', category: '분산도',
      hint: '분산 효과를 위해 최소 5종목 이상 보유 권장',
      severityLabel: '주의',
    },
    satellite_ceiling: {
      title: '고위험 위성(저점발굴) 한도 초과', category: '위성 자산 비중',
      hint: '적자 단계 AI·바이오 혁신주(저점발굴)는 변동성이 매우 커 전체 자산의 5% 이내 소액 분산이 원칙입니다. 비중 축소를 검토하세요.',
      severityLabel: '주의',
    },
  }
  const order = ['large_loss', 'ticker_concentration', 'sector_concentration',
                 'overlap_exposure', 'satellite_ceiling', 'too_few_holdings']
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

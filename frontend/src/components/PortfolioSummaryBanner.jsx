import React from 'react'
import { useStore } from '../store'

/**
 * 비중 탭 진입 즉시 보여주는 헤더 — A안 무채색 + 인포그래픽.
 * 좌측: 평가액(큰 글자, 다른 모든 텍스트보다 압도적), 손익은 우측 작은 글자.
 * 중앙: Top 비중 mini stacked bar (한눈에 집중도 파악).
 * 우측: 보유/섹터/계좌 metric stack.
 */
export default function PortfolioSummaryBanner({ allHoldings, prices, usdKrw }) {
  const privacyMode = useStore(s => s.privacyMode)

  const { totalKrw, totalPnl, totalPnlPct, sectorCount, accountCount, topStack } = React.useMemo(() => {
    let total = 0, cost = 0
    const sectors = new Set(), accounts = new Set()
    const perStock = []
    for (const h of allHoldings) {
      const tkr = h.ticker
      const isUs = !/^A?\d{6}$/.test(tkr)
      const cur = prices?.[tkr]?.current_price ?? h.avg_price
      const mul = isUs ? usdKrw : 1
      const v   = h.quantity * cur * mul
      total += v
      cost  += h.quantity * h.avg_price * mul
      sectors.add(h.sector || '기타')
      accounts.add(h.account)
      perStock.push({ ticker: tkr, name: h.name || tkr, value: v })
    }
    perStock.sort((a, b) => b.value - a.value)
    const pnl = total - cost
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0

    // Top 5 + 기타
    const top = perStock.slice(0, 5)
    const restVal = perStock.slice(5).reduce((s, x) => s + x.value, 0)
    const stack = top.map(s => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }))
    if (restVal > 0) stack.push({ ticker: 'REST', name: '기타', value: restVal, pct: (restVal / total) * 100 })

    return {
      totalKrw: total, totalPnl: pnl, totalPnlPct: pnlPct,
      sectorCount: sectors.size, accountCount: accounts.size,
      topStack: stack,
    }
  }, [allHoldings, prices, usdKrw])

  const isPositive = totalPnl >= 0
  const fmtKrw = (v) => {
    if (privacyMode) return '••••••'
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)}억`
    if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`
    return `₩${Math.round(v).toLocaleString()}`
  }
  const fmtPct = (v) => privacyMode ? '••.•%' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

  // 한 줄 다이내믹 헤드라인 (정량 기반)
  const headline = React.useMemo(() => {
    if (allHoldings.length === 0) return '보유 종목이 없습니다'
    if (allHoldings.length <= 2) return '극단적 미분산 — 추가 종목 권장'
    if (sectorCount === 1) return '단일 섹터 집중 — 분산 권장'
    const topPct = topStack[0]?.pct || 0
    if (topPct >= 40) return `${topStack[0].name} 비중 ${topPct.toFixed(0)}% — 집중도 높음`
    if (allHoldings.length >= 10 && sectorCount >= 4) return '균형 잡힌 포트폴리오 — 다각화 양호'
    if (isPositive && Math.abs(totalPnlPct) >= 10) return `평가액 +${totalPnlPct.toFixed(1)}% — 좋은 흐름`
    if (!isPositive && Math.abs(totalPnlPct) >= 10) return `평가액 ${totalPnlPct.toFixed(1)}% — 손실 점검 필요`
    return `${allHoldings.length}종 · ${sectorCount}개 섹터 · ${accountCount}개 계좌 분산`
  }, [allHoldings.length, sectorCount, isPositive, totalPnlPct, topStack, accountCount])

  // 무채색 grey scale (다크/라이트 호환)
  const greyScale = ['#0F172A','#334155','#64748B','#94A3B8','#CBD5E1','#E2E8F0']

  return (
    <div style={{
      background: 'var(--m-surface)',
      border: '1px solid var(--m-outline-variant)',
      borderRadius: 4,
      padding: '16px 18px 14px',
      marginBottom: 14,
    }}>
      {/* 상단 — 평가액 + 손익(작게) */}
      <div style={{ display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="m3-label" style={{ marginBottom: 4 }}>총 평가액</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--m-text)',
              letterSpacing: '-.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {fmtKrw(totalKrw)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800,
              color: isPositive ? 'var(--m-positive)' : 'var(--m-negative)',
              fontVariantNumeric: 'tabular-nums' }}>
              {isPositive ? '▲' : '▼'} {fmtKrw(Math.abs(totalPnl))} · {fmtPct(totalPnlPct)}
            </span>
          </div>
        </div>
        {/* 우측 metric stack — 3 inline blocks */}
        <div style={{ display: 'flex', gap: 18, fontVariantNumeric: 'tabular-nums' }}>
          <Stat label="보유" value={`${allHoldings.length}`} />
          <Stat label="섹터" value={`${sectorCount}`} />
          <Stat label="계좌" value={`${accountCount}`} />
        </div>
      </div>

      {/* 중앙 인포그래픽 — Top 비중 stacked bar */}
      {topStack.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 5 }}>
            <span className="m3-label" style={{ fontSize: 10 }}>비중 Top {Math.min(5, topStack.length)}</span>
            <span style={{ fontSize: 10, color: 'var(--m-text-tertiary)',
              fontVariantNumeric: 'tabular-nums' }}>
              {topStack[0] && `${topStack[0].name.slice(0, 10)} ${topStack[0].pct.toFixed(0)}%`}
            </span>
          </div>
          <div className="mini-stack" title="비중 분포">
            {topStack.map((s, i) => (
              <span key={s.ticker}
                title={`${s.name} ${s.pct.toFixed(1)}%`}
                style={{ width: `${s.pct}%`, background: greyScale[i] || '#E2E8F0' }} />
            ))}
          </div>
        </div>
      )}

      {/* 하단 — 정량 인사이트 한 줄 (배경 없음, 좌측 색띠로만 위계) */}
      <div style={{
        borderLeft: `2px solid ${isPositive ? 'var(--m-positive)' : 'var(--m-text-secondary)'}`,
        paddingLeft: 10, paddingTop: 2, paddingBottom: 2,
      }}>
        <span className="ko-keep" style={{ fontSize: 12.5, fontWeight: 700,
          color: 'var(--m-text)' }}>{headline}</span>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 28 }}>
      <div style={{ fontSize: 9, color: 'var(--m-text-tertiary)',
        fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--m-text)',
        marginTop: 1 }}>{value}</div>
    </div>
  )
}

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCompassSignals } from '../api'
import { effPrice } from '../utils/effPrice'

/**
 * 투자 나침반 (설계안 A) — 보유 종목 연동 "오늘의 한 줄".
 *
 * 왜 이 형태인가:
 * - 서버는 '판단이 바뀐 종목'만 신호로 남긴다(compass_signals). 매일 갱신되는 요약을
 *   전부 띄우면 그게 곧 정보 과부하다. 뒤집힌 판단만이 행동을 바꾼다.
 * - '내 포트폴리오에 무슨 의미인가'는 여기서 붙인다 — 보유·시세·환율을 이미 쥔 쪽이
 *   프론트라서, 비중 계산을 서버로 옮기면 같은 계산이 두 곳에 생긴다.
 * - 한 번에 **하나만**. 읽고 닫으면 그 신호는 다시 뜨지 않는다(localStorage).
 * - 출처 링크가 없는 신호는 서버가 애초에 기록하지 않는다.
 */
const DISMISS_KEY = 'daon.compass.dismissed'
// 판단의 무게 — 같은 날 여러 신호가 오면 행동을 요구하는 것부터 보여준다
const RECO_WEIGHT = { '매도': 3, '매수': 2, '보유': 1 }

function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')) }
  catch { return new Set() }
}
function saveDismissed(set) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set].slice(-100))) }
  catch { /* 사파리 프라이빗 모드 등 — 닫기가 안 되는 것뿐이라 무시 */ }
}

export default function CompassBanner({ allHoldings, prices, usdKrw }) {
  const [dismissed, setDismissed] = React.useState(loadDismissed)
  const { data } = useQuery({
    queryKey: ['compass-signals'],
    queryFn: () => getCompassSignals(3),
    staleTime: 10 * 60_000,
  })

  const pick = React.useMemo(() => {
    const signals = data?.signals || []
    if (!signals.length || !allHoldings?.length) return null

    // 보유 비중 — A접두(A005930)와 무접두(005930)는 같은 종목이다
    const norm = t => {
      const s = String(t || '').toUpperCase()
      return /^A\d[0-9A-Z]{5}$/.test(s) ? s.slice(1) : s
    }
    let total = 0
    const valueByStock = new Map()
    for (const h of allHoldings) {
      const isUs = !/^A?\d[0-9A-Z]{5}$/.test(String(h.ticker))
      const v = h.quantity * effPrice(h, prices) * (isUs ? usdKrw : 1)
      total += v
      const k = norm(h.ticker)
      valueByStock.set(k, (valueByStock.get(k) || 0) + v)
    }

    const held = signals
      .map(s => ({ ...s, _key: `${s.ticker}@${s.changed_at}`, _value: valueByStock.get(norm(s.ticker)) }))
      .filter(s => s._value > 0 && !dismissed.has(s._key))
      .map(s => ({ ...s, _pct: total > 0 ? (s._value / total) * 100 : 0 }))

    if (!held.length) return null
    held.sort((a, b) =>
      (RECO_WEIGHT[b.new_reco] || 0) - (RECO_WEIGHT[a.new_reco] || 0) || b._pct - a._pct)
    return held[0]
  }, [data, allHoldings, prices, usdKrw, dismissed])

  if (!pick) return null

  const tone = pick.new_reco === '매도' ? 'var(--m-negative)'
             : pick.new_reco === '매수' ? 'var(--m-positive)'
             : 'var(--m-text-secondary)'

  function dismiss() {
    const next = new Set(dismissed); next.add(pick._key)
    setDismissed(next); saveDismissed(next)
  }

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div className="mono-section-title" style={{ color: tone }}>투자 나침반</div>
        <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
          보유 종목 판단 변경
        </span>
        <button type="button" onClick={dismiss} className="btn-secondary"
          style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11 }}>
          읽음
        </button>
      </div>

      <div className="ko-keep" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6,
        color: 'var(--m-text)' }}>
        <strong>{pick.name || pick.ticker}</strong>
        {' '}판단이{' '}
        <span style={{ color: 'var(--m-text-tertiary)' }}>
          {pick.prev_reco || '분석 없음'}
        </span>
        {' → '}
        <strong style={{ color: tone }}>{pick.new_reco}</strong>
        {' '}로 바뀌었습니다.<br />
        내 포트폴리오에서 <strong>{pick._pct.toFixed(1)}%</strong> 비중입니다.
      </div>

      {pick.headline && (
        <div className="ko-keep" style={{ marginTop: 6, fontSize: 12,
          color: 'var(--m-text-secondary)', lineHeight: 1.6 }}>
          {pick.headline}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10.5 }}>
        <a href={pick.source_url} target="_blank" rel="noreferrer"
          style={{ color: 'var(--m-primary)', textDecoration: 'none' }}>
          근거 원문 보기 ↗
        </a>
      </div>
    </div>
  )
}

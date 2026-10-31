import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMidtermRegime } from '../api'

/**
 * 중기 국면 카드 — "지금 어디에 서 있나" + "무엇이 바뀌면 생각을 바꾸나".
 *
 * 오너 결정(2026-10-31): 방향을 단언하지 않는다. 그래서 이 카드에는
 * '전망·예상·우위' 같은 말이 없다. 분류(네 칸)와 조건(가격)만 있다.
 *
 * 규칙·계산 조건·스캔 기준은 **전부 서버가 준 값**을 쓴다. 화면에 손으로 적으면
 * 알림 문구와 어긋나고, 어긋나도 아무도 모른다(🟥 숫자 규약 2번).
 */
const ABOVE = ['상승추세', '반등 시도']

export default function MidtermRegimeCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['midterm-regime'],
    queryFn: getMidtermRegime,
    staleTime: 600_000,
    retry: 0,
  })

  if (isLoading) {
    return (
      <div className="mono-card" style={{ marginBottom: 12, padding: 14 }}>
        <div className="skeleton" style={{ height: 14, width: 140, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 10, width: '100%' }} />
      </div>
    )
  }
  if (isError || !data) return null

  const port = data.portfolio || {}
  const phases = port.phases || {}
  const items = data.items || []
  if (!items.length) return null

  const above = round1((phases['상승추세'] || 0) + (phases['반등 시도'] || 0))
  const below = round1((phases['추세 이탈'] || 0) + (phases['하락추세'] || 0))
  const covered = port.covered_weight_pct ?? 0
  const flip = data.flip
  const ma = data.basis?.trend_ma

  return (
    <div className="mono-card" style={{ marginBottom: 12, padding: '14px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono-section-title" style={{ fontSize: 12.5, fontWeight: 800 }}>
          중기 국면
        </span>
        <span style={{ fontSize: 10, color: 'var(--m-text-tertiary)' }}>
          {ma ? `${ma}일선 기준` : ''} · 예측이 아니라 지금 서 있는 자리
        </span>
      </div>

      {/* 위/아래 두 축 — 금액 가중이다 */}
      <div style={{ display: 'flex', height: 8, borderRadius: 2, overflow: 'hidden',
        marginTop: 10, background: 'var(--m-surface-variant)' }}>
        <div style={{ width: `${above}%`, background: 'var(--clr-pos-dark)' }} />
        <div style={{ width: `${below}%`, background: 'var(--clr-neg-dark)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5,
        fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        <span className="num-pos">{ma}일선 위 {above}%</span>
        <span className="num-neg">아래 {below}%</span>
      </div>
      {covered < 100 && (
        <div className="ko-keep" style={{ fontSize: 10, marginTop: 4,
          color: 'var(--m-text-tertiary)', lineHeight: 1.5 }}>
          평가액의 {covered}%만 판단했습니다 — 나머지는 이력이 짧아 국면을 모릅니다.
        </div>
      )}

      {/* 생각을 바꿀 조건 — 서버가 만든 것을 그대로 쓴다 */}
      {flip && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 2,
          border: '1px solid var(--m-outline-variant)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em',
            color: 'var(--m-text-tertiary)', textTransform: 'uppercase' }}>
            생각을 바꿀 조건
          </div>
          <div className="ko-keep" style={{ fontSize: 11.5, marginTop: 4,
            color: 'var(--m-text)', lineHeight: 1.6 }}>
            {flip.need.map(n => `${n.name} ${fmtLevel(n.ticker, n.level)}`).join(' · ')}
            {flip.direction === 'up' ? ' 회복하면' : ' 이탈하면'}
            {` '${flip.side}' ${flip.side_pct}% 과반이 깨집니다.`}
          </div>
        </div>
      )}

      {/* 종목 — 라벨 폭 고정으로 숫자 시작 x 를 맞춘다 */}
      <div style={{ marginTop: 10, display: 'grid', rowGap: 3 }}>
        {items.slice(0, 8).map(it => {
          const r = it.regime || {}
          const up = ABOVE.includes(r.phase)
          return (
            <div key={it.ticker} style={{
              display: 'grid', gridTemplateColumns: '96px 60px 1fr',
              alignItems: 'center', columnGap: 8, fontSize: 11 }}>
              <span title={it.ticker} style={{ fontWeight: 700, color: 'var(--m-text)',
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' }}>{it.name}</span>
              <span className={r.phase ? (up ? 'num-pos' : 'num-neg') : ''}
                style={{ fontWeight: 800, fontSize: 10.5,
                  color: r.phase ? undefined : 'var(--m-text-tertiary)' }}>
                {r.phase || '—'}
              </span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                color: 'var(--m-text-secondary)', whiteSpace: 'nowrap' }}>
                {r.ma_gap_pct != null
                  ? `${ma}일선 ${r.ma_gap_pct > 0 ? '+' : ''}${r.ma_gap_pct}%`
                  : '이력 부족'}
              </span>
            </div>
          )
        })}
      </div>

      {items.length > 8 && (
        <div style={{ fontSize: 10, color: 'var(--m-text-tertiary)', marginTop: 5 }}>
          비중 상위 8종목만 — 전체 {items.length}종목
        </div>
      )}

      {/* 규칙·기준은 서버가 준 문장 그대로.
          기준을 밝히는 이유: 이 카드는 **일봉 종가**로 재고 보유 탭은 실시간이라
          같은 종목의 숫자가 1~2% 다를 수 있다. 말하지 않으면 둘 중 하나가
          틀린 것처럼 보인다(🟥 숫자 규약 — 분모·기준을 값과 함께 준다). */}
      <div className="ko-keep" style={{ fontSize: 9.5, marginTop: 8, lineHeight: 1.6,
        color: 'var(--m-text-tertiary)', whiteSpace: 'pre-line' }}>
        {[port.phase_rule,
          data.basis?.source && `${data.basis.source} — 보유 탭의 실시간가와 다를 수 있습니다.`]
          .filter(Boolean).join('\n')}
      </div>
    </div>
  )
}

const round1 = (v) => Math.round((v || 0) * 10) / 10

/** 경계 가격 — 조건은 수치여야 나중에 맞았는지 따질 수 있다. */
function fmtLevel(ticker, level) {
  if (level == null) return ''
  const isKr = /^A?\d[0-9A-Z]{5}$/.test(ticker)
  return isKr
    ? `₩${Math.round(level).toLocaleString()}`
    : `$${Number(level).toFixed(2)}`
}

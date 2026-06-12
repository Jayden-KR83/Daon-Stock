import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore } from '../store'
import { getDiscover } from '../api'

/* 신규 종목 발굴 (GARP 스크리닝)
 * 깔때기: universe → 정량 5축 점수 → 랭킹. AI는 종목 탭에서 별도(여기선 링크만).
 * 정직성: 상승 '확률' 단정 금지 — 팩터 백분위 + 데이터 완성도 배지로만 표현.
 * KR은 부채·애널리스트 데이터 미제공 → 해당 축 N/A (0%로 그리지 않음). */

// R2 — 무채색 금지, 정규 팔레트. 5축 각각 고정 색.
const AXES = [
  { key: 'pct_value',     label: '가치', color: '#1F4FD3', hint: '성장 대비 안 비싼가 (PEG·상대PER)' },
  { key: 'pct_growth',    label: '성장', color: '#059669', hint: '매출·EPS가 늘고 있나' },
  { key: 'pct_quality',   label: '체력', color: '#D97706', hint: 'ROE·부채비율 — 재무 건전성' },
  { key: 'pct_momentum',  label: '추세', color: '#7C3AED', hint: '52주 신고가 근접도' },
  { key: 'pct_sentiment', label: '전문가', color: '#0891B2', hint: '애널리스트 목표가 상승여력' },
]

function agoLabel(epoch) {
  if (!epoch) return null
  const h = Math.max(0, (Date.now() / 1000 - epoch) / 3600)
  if (h < 1) return '방금 갱신'
  if (h < 24) return `${Math.round(h)}시간 전 갱신`
  return `${Math.round(h / 24)}일 전 갱신`
}

/* 5축 미니 막대 — N/A는 막대 없이 'N/A' 텍스트(가짜 0% 금지). hover로 값 노출(R3). */
function AxisBars({ row }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      {AXES.map(ax => {
        const v = row[ax.key]
        const na = v == null
        return (
          <div key={ax.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            title={na ? `${ax.label}: 데이터 미제공` : `${ax.label}: ${Math.round(v)} / 100 — ${ax.hint}`}>
            <span style={{ flex: '0 0 34px', fontSize: 10.5, fontWeight: 700,
              color: 'var(--m-text-secondary)' }}>{ax.label}</span>
            <div style={{ flex: 1, minWidth: 0, height: 6,
              background: 'var(--m-outline-variant)', borderRadius: 2, overflow: 'hidden' }}>
              {!na && (
                <div style={{ height: '100%', width: `${Math.max(2, v)}%`,
                  background: ax.color, transition: 'width .3s ease' }} />
              )}
            </div>
            <span style={{ flex: '0 0 30px', textAlign: 'right', fontSize: 10.5,
              fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: na ? 'var(--m-text-tertiary)' : 'var(--m-text)' }}>
              {na ? 'N/A' : Math.round(v)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StockCard({ row, rank, onPick }) {
  const score = row.composite_score
  const failed = !row.gate_pass
  return (
    <button onClick={() => onPick(row.ticker)}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '10px 12px', marginBottom: 8, borderRadius: 4,
        border: '1px solid var(--m-outline-variant)',
        background: 'var(--m-surface)', fontFamily: 'inherit',
        opacity: failed ? 0.62 : 1,
      }}>
      {/* 헤더: 순위 · 종목 · 종합점수 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ flex: '0 0 22px', fontSize: 13, fontWeight: 900,
          color: 'var(--m-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {rank}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--m-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name || row.ticker}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)',
            fontWeight: 600, marginTop: 1 }}>
            {row.ticker} · {row.market} · {row.sector}
          </div>
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--m-text)',
            lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(score)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--m-text-tertiary)', fontWeight: 700,
            letterSpacing: '.02em', marginTop: 2 }}>SCORE</div>
        </div>
      </div>

      {/* 배지: 데이터 완성도 + 게이트 탈락 사유 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
          background: 'var(--m-surface-variant)', color: 'var(--m-text-secondary)' }}
          title="5개 분석 축 중 데이터가 확보된 축 수 (KR은 부채·애널리스트 미제공)">
          데이터 {row.data_completeness}/5축
        </span>
        {failed && row.gate_fail_reason && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
            border: '1px solid var(--m-negative)', color: 'var(--m-negative)' }}
            title="필수 게이트 탈락 — 안 비싼·성장·건전성 최소 기준 미달">
            제외: {row.gate_fail_reason}
          </span>
        )}
      </div>

      <AxisBars row={row} />
    </button>
  )
}

export default function DiscoverTab() {
  const setChartTicker = useStore(s => s.setChartTicker)
  const [market, setMarket] = useState('ALL')   // 'ALL' | 'US' | 'KR'
  const [sort, setSort] = useState('score')
  const [includeFailed, setIncludeFailed] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['discover', market, sort, includeFailed],
    queryFn: () => getDiscover({ market, sort, include_failed: includeFailed, limit: 60 }),
    staleTime: 10 * 60_000,
  })

  const items = data?.items || []
  const ago = agoLabel(data?.computed_at)

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="mono-card" style={{ marginBottom: 12 }}>
        <div className="mono-section-header">
          <div>
            <div className="mono-section-title is-accent">신규 종목 발굴 · GARP</div>
            <div className="mono-section-sub ko-keep">
              성장 대비 안 비싼 종목을 5개 축으로 점수화해 줄세웁니다. 점수는 상승 '확률'이 아니라
              팩터 우열의 상대 순위입니다 — 투자 판단의 출발점일 뿐 보장이 아닙니다.
            </div>
          </div>
        </div>

        {/* 필터 바 */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
          marginTop: 10 }}>
          <div className="seg-ctrl">
            {['ALL', 'US', 'KR'].map(m => (
              <button key={m} onClick={() => setMarket(m)}
                className={`seg-btn ${market === m ? 'active' : ''}`}
                style={{ fontSize: 11 }}>
                {m === 'ALL' ? '전체' : m}
              </button>
            ))}
          </div>
          <div className="seg-ctrl">
            {[['score', '점수순'], ['completeness', '데이터순'], ['roe', 'ROE순']].map(([v, l]) => (
              <button key={v} onClick={() => setSort(v)}
                className={`seg-btn ${sort === v ? 'active' : ''}`}
                style={{ fontSize: 11 }}>
                {l}
              </button>
            ))}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', fontSize: 11, color: 'var(--m-text-secondary)', fontWeight: 600 }}>
            <input type="checkbox" checked={includeFailed}
              onChange={e => setIncludeFailed(e.target.checked)} />
            게이트 탈락 종목도 표시
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--m-text-tertiary)',
            fontWeight: 600 }}>
            {ago || ''}
          </span>
        </div>
      </div>

      {/* 결과 */}
      {isLoading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center',
          color: 'var(--m-text-tertiary)', fontSize: 12 }}>
          발굴 데이터를 불러오는 중…
        </div>
      ) : error ? (
        <div className="ko-keep" style={{ padding: '12px', borderRadius: 4,
          border: '1px solid var(--m-negative)', color: 'var(--m-negative)', fontSize: 12 }}>
          발굴 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : items.length === 0 ? (
        <div className="mono-card ko-keep" style={{ textAlign: 'center',
          color: 'var(--m-text-secondary)', fontSize: 12.5, lineHeight: 1.7, padding: 24 }}>
          아직 발굴 스캔 결과가 없습니다.<br />
          매일 장 마감 후 자동 스캔되어 이곳에 채워집니다.
          {includeFailed ? '' : ' (게이트 통과 종목이 없으면 「탈락 종목도 표시」를 켜 보세요.)'}
        </div>
      ) : (
        <div>
          {items.map((row, i) => (
            <StockCard key={row.ticker} row={row} rank={i + 1} onPick={setChartTicker} />
          ))}
        </div>
      )}
    </div>
  )
}

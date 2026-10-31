import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUsageTabs } from '../api'

/**
 * 탭 체류시간 — 탭을 합칠 때 쓸 근거.
 *
 * 오너 결정(2026-10-31): "느낌이 아니라 기록으로 정하겠다."
 * 그래서 이 화면은 **제안하지 않는다.** 어느 탭에 얼마나 머물렀는지만 보여준다.
 *
 * 기록 시작일을 크게 밝히는 이유: 쌓인 날이 짧으면 이 표는 아직 아무것도 말하지
 * 못한다. 그걸 모르고 보면 "가이드 탭 0%니까 지우자" 같은 결론이 나온다 —
 * 사실은 아직 안 들어가 본 것뿐인데.
 */
const RANGES = [[7, '7일'], [30, '30일'], [90, '90일']]

export default function TabUsagePanel({ isAdmin }) {
  const [days, setDays] = useState(30)
  const [scope, setScope] = useState('me')
  const { data, isLoading } = useQuery({
    queryKey: ['usage-tabs', days, scope],
    queryFn: () => getUsageTabs(days, scope),
    staleTime: 60_000,
    retry: 0,
  })

  const items = data?.items || []
  const basis = data?.basis || {}
  const first = basis.first_event_at
  const daysLogged = first ? Math.max(0, (Date.now() / 1000 - first) / 86400) : 0

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>
        탭 체류시간
      </div>
      {/* R6: 다문장 안내는 문장마다 줄바꿈 */}
      <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--clr-text-muted)',
        lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-line' }}>
        {'탭을 합칠지 정할 때 쓰는 근거입니다.\n남기는 것은 탭 이름과 머문 시간뿐입니다 — 클릭 위치나 입력값은 기록하지 않습니다.'}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="seg-ctrl" style={{ flex: 'none' }}>
          {RANGES.map(([d, lbl]) => (
            <button key={d} className={`seg-btn ${days === d ? 'active' : ''}`}
              onClick={() => setDays(d)}>{lbl}</button>
          ))}
        </div>
        {isAdmin && (
          <div className="seg-ctrl" style={{ flex: 'none' }}>
            <button className={`seg-btn ${scope === 'me' ? 'active' : ''}`}
              onClick={() => setScope('me')}>나</button>
            <button className={`seg-btn ${scope === 'all' ? 'active' : ''}`}
              onClick={() => setScope('all')}>전체 합계</button>
          </div>
        )}
      </div>

      {/* 쌓인 날이 짧으면 그 사실을 먼저 말한다 */}
      {!isLoading && daysLogged < 7 && (
        <div className="ko-keep" style={{ padding: '8px 10px', borderRadius: 2,
          border: '1px solid var(--m-outline-variant)', fontSize: 10.5,
          color: 'var(--clr-text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
          기록을 시작한 지 {daysLogged < 1 ? '하루가 안 됐습니다' : `${Math.floor(daysLogged)}일 됐습니다`}.
          아직 탭을 합칠 근거로 쓰기에는 이릅니다.
        </div>
      )}

      {isLoading ? (
        <div className="skeleton" style={{ height: 80 }} />
      ) : items.length === 0 ? (
        <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)',
          lineHeight: 1.6 }}>
          아직 기록이 없습니다. 2초 미만 머문 탭은 세지 않습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', rowGap: 5 }}>
          {items.map(it => (
            <div key={it.tab} style={{
              display: 'grid', gridTemplateColumns: '72px 1fr 52px',
              alignItems: 'center', columnGap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700,
                color: 'var(--clr-text-strong)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.tab}</span>
              <span style={{ height: 8, borderRadius: 2,
                background: 'var(--m-surface-variant)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%',
                  width: `${it.share_pct}%`, background: 'var(--clr-pos-dark)' }} />
              </span>
              <span title={`${it.visits}회 방문 · 평균 ${fmtDur(it.avg_ms)}`}
                style={{ fontSize: 10.5, textAlign: 'right', fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--clr-text-sub)' }}>{it.share_pct}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 분모를 밝힌다 — 서버가 준 값만 쓴다 */}
      {!isLoading && items.length > 0 && (
        <div className="ko-keep" style={{ fontSize: 9.5, marginTop: 9, lineHeight: 1.6,
          color: 'var(--clr-text-muted)', whiteSpace: 'pre-line' }}>
          {[`최근 ${basis.days}일 · 합계 ${fmtDur(basis.total_ms)} · 기록 시작 ${fmtDate(first)}`,
            basis.note].filter(Boolean).join('\n')}
        </div>
      )}
    </div>
  )
}

function fmtDur(ms) {
  const s = Math.round((ms || 0) / 1000)
  if (s < 60) return `${s}초`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}분`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

function fmtDate(epochSec) {
  if (!epochSec) return '—'
  const d = new Date(epochSec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

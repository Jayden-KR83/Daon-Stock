import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStore } from '../store'
import { getDiscover, rescanDiscover } from '../api'

/* 신규 종목 발굴 (GARP) — compact 표.
 * 행=종목(세로), 열=티커 + 5축(가로). 막대그래프 없음. 5축 설명은 헤더/점수에 hover.
 * 정직성: 점수는 상승 '확률'이 아니라 같은 시장 내 상대 순위. 한국은 부채·전문가 미공개 → '—'. */

const AXES = [
  { key: 'pct_value',     label: '가치',   desc: '지금 가격이 (이익·성장 대비) 싼 편인가' },
  { key: 'pct_growth',    label: '성장',   desc: '매출·이익이 늘고 있는가' },
  { key: 'pct_quality',   label: '체력',   desc: '빚이 적고 돈을 잘 버는가 (재무 건전성)' },
  { key: 'pct_momentum',  label: '추세',   desc: '최근 주가가 상승 흐름인가 (52주 고점 근접)' },
  { key: 'pct_sentiment', label: '전문가', desc: '애널리스트 목표가·추정치 상향 정도' },
]
const FAIL_KO = { 'PEG>1.5': '성장 대비 비쌈', 'EPS성장≤0': '이익 감소', '부채비율≥200': '빚 과다', '매출 급감': '매출 급감' }

function agoLabel(epoch) {
  if (!epoch) return null
  const h = Math.max(0, (Date.now() / 1000 - epoch) / 3600)
  if (h < 1) return '방금 갱신'
  if (h < 24) return `${Math.round(h)}시간 전`
  return `${Math.round(h / 24)}일 전`
}
const mktKo = (m) => (m === 'KR' ? '한국' : m === 'US' ? '미국' : m)

const tdNum = { padding: '7px 7px', textAlign: 'right', fontSize: 12, fontWeight: 600,
  color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const thNum = { padding: '6px 7px', textAlign: 'right', fontSize: 11, fontWeight: 700,
  color: 'var(--m-text-secondary)', whiteSpace: 'nowrap', cursor: 'help' }

export default function DiscoverTab() {
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)
  const currentUser = useStore(s => s.currentUser)
  const isAdmin = !!currentUser?.is_admin

  const [market, setMarket] = useState('ALL')
  const [sort, setSort] = useState('score')
  const [includeFailed, setIncludeFailed] = useState(false)
  const [rescanMsg, setRescanMsg] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['discover', market, sort, includeFailed],
    queryFn: () => getDiscover({ market, sort, include_failed: includeFailed, limit: 80 }),
    staleTime: 10 * 60_000,
  })
  const items = data?.items || []
  const ago = agoLabel(data?.computed_at)

  async function onRescan() {
    setRescanMsg('갱신 요청 중…')
    try {
      const r = await rescanDiscover()
      if (r.status === 'started') {
        setRescanMsg('갱신 시작 — 5~7분 후 자동 반영됩니다.')
        setTimeout(() => { qc.invalidateQueries({ queryKey: ['discover'] }); setRescanMsg('') }, 420_000)
      } else if (r.status === 'already_running') setRescanMsg('이미 갱신 중입니다.')
      else setRescanMsg('')
    } catch (e) { setRescanMsg(e.response?.data?.detail || '갱신 실패') }
  }

  function scoreCell(row, ax) {
    const v = row[ax.key]
    if (v == null) return <td key={ax.key} style={{ ...tdNum, color: 'var(--m-text-tertiary)' }}
      title={`${ax.label} — 데이터 미공개`}>—</td>
    const top = Math.max(1, Math.round(100 - v))
    return <td key={ax.key} style={tdNum}
      title={`${ax.label} ${Math.round(v)}/100 — ${ax.desc}. 같은 ${mktKo(row.market)} 종목 중 상위 ${top}%`}>
      {Math.round(v)}</td>
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="mono-card" style={{ marginBottom: 10 }}>
        <div className="mono-section-header">
          <div>
            <div className="mono-section-title is-accent">신규 종목 발굴</div>
            <div className="mono-section-sub ko-keep">
              성장하면서도 안 비싼 종목을 5가지로 점수화. 항목 머리글·점수에 <b>마우스를 올리면 설명</b>이 나와요.
              점수는 상승 확률이 아니라 같은 시장 내 상대 순위입니다.
            </div>
          </div>
        </div>
        {/* 필터 + 갱신 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <div className="seg-ctrl">
            {[['ALL', '전체'], ['US', '미국'], ['KR', '한국']].map(([v, l]) => (
              <button key={v} onClick={() => setMarket(v)} className={`seg-btn ${market === v ? 'active' : ''}`}
                style={{ fontSize: 11 }}>{l}</button>))}
          </div>
          <div className="seg-ctrl">
            {[['score', '종합순'], ['completeness', '데이터순'], ['roe', '수익성순']].map(([v, l]) => (
              <button key={v} onClick={() => setSort(v)} className={`seg-btn ${sort === v ? 'active' : ''}`}
                style={{ fontSize: 11 }}>{l}</button>))}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            fontSize: 11, color: 'var(--m-text-secondary)', fontWeight: 600 }}
            title="PEG·성장·부채 최소 기준 미달 종목 (참고용)">
            <input type="checkbox" checked={includeFailed} onChange={e => setIncludeFailed(e.target.checked)} />
            기준 미달도
          </label>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>
              {ago ? `${ago} · 매일 자동` : '매일 자동'}</span>
            {isAdmin && <button onClick={onRescan} className="btn-secondary"
              style={{ fontSize: 11, padding: '4px 9px' }}>지금 갱신</button>}
          </span>
        </div>
      </div>

      {rescanMsg && <div className="ko-keep" style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 4,
        background: 'var(--m-surface-variant)', color: 'var(--m-text-secondary)', fontSize: 11.5 }}>{rescanMsg}</div>}

      {isLoading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--m-text-tertiary)', fontSize: 12 }}>불러오는 중…</div>
      ) : error ? (
        <div className="ko-keep" style={{ padding: 12, borderRadius: 4, border: '1px solid var(--m-negative)',
          color: 'var(--m-negative)', fontSize: 12 }}>발굴 데이터를 불러오지 못했습니다.</div>
      ) : items.length === 0 ? (
        <div className="mono-card ko-keep" style={{ textAlign: 'center', color: 'var(--m-text-secondary)',
          fontSize: 12.5, lineHeight: 1.7, padding: 24 }}>
          아직 발굴 결과가 없습니다. 매일 장 마감 후 자동 갱신됩니다.{!includeFailed && ' (「기준 미달도」를 켜 보세요.)'}
        </div>
      ) : (
        <div className="mono-card" style={{ padding: '4px 6px', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 540, borderCollapse: 'collapse', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 7px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: 'var(--m-text-secondary)' }}>종목</th>
                <th style={{ padding: '6px 7px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: 'var(--m-text-secondary)' }}>티커</th>
                {AXES.map(ax => <th key={ax.key} style={thNum} title={ax.desc}>{ax.label}</th>)}
                <th style={{ ...thNum, color: 'var(--m-text)' }} title="5개 항목 가중 평균 매력도 (같은 시장 내 상대 순위)">종합</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => {
                const failed = !row.gate_pass
                return (
                  <tr key={row.ticker} onClick={() => setChartTicker(row.ticker)} className="discover-row"
                    style={{ cursor: 'pointer', opacity: failed ? 0.55 : 1 }}>
                    <td style={{ padding: '7px 7px', maxWidth: 150 }}
                      title={`${mktKo(row.market)} · ${row.sector}${failed ? ` · 기준 미달: ${FAIL_KO[row.gate_fail_reason] || ''}` : ''}`}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)',
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.name || row.ticker}</span>
                    </td>
                    <td style={{ padding: '7px 7px', fontSize: 11, color: 'var(--m-text-tertiary)',
                      fontWeight: 600, whiteSpace: 'nowrap' }}>{row.ticker}</td>
                    {AXES.map(ax => scoreCell(row, ax))}
                    <td style={{ ...tdNum, fontSize: 13.5, fontWeight: 900 }}
                      title={`종합 ${Math.round(row.composite_score)} — 5개 항목 가중 평균(상대 순위)${row.data_completeness < 5 ? ` · ${row.data_completeness}/5 항목으로 평가(한국은 부채·전문가 미공개)` : ''}`}>
                      {Math.round(row.composite_score)}
                      {row.data_completeness < 5 && <span style={{ fontSize: 9, fontWeight: 600,
                        color: 'var(--m-text-tertiary)', marginLeft: 2 }}>·{row.data_completeness}/5</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ko-keep" style={{ fontSize: 10, color: 'var(--m-text-tertiary)', marginTop: 9, lineHeight: 1.5 }}>
        종목을 누르면 종목 탭에서 AI 심층 분석. 투자 권유 아님 · 데이터 매일 자동 갱신.
      </div>
    </div>
  )
}

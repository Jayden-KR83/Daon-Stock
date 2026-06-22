import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { useStore } from '../store'
import { getDiscover, rescanDiscover } from '../api'

/* 신규 종목 발굴 (GARP) — 표 + 종목별 레이더 인포그래픽(확장).
 * 행 클릭 → 5요소 레이더 + 밸류에이션(현재가·목표가·상승여력·PER·PEG·순이익률) + 메타 펼침.
 * 정직성: 점수는 상승 '확률'이 아니라 같은 시장 내 상대 순위. 한국은 일부 지표 미공개('—'). */

// 5요소 — 직관적 이름 + 쉬운 설명
const AXES = [
  { key: 'pct_value',     label: '저평가', desc: '이익·성장에 비해 주가가 싼 편인가 (PER·PEG·선행PER)' },
  { key: 'pct_growth',    label: '성장성', desc: '매출·이익이 늘고 있는가' },
  { key: 'pct_quality',   label: '안정성', desc: '빚이 적고 돈을 잘 버는가 (재무 건전성)' },
  { key: 'pct_momentum',  label: '상승세', desc: '최근 주가가 상승 흐름인가 (52주 고점 근접)' },
  { key: 'pct_expert',    label: '기대',   desc: '애널리스트 목표가·추정치 상향 정도', src: 'pct_sentiment' },
]
const axVal = (row, ax) => row[ax.src || ax.key]

const EXCH = { NMS: '나스닥', NGM: '나스닥', NCM: '나스닥', NYQ: 'NYSE', PCX: 'NYSE Arca',
  ASE: 'NYSE American', KSC: '코스피', KOE: '코스닥', KDQ: '코스닥' }
const FAIL_KO = { 'PEG>1.5': '성장 대비 비쌈', 'EPS성장≤0': '이익 감소', '부채비율≥200': '빚 과다', '매출 급감': '매출 급감' }

const mktKo = (m) => (m === 'KR' ? '한국' : m === 'US' ? '미국' : m)
const fmtPrice = (v, m) => v == null ? '—' : (m === 'KR' ? '₩' + Math.round(v).toLocaleString() : '$' + Number(v).toFixed(2))
const fmtPe = (v) => v == null ? '—' : Number(v).toFixed(1) + '배'
const fmtPct = (v) => v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v) + '%'

function agoLabel(epoch) {
  if (!epoch) return null
  const h = Math.max(0, (Date.now() / 1000 - epoch) / 3600)
  return h < 1 ? '방금 갱신' : h < 24 ? `${Math.round(h)}시간 전` : `${Math.round(h / 24)}일 전`
}
function valNote(row) {
  const p = []
  if (row.peg != null) p.push(row.peg < 1 ? '성장 대비 저평가(PEG<1)' : row.peg <= 1.5 ? '성장 대비 적정(PEG≤1.5)' : '성장 대비 비쌈')
  if (row.forward_pe != null && row.trailing_pe != null && row.forward_pe < row.trailing_pe)
    p.push('선행PER<후행 → 이익 증가 예상')
  if (row.analyst_upside != null) p.push(`목표가까지 ${fmtPct(row.analyst_upside)} 여력`)
  return p.join(' · ') || '추가 밸류 지표 제한적(한국 종목)'
}

const td = { padding: '8px 7px', fontSize: 12, color: 'var(--m-text)', whiteSpace: 'nowrap' }
const th = { padding: '6px 7px', fontSize: 11, fontWeight: 700, color: 'var(--m-text-secondary)', whiteSpace: 'nowrap' }

function DetailPanel({ row, onPick }) {
  const radarData = AXES.map(ax => ({ axis: ax.label, v: axVal(row, ax) }))
  const kv = (label, value, hint) => (
    <div title={hint || ''} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
  const exch = EXCH[row.exchange] || row.exchange || mktKo(row.market)
  const type = row.quote_type === 'ETF' ? 'ETF' : '개별종목'
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 6px 4px', alignItems: 'flex-start' }}>
      {/* 레이더 인포그래픽 */}
      <div style={{ flex: '0 0 200px', maxWidth: 220 }}>
        <ResponsiveContainer width="100%" height={170}>
          <RadarChart data={radarData} outerRadius="68%">
            <PolarGrid stroke="var(--m-outline-variant)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'var(--m-text-secondary)' }} />
            <Radar dataKey="v" stroke="#1F4FD3" fill="#1F4FD3" fillOpacity={0.22}
              connectNulls isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', justifyContent: 'center', fontSize: 10 }}>
          {AXES.map(ax => {
            const v = axVal(row, ax)
            return <span key={ax.key} title={ax.desc} style={{ color: 'var(--m-text-secondary)', cursor: 'help' }}>
              {ax.label} <b style={{ color: v == null ? 'var(--m-text-tertiary)' : 'var(--m-text)' }}>{v == null ? '—' : Math.round(v)}</b>
            </span>
          })}
        </div>
      </div>
      {/* 밸류에이션 + 메타 */}
      <div style={{ flex: '1 1 280px', minWidth: 240 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '9px 10px' }}>
          {kv('현재가', fmtPrice(row.current_price, row.market))}
          {kv('목표가', fmtPrice(row.target_price, row.market), '애널리스트 평균 목표주가')}
          {kv('상승여력', <span className={row.analyst_upside > 0 ? 'num-pos' : row.analyst_upside < 0 ? 'num-neg' : ''}>{fmtPct(row.analyst_upside)}</span>, '목표가 대비 현재가 상승여력')}
          {kv('순이익률', row.profit_margin == null ? '—' : Math.round(row.profit_margin) + '%', '매출 중 순이익 비율')}
          {kv('PER', fmtPe(row.trailing_pe), '후행 주가수익비율 — 낮을수록 쌈')}
          {kv('선행PER', fmtPe(row.forward_pe), '추정이익 기준 PER')}
          {kv('PEG', row.peg == null ? '—' : Number(row.peg).toFixed(2), '성장 대비 밸류 — 1 이하 저평가')}
          {kv('데이터', `${row.data_completeness}/5`, '5개 요소 중 평가에 쓰인 수')}
        </div>
        <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-secondary)', marginTop: 9, lineHeight: 1.5 }}>
          💡 {valNote(row)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
          <span>{mktKo(row.market)} · {exch}</span><span>·</span><span>{type}</span><span>·</span><span>{row.sector}</span>
          {!row.gate_pass && <span style={{ color: 'var(--m-negative)' }}>· 기준 미달: {FAIL_KO[row.gate_fail_reason] || row.gate_fail_reason}</span>}
        </div>
        <button className="btn-primary" onClick={(e) => { e.stopPropagation(); onPick(row.ticker) }}
          style={{ marginTop: 10, fontSize: 12, padding: '7px 14px' }}>
          AI 심층 분석 보기 →
        </button>
      </div>
    </div>
  )
}

export default function DiscoverTab() {
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)
  const currentUser = useStore(s => s.currentUser)
  const isAdmin = !!currentUser?.is_admin

  const [market, setMarket] = useState('ALL')
  const [includeFailed, setIncludeFailed] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [rescanMsg, setRescanMsg] = useState('')
  // 검색·필터·정렬 (클라이언트)
  const [q, setQ] = useState('')
  const [secFilter, setSecFilter] = useState(() => new Set())   // 빈 set = 전체 섹터
  const [sortKey, setSortKey] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')

  const { data, isLoading, error } = useQuery({
    queryKey: ['discover', market, includeFailed],
    queryFn: () => getDiscover({ market, sort: 'score', include_failed: includeFailed, limit: 200 }),
    staleTime: 10 * 60_000,
  })
  const items = data?.items || []
  const ago = agoLabel(data?.computed_at)

  const sectors = useMemo(
    () => [...new Set(items.map(r => r.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [items])

  const view = useMemo(() => {
    let arr = items
    const qq = q.trim().toLowerCase()
    if (qq) arr = arr.filter(r =>
      (r.name || '').toLowerCase().includes(qq) || (r.ticker || '').toLowerCase().includes(qq) ||
      (r.sector || '').toLowerCase().includes(qq) || mktKo(r.market).includes(qq))
    if (secFilter.size) arr = arr.filter(r => secFilter.has(r.sector))
    const dir = sortDir === 'asc' ? 1 : -1
    const numKey = sortKey === 'analyst_upside' || sortKey === 'composite_score'
    const val = (r) => sortKey === 'name' ? (r.name || r.ticker) : sortKey === 'market'
      ? mktKo(r.market) : sortKey === 'sector' ? (r.sector || '') : r[sortKey]
    return [...arr].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (numKey) {
        if (va == null && vb == null) return 0
        if (va == null) return 1                 // 값 없음은 항상 뒤로
        if (vb == null) return -1
        return (va - vb) * dir
      }
      return String(va).localeCompare(String(vb), 'ko') * dir
    })
  }, [items, q, secFilter, sortKey, sortDir])

  function sortBy(key) {
    if (sortKey === key) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return }
    setSortKey(key)
    setSortDir(['name', 'ticker', 'market', 'sector'].includes(key) ? 'asc' : 'desc')
  }
  const arrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
  function toggleSector(s) {
    setSecFilter(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }

  async function onRescan() {
    setRescanMsg('갱신 요청 중…')
    try {
      const r = await rescanDiscover()
      if (r.status === 'started') {
        setRescanMsg('갱신 시작 — 7~10분 후 자동 반영됩니다.')
        setTimeout(() => { qc.invalidateQueries({ queryKey: ['discover'] }); setRescanMsg('') }, 600_000)
      } else if (r.status === 'already_running') setRescanMsg('이미 갱신 중입니다.')
      else setRescanMsg('')
    } catch (e) { setRescanMsg(e.response?.data?.detail || '갱신 실패') }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="mono-card" style={{ marginBottom: 10 }}>
        <div className="mono-section-header">
          <div>
            <div className="mono-section-title is-accent">신규 종목 발굴</div>
            <div className="mono-section-sub ko-keep">
              성장하면서도 저평가된 종목을 5요소로 점수화. <b>행을 누르면</b> 5요소 레이더와
              목표가·상승여력·PER 등 상세가 펼쳐집니다. 점수는 상승 확률이 아니라 같은 시장 내 상대 순위예요.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <div className="seg-ctrl">
            {[['ALL', '전체'], ['US', '미국'], ['KR', '한국']].map(([v, l]) => (
              <button key={v} onClick={() => setMarket(v)} className={`seg-btn ${market === v ? 'active' : ''}`} style={{ fontSize: 11 }}>{l}</button>))}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 종목·티커·섹터 검색"
            style={{ fontSize: 11.5, padding: '5px 9px', borderRadius: 4, border: '1px solid var(--m-outline-variant)',
              background: 'var(--m-surface)', color: 'var(--m-text)', width: 170, fontFamily: 'inherit' }} />
          <details style={{ position: 'relative' }}>
            <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--m-text-secondary)', cursor: 'pointer',
              listStyle: 'none', padding: '5px 9px', border: '1px solid var(--m-outline-variant)', borderRadius: 4 }}>
              섹터{secFilter.size ? ` (${secFilter.size})` : ' ▾'}
            </summary>
            <div style={{ position: 'absolute', zIndex: 20, marginTop: 4, maxHeight: 240, overflowY: 'auto',
              background: 'var(--m-surface)', border: '1px solid var(--m-outline-variant)', borderRadius: 4,
              padding: 8, minWidth: 150, boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
              {secFilter.size > 0 && (
                <button onClick={() => setSecFilter(new Set())} className="btn-secondary"
                  style={{ fontSize: 10, padding: '3px 7px', marginBottom: 6, width: '100%' }}>전체 해제</button>)}
              {sectors.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  color: 'var(--m-text)', padding: '3px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={secFilter.has(s)} onChange={() => toggleSector(s)} /> {s}
                </label>))}
            </div>
          </details>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: 'var(--m-text-secondary)', fontWeight: 600 }}
            title="PEG·성장·부채 최소 기준 미달 종목 (참고용)">
            <input type="checkbox" checked={includeFailed} onChange={e => setIncludeFailed(e.target.checked)} /> 기준 미달도
          </label>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>{ago ? `${ago} · 매일 자동` : '매일 자동'}</span>
            {isAdmin && <button onClick={onRescan} className="btn-secondary" style={{ fontSize: 11, padding: '4px 9px' }}>지금 갱신</button>}
          </span>
        </div>
      </div>

      {rescanMsg && <div className="ko-keep" style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 4, background: 'var(--m-surface-variant)', color: 'var(--m-text-secondary)', fontSize: 11.5 }}>{rescanMsg}</div>}

      {isLoading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--m-text-tertiary)', fontSize: 12 }}>불러오는 중…</div>
      ) : error ? (
        <div className="ko-keep" style={{ padding: 12, borderRadius: 4, border: '1px solid var(--m-negative)', color: 'var(--m-negative)', fontSize: 12 }}>발굴 데이터를 불러오지 못했습니다.</div>
      ) : items.length === 0 ? (
        <div className="mono-card ko-keep" style={{ textAlign: 'center', color: 'var(--m-text-secondary)', fontSize: 12.5, lineHeight: 1.7, padding: 24 }}>
          아직 발굴 결과가 없습니다. 매일 장 마감 후 자동 갱신됩니다.{!includeFailed && ' (「기준 미달도」를 켜 보세요.)'}
        </div>
      ) : (
        <div className="mono-card" style={{ padding: '4px 6px', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('name')} title="클릭: 오름/내림 정렬">종목{arrow('name')}</th>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('ticker')} title="클릭: 정렬">티커{arrow('ticker')}</th>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('market')} title="클릭: 정렬">국가{arrow('market')}</th>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('sector')} title="클릭: 정렬">섹터{arrow('sector')}</th>
                <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy('analyst_upside')} title="목표가 대비 상승여력(미국) · 클릭: 정렬">상승여력{arrow('analyst_upside')}</th>
                <th style={{ ...th, textAlign: 'right', color: 'var(--m-text)', cursor: 'pointer' }} onClick={() => sortBy('composite_score')} title="5요소 가중 평균 · 클릭: 정렬">종합{arrow('composite_score')}</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--m-text-tertiary)', padding: '24px' }}>
                  검색·필터 결과가 없습니다.</td></tr>
              )}
              {view.map(row => {
                const open = expanded === row.ticker
                const failed = !row.gate_pass
                return (
                  <React.Fragment key={row.ticker}>
                    <tr onClick={() => setExpanded(open ? null : row.ticker)} className="discover-row"
                      style={{ cursor: 'pointer', opacity: failed ? 0.6 : 1 }}>
                      <td style={{ ...td, maxWidth: 150 }}>
                        <span style={{ color: 'var(--m-text-tertiary)', marginRight: 4, fontSize: 9 }}>{open ? '▼' : '▶'}</span>
                        <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name || row.ticker}</span>
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>{row.ticker}</td>
                      <td style={{ ...td, fontSize: 11.5, color: 'var(--m-text-secondary)' }}>{mktKo(row.market)}</td>
                      <td style={{ ...td, fontSize: 11.5, color: 'var(--m-text-secondary)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sector}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <span className={row.analyst_upside > 0 ? 'num-pos' : row.analyst_upside < 0 ? 'num-neg' : ''}
                          style={row.analyst_upside == null ? { color: 'var(--m-text-tertiary)' } : {}}>{fmtPct(row.analyst_upside)}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 900, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(row.composite_score)}
                        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--m-text-tertiary)', marginLeft: 2 }}>·{row.data_completeness}/5</span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--m-surface-variant)', borderRadius: 4 }}>
                          <DetailPanel row={row} onPick={setChartTicker} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ko-keep" style={{ fontSize: 10, color: 'var(--m-text-tertiary)', marginTop: 9, lineHeight: 1.5 }}>
        「종합」 옆 N/5 = 평가에 쓰인 요소 수 (애널리스트 커버리지가 없는 일부 종목은 4/5). 레이더에서 빈 축은 '0점'이 아니라 '데이터 없음'입니다. 투자 권유 아님 · 데이터 매일 자동 갱신.
      </div>
    </div>
  )
}

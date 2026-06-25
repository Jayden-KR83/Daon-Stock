import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { useStore } from '../store'
import { getDiscover, rescanDiscover, getCachedAnalysis } from '../api'

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

// 저점발굴(혁신·턴어라운드) 4요소 — PSR·R&D·바닥다지기·런웨이 기반
const INNOV_AXES = [
  { key: 'pct_value',    label: '저평가',    desc: '매출 대비 주가가 R&D(파이프라인 가치) 대비 싼가 — 변형밸류 PSR÷R&D집중도' },
  { key: 'pct_growth',   label: '파이프라인', desc: '매출 대비 R&D 투자 강도 — 미래 신약·기술 잠재력' },
  { key: 'pct_momentum', label: '바닥다지기', desc: '장기 바닥에서 막 반등 — 120일선 돌파 + 저변동성 + 거래량 유입' },
  { key: 'pct_quality',  label: '생존력',    desc: '보유 현금으로 적자를 버틸 수 있는 햇수 (런웨이)' },
]

const EXCH = { NMS: '나스닥', NGM: '나스닥', NCM: '나스닥', NYQ: 'NYSE', PCX: 'NYSE Arca',
  ASE: 'NYSE American', KSC: '코스피', KOE: '코스닥', KDQ: '코스닥' }
const FAIL_KO = { 'PEG>1.5': '성장 대비 비쌈', 'EPS성장≤0': '이익 감소', '부채비율≥200': '빚 과다', '매출 급감': '매출 급감' }

const mktKo = (m) => (m === 'KR' ? '한국' : m === 'US' ? '미국' : m)
// AI 심층 분석 추천 색상 (매수 긍정 / 매도 부정 / 보유 중립)
const recoColor = (r) => r === '매수' ? 'var(--m-positive)' : r === '매도' ? 'var(--m-negative)' : 'var(--m-text-secondary)'
// 임상 단계 바이오 — PSR·런웨이로 못 잡는 이진 임상 이벤트 리스크. 백엔드 _BIO_CLINICAL_CATS와 일치.
const BIO_CLINICAL = new Set(['AI 신약', 'AI 항체', '유전자편집', '유전자치료', '유전체', '합성생물학'])
// 종합점수 → 컨빅션 등급 (투자자가 한눈에 강도를 알 수 있게)
const convLabel = (s) => s >= 80 ? { t: '강력', c: 'var(--m-primary)' }
  : s >= 70 ? { t: '추천', c: 'var(--m-primary)' }
  : s >= 60 ? { t: '관심', c: 'var(--m-text-secondary)' } : null
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

// 문장이 끝나면 줄바꿈 — 숫자 소수점($75.2B)·약어는 보존(앞이 숫자/공백이 아닐 때만).
// ChartTab의 동일 헬퍼와 일치. whiteSpace:'pre-line'과 함께 써야 \n이 렌더됨.
const breakSentences = (text) =>
  typeof text === 'string' ? text.replace(/([^\d\s])([.?!])\s+/g, '$1$2\n').trim() : text

// 캐시된 AI 심층 분석 인라인 표시 — 있으면 핵심 요약(추천·촉매·리스크) 자동 노출(무과금 읽기),
// 없으면 라이브 생성 버튼. CLI 배치로 채워진 ai_cache(stock_v2)를 모든 사용자가 무료 열람.
function CachedAI({ ticker, name, onPick }) {
  const { data } = useQuery({
    queryKey: ['discoverAI', ticker],
    queryFn: () => getCachedAnalysis(ticker, name || ''),
    staleTime: 30 * 60_000,
  })
  const a = data?.cached ? data.data : null
  const aiAgo = data?.computed_at ? agoLabel(data.computed_at) : null
  const recColor = recoColor
  if (!a) {
    return (
      <button className="btn-primary" onClick={(e) => { e.stopPropagation(); onPick(ticker) }}
        style={{ marginTop: 10, fontSize: 12, padding: '7px 14px' }}>AI 심층 분석 보기 →</button>
    )
  }
  return (
    <div style={{ marginTop: 10, background: 'var(--m-surface)', border: '1px solid var(--m-outline-variant)', borderRadius: 4, padding: '9px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--m-text-secondary)' }}>AI 심층</span>
        {a.recommendation && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 2,
          color: recColor(a.recommendation), border: `1px solid ${recColor(a.recommendation)}` }}>{a.recommendation}</span>}
        {aiAgo && <span style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', marginLeft: 'auto' }}>분석 {aiAgo}</span>}
      </div>
      <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{breakSentences(a.summary)}</div>
      {(a.catalysts_short?.[0] || a.bear?.[0]) && (
        <div style={{ display: 'grid', gap: 4, marginTop: 7 }}>
          {a.catalysts_short?.[0] && <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            <b style={{ color: 'var(--m-positive)' }}>촉매</b> {breakSentences(a.catalysts_short[0])}</div>}
          {a.bear?.[0] && <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            <b style={{ color: 'var(--m-negative)' }}>리스크</b> {breakSentences(a.bear[0])}</div>}
        </div>
      )}
      <button className="btn-primary" onClick={(e) => { e.stopPropagation(); onPick(ticker) }}
        style={{ marginTop: 9, fontSize: 12, padding: '7px 14px' }}>전체 분석 보기 →</button>
    </div>
  )
}

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, marginTop: 4 }}>
          {AXES.map(ax => {
            const v = axVal(row, ax)
            return <div key={ax.key} title={ax.desc} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--m-text-secondary)', cursor: 'help' }}>
              <span>{ax.label}</span>
              <b style={{ color: v == null ? 'var(--m-text-tertiary)' : 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : Math.round(v)}</b>
            </div>
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
        <CachedAI ticker={row.ticker} name={row.name} onPick={onPick} />
      </div>
    </div>
  )
}

function fmtAum(v) {
  if (v == null) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'
  return '$' + Math.round(v).toLocaleString()
}

function EtfDetail({ row, onPick }) {
  const kv = (label, value, hint) => (
    <div title={hint || ''} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>)
  const exch = EXCH[row.exchange] || row.exchange || mktKo(row.market)
  const fac = (label, v) => (
    <span style={{ color: 'var(--m-text-secondary)' }}>{label} <b style={{ color: v == null ? 'var(--m-text-tertiary)' : 'var(--m-text)' }}>{v == null ? '—' : Math.round(v)}</b></span>)
  return (
    <div style={{ padding: '10px 8px 6px' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, marginBottom: 9 }}>
        {fac('추세', row.pct_momentum)} {fac('저비용', row.pct_value)} {fac('규모', row.pct_quality)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '9px 10px' }}>
        {kv('현재가', fmtPrice(row.current_price, row.market))}
        {kv('6개월 수익률', <span className={row.ret_6m > 0 ? 'num-pos' : row.ret_6m < 0 ? 'num-neg' : ''}>{fmtPct(row.ret_6m)}</span>, '최근 6개월 가격 수익률')}
        {kv('보수율', row.expense_ratio == null ? '—' : row.expense_ratio + '%', 'ETF 연간 운용보수')}
        {kv('순자산(AUM)', fmtAum(row.aum), '운용 규모')}
      </div>
      <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)', marginTop: 9, lineHeight: 1.5 }}>
        {mktKo(row.market)} · {exch} · ETF · {row.sector} · 추세 50%·저비용 25%·규모 25%로 평가
        {row.market === 'KR' && ' · 한국 ETF는 보수율·AUM 미제공(추세·거래량 기준)'}
      </div>
      <button className="btn-primary" onClick={(e) => { e.stopPropagation(); onPick(row.ticker) }}
        style={{ marginTop: 10, fontSize: 12, padding: '7px 14px' }}>차트·분석 보기 →</button>
    </div>
  )
}

const fmtRunway = (v) => v == null ? '—' : v >= 99 ? '흑자(소진 없음)' : v >= 10 ? '10년+' : Number(v).toFixed(1) + '년'
const fmtRnd = (v) => v == null ? '—' : Math.round(v * 100) + '%'

function InnovDetail({ row, onPick }) {
  const radarData = INNOV_AXES.map(ax => ({ axis: ax.label, v: axVal(row, ax) }))
  const kv = (label, value, hint) => (
    <div title={hint || ''} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>)
  const exch = EXCH[row.exchange] || row.exchange || mktKo(row.market)
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 6px 4px', alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 200px', maxWidth: 220 }}>
        <ResponsiveContainer width="100%" height={170}>
          <RadarChart data={radarData} outerRadius="68%">
            <PolarGrid stroke="var(--m-outline-variant)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'var(--m-text-secondary)' }} />
            <Radar dataKey="v" stroke="#1F4FD3" fill="#1F4FD3" fillOpacity={0.22}
              connectNulls isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, marginTop: 4 }}>
          {INNOV_AXES.map(ax => {
            const v = axVal(row, ax)
            return <div key={ax.key} title={ax.desc} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--m-text-secondary)', cursor: 'help' }}>
              <span>{ax.label}</span>
              <b style={{ color: v == null ? 'var(--m-text-tertiary)' : 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : Math.round(v)}</b>
            </div>
          })}
        </div>
      </div>
      <div style={{ flex: '1 1 280px', minWidth: 240 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '9px 10px' }}>
          {kv('현재가', fmtPrice(row.current_price, row.market))}
          {kv('PSR', row.psr == null ? '—' : Number(row.psr).toFixed(1) + '배', '주가매출비율 — 적자기업 밸류(이익이 없어 PER 대신)')}
          {kv('R&D집중도', fmtRnd(row.rnd_intensity), '연구개발비 ÷ 매출 — 파이프라인 투자 강도')}
          {kv('런웨이', fmtRunway(row.runway_years), '보유현금으로 적자를 버틸 수 있는 햇수 (생존력)')}
          {kv('52주 위치', row.near_52w_high == null ? '—' : Math.round(row.near_52w_high * 100) + '%', '고점 대비 현재가 위치 — 낮을수록 저점권')}
          {kv('데이터', `${row.data_completeness}/4`, '4개 요소 중 평가에 쓰인 수')}
        </div>
        <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-secondary)', marginTop: 9, lineHeight: 1.6 }}>
          💡 적자 단계의 AI·바이오 혁신주를 <b>이익(PEG)이 아니라 매출·파이프라인·바닥다지기·생존력</b>으로 평가합니다.<br />
          PSR이 R&D집중도 대비 낮을수록 “파이프라인이 주가에 덜 반영”된 저점 후보예요.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
          <span>{mktKo(row.market)} · {exch}</span><span>·</span><span>{row.sector}</span>
          <span style={{ color: 'var(--m-negative)', fontWeight: 700 }}>· ⚠ 고위험 위성(satellite) — 변동성 큼, 소액 분산</span>
          {!row.gate_pass && <span style={{ color: 'var(--m-negative)' }}>· 기준 미달: {row.gate_fail_reason}</span>}
        </div>
        <CachedAI ticker={row.ticker} name={row.name} onPick={onPick} />
      </div>
    </div>
  )
}

export default function DiscoverTab() {
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)
  const currentUser = useStore(s => s.currentUser)
  const isAdmin = !!currentUser?.is_admin

  const [qtype, setQtype] = useState('stock')   // 'stock'(개별종목) | 'etf' | 'innov'(저점발굴)
  const [market, setMarket] = useState('ALL')
  const [strongOnly, setStrongOnly] = useState(true)   // 기본: 추천 등급(≥60)만
  const [includeFailed, setIncludeFailed] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [rescanMsg, setRescanMsg] = useState('')
  // 검색·필터·정렬 (클라이언트)
  const [q, setQ] = useState('')
  const [secFilter, setSecFilter] = useState(() => new Set())   // 빈 set = 전체 섹터
  const [sortKey, setSortKey] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')
  const isEtf = qtype === 'etf'
  const isInnov = qtype === 'innov'

  const { data, isLoading, error } = useQuery({
    queryKey: ['discover', market, includeFailed, qtype, strongOnly],
    queryFn: () => getDiscover({ market, sort: 'score', include_failed: includeFailed,
      min_score: strongOnly ? 60 : 0, limit: 200, qtype }),
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
    const numKey = ['analyst_upside', 'composite_score', 'ret_6m', 'pct_momentum'].includes(sortKey)
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
              {isEtf
                ? <>ETF를 <b>추세 50% · 저비용 25% · 규모 25%</b>로 점수화. 행을 누르면 6개월 수익률·보수율·순자산 상세가 펼쳐집니다. 한국 ETF는 보수율·AUM 미제공이라 추세·거래량 위주예요.</>
                : isInnov
                ? <>아직 적자인 <b>AI·바이오 혁신/턴어라운드</b> 종목을 이익(PEG)이 아니라 <b>저평가(PSR÷R&D) · 파이프라인 · 바닥다지기 · 생존력</b>으로 점수화한 <b>저점 후보</b>입니다. 변동성이 큰 <b>고위험 위성(satellite)</b>이라 소액 분산이 원칙이에요. 미국 혁신주 큐레이션 한정.</>
                : <>성장하면서도 저평가된 종목을 5요소로 점수화. <b>행을 누르면</b> 5요소 레이더와 목표가·상승여력·PER 등 상세가 펼쳐집니다.</>}
              {' '}점수는 상승 확률이 아니라 같은 그룹 내 상대 순위예요.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <div className="seg-ctrl">
            {[['stock', '개별종목'], ['etf', 'ETF'], ['innov', '저점발굴']].map(([v, l]) => (
              <button key={v} onClick={() => { setQtype(v); setExpanded(null); setSecFilter(new Set())
                setSortKey('composite_score'); setSortDir('desc'); if (v === 'innov') setStrongOnly(false) }}
                className={`seg-btn ${qtype === v ? 'active' : ''}`} style={{ fontSize: 11, fontWeight: 700 }}>{l}</button>))}
          </div>
          {!isInnov && (
            <div className="seg-ctrl">
              {[['ALL', '전체'], ['US', '미국'], ['KR', '한국']].map(([v, l]) => (
                <button key={v} onClick={() => setMarket(v)} className={`seg-btn ${market === v ? 'active' : ''}`} style={{ fontSize: 11 }}>{l}</button>))}
            </div>
          )}
          <div className="seg-ctrl" title="추천 등급(종합 60점 이상)만 보기 / 게이트 통과 전체 보기">
            {[['추천만', true], ['전체', false]].map(([l, v]) => (
              <button key={l} onClick={() => setStrongOnly(v)} className={`seg-btn ${strongOnly === v ? 'active' : ''}`} style={{ fontSize: 11 }}>{l}</button>))}
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
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('sector')} title="클릭: 정렬">{isEtf ? '테마' : isInnov ? '분야' : '섹터'}{arrow('sector')}</th>
                {isEtf ? (
                  <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy('ret_6m')} title="최근 6개월 수익률 · 클릭: 정렬">6개월{arrow('ret_6m')}</th>
                ) : isInnov ? (
                  <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy('pct_momentum')} title="바닥다지기 점수(0~100) — 장기 바닥 반등 강도 · 클릭: 정렬">바닥다지기{arrow('pct_momentum')}</th>
                ) : (
                  <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy('analyst_upside')} title="목표가 대비 상승여력(미국) · 클릭: 정렬">상승여력{arrow('analyst_upside')}</th>
                )}
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
                      <td style={{ ...td, maxWidth: 160 }}>
                        <span style={{ color: 'var(--m-text-tertiary)', marginRight: 4, fontSize: 9 }}>{open ? '▼' : '▶'}</span>
                        <span style={{ fontWeight: 800 }}>{row.name || row.ticker}</span>
                        {(() => { const cv = convLabel(row.composite_score); return cv && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '1px 5px',
                            borderRadius: 2, color: cv.c, border: `1px solid ${cv.c}` }}>{cv.t}</span>) })()}
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>{row.ticker}</td>
                      <td style={{ ...td, fontSize: 11.5, color: 'var(--m-text-secondary)' }}>{mktKo(row.market)}</td>
                      <td style={{ ...td, fontSize: 11.5, color: 'var(--m-text-secondary)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sector}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {isInnov
                          ? <span style={row.pct_momentum == null ? { color: 'var(--m-text-tertiary)' } : { fontWeight: 700 }}>{row.pct_momentum == null ? '—' : Math.round(row.pct_momentum)}</span>
                          : (() => { const v = isEtf ? row.ret_6m : row.analyst_upside
                              return <span className={v > 0 ? 'num-pos' : v < 0 ? 'num-neg' : ''}
                                style={v == null ? { color: 'var(--m-text-tertiary)' } : {}}>{fmtPct(v)}</span> })()}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontWeight: 900, fontSize: 14 }}>
                          {Math.round(row.composite_score)}
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--m-text-tertiary)', marginLeft: 2 }}>·{row.data_completeness}/{isEtf ? 3 : isInnov ? 4 : 5}</span>
                        </div>
                        {(row.ai_reco || (isInnov && BIO_CLINICAL.has(row.sector))) && (
                          <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center', marginTop: 2 }}>
                            {isInnov && BIO_CLINICAL.has(row.sector) && (
                              <span title="임상 이벤트 리스크 — PSR·런웨이로 측정 불가. 임상 성패 발표 시 주가가 하루에 ±30% 이상 급변할 수 있습니다."
                                style={{ fontSize: 8.5, fontWeight: 800, padding: '0 4px', borderRadius: 2, lineHeight: 1.5, cursor: 'help',
                                  color: 'var(--m-negative)', border: '1px solid var(--m-negative)' }}>⚠ 임상</span>)}
                            {row.ai_reco && (
                              <span title={`AI 심층 분석 의견: ${row.ai_reco} — 정량 점수와 별개의 질적 판단입니다. 행을 펼쳐 근거를 확인하세요.`}
                                style={{ fontSize: 8.5, fontWeight: 800, padding: '0 4px', borderRadius: 2, lineHeight: 1.5,
                                  color: recoColor(row.ai_reco), border: `1px solid ${recoColor(row.ai_reco)}` }}>AI {row.ai_reco}</span>)}
                          </div>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--m-surface-variant)', borderRadius: 4 }}>
                          {isEtf ? <EtfDetail row={row} onPick={setChartTicker} />
                            : isInnov ? <InnovDetail row={row} onPick={setChartTicker} />
                            : <DetailPanel row={row} onPick={setChartTicker} />}
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
        「종합」 옆 N/{isEtf ? 3 : isInnov ? 4 : 5} = 평가에 쓰인 요소 수. 레이더에서 빈 축은 '0점'이 아니라 '데이터 없음'입니다.
        {isInnov && ' 저점발굴은 적자 혁신주 특성상 변동성이 매우 큰 고위험 위성 자산 — 소액 분산이 원칙입니다.'} 투자 권유 아님 · 데이터 매일 자동 갱신.
      </div>
    </div>
  )
}

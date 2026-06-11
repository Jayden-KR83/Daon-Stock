import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getMostActiveUs, getMostActiveKr,
  getSectorUs, getSectorKr,
  getTrendsNews, getSectorStocks, getMarket,
} from '../api'
import { useStore } from '../store'
import LogoCircle from '../components/LogoCircle'
import Sparkline from '../components/Sparkline'
import EtfCompare from '../components/EtfCompare'
import EarningsCalendar from '../components/EarningsCalendar'
import CompareChart from '../components/CompareChart'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Treemap } from 'recharts'
import './TrendsTab.css'

/* ── 색상 헬퍼 ── */
function heatColor(pct) {
  if (pct == null) return '#475569'
  if (pct >  4)   return '#15803D'
  if (pct >  2)   return '#16A34A'
  if (pct >  0.5) return '#4ADE80'
  if (pct >  0)   return '#86EFAC'
  if (pct > -0.5) return '#FCA5A5'
  if (pct > -2)   return '#EF4444'
  if (pct > -4)   return '#DC2626'
  return '#991B1B'
}

/* ── Treemap Cell ── */
let _onSectorClick = null
const HeatCell = (props) => {
  const { x, y, width, height, name, pct } = props
  if (width < 4 || height < 4) return null
  const col    = heatColor(pct)
  const isRoot = name === 'US' || name === 'KR'
  const show   = width > 44 && height > 28
  const showPct = width > 30 && height > 18
  return (
    <g style={{ cursor: isRoot ? 'default' : 'pointer' }}
      onClick={() => !isRoot && _onSectorClick && _onSectorClick(name)}>
      <rect x={x+1} y={y+1} width={width-2} height={height-2} fill={col} rx={3} />
      {show && (
        <text x={x+width/2} y={y+height/2-(showPct?8:0)}
          textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize={Math.min(12,width/5)} fontWeight={700}
          style={{pointerEvents:'none'}}>{name}</text>
      )}
      {showPct && (
        <text x={x+width/2} y={y+height/2+10}
          textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,.9)" fontSize={Math.min(11,width/5.5)} fontWeight={600}
          style={{pointerEvents:'none'}}>
          {(pct??0)>=0?'+':''}{(pct??0).toFixed(2)}%
        </text>
      )}
    </g>
  )
}

/* ── 커스텀 Bar Tooltip ── */
const SectorTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const up = d.value >= 0
  return (
    <div style={{
      background: '#0F172A', borderRadius: 4, padding: '8px 12px',
      fontSize: 12, fontWeight: 700, color: '#F8FAFC',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    }}>
      <div style={{ color: 'var(--clr-text-muted)', marginBottom: 2, fontSize: 11 }}>{d.payload.sector}</div>
      <div style={{ color: up ? '#4ADE80' : '#F87171', fontFamily: 'Manrope, sans-serif' }}>
        {up ? '+' : ''}{d.value.toFixed(2)}%
      </div>
    </div>
  )
}

/* ── 포맷 헬퍼 ── */
function fmtVol(v) {
  if (!v) return ''
  if (v >= 1e9) return `${(v/1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v/1e3).toFixed(0)}K`
  return String(v)
}
function fmtMktCap(v) {
  if (!v) return ''
  if (v >= 1e12) return `$${(v/1e12).toFixed(1)}T`
  if (v >= 1e9)  return `$${(v/1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v/1e6).toFixed(1)}M`
  return `$${v.toLocaleString()}`
}
function fmtPrice(name, price) {
  if (price == null || isNaN(price)) return '—'
  if (name === 'KOSPI' || name === 'KOSDAQ') return price.toFixed(0)
  if (name === 'VIX')   return price.toFixed(2)
  if (price > 1000) return price.toFixed(0)
  return price.toFixed(2)
}

/* ── 공유 종목 행 — 섹터 드릴 / 거래량 Top10 공통 레이아웃 ──
   [순위] [로고] [티커/이름] [스파크라인] [현재가/등락률(+보조)] — 좁은 폭에서도 안 잘림 */
function StockRow({ rank, ticker, name, price, changePct, spark, isUs, subRight, onClick }) {
  const pos = (changePct || 0) >= 0
  return (
    <div className="tt-srow" onClick={onClick}>
      {rank != null && <span className={`tt-rank ${rank <= 3 ? 'top' : ''}`}>{rank}</span>}
      <LogoCircle ticker={ticker} size={34} />
      <div className="tt-srow-info">
        <div className="tt-srow-ticker">{ticker}</div>
        <div className="tt-srow-name">{name}</div>
      </div>
      <div className="tt-srow-spark">
        <Sparkline values={spark || []} positive={pos} width={50} height={22} />
      </div>
      <div className="tt-srow-right">
        <div className="tt-srow-price">
          {isUs ? `$${(price || 0).toFixed(2)}` : `₩${Math.round(price || 0).toLocaleString()}`}
        </div>
        <div className={`tt-srow-pct ${pos ? 'pos' : 'neg'}`}>
          {pos ? '+' : ''}{(changePct || 0).toFixed(2)}%
        </div>
        {subRight && <div className="tt-srow-sub">{subRight}</div>}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */
export default function TrendsTab() {
  const setChartTicker  = useStore(s => s.setChartTicker)
  const hasAnthropicKey = useStore(s => s.hasAnthropicKey)
  const setActiveTab    = useStore(s => s.setActiveTab)

  const [selectedSector, setSelectedSector] = useState(null)
  const [activeList,     setActiveList]     = useState('us')  // 'us' | 'kr' — 단일 토글로 전체 트렌드 탭 제어

  /* ── 데이터 쿼리 (기존 로직 유지) ── */
  const { data: market   = [] } = useQuery({ queryKey: ['market'],          queryFn: getMarket,       staleTime: 300_000 })
  const { data: usActive = [] } = useQuery({ queryKey: ['most-active-us'],  queryFn: getMostActiveUs, staleTime: 1_800_000 })
  const { data: krActive }      = useQuery({ queryKey: ['most-active-kr'],  queryFn: getMostActiveKr, staleTime: 1_800_000 })
  const { data: sectorUs = [] } = useQuery({ queryKey: ['sector-us'],       queryFn: getSectorUs,     staleTime: 1_800_000 })
  const { data: sectorKr = [] } = useQuery({ queryKey: ['sector-kr'],       queryFn: getSectorKr,     staleTime: 1_800_000 })
  const { data: news     = [] } = useQuery({ queryKey: ['trends-news'],     queryFn: getTrendsNews,   staleTime: 3_600_000 })

  const { data: sectorStocks = [], isFetching: stocksFetching } = useQuery({
    queryKey: ['sector-stocks', selectedSector?.market, selectedSector?.name],
    queryFn:  () => getSectorStocks(selectedSector.market, selectedSector.name),
    enabled:  !!selectedSector,
    staleTime: 3_600_000,
  })

  const krItems = krActive?.items || []

  /* ── Treemap 데이터 ── */
  const usHeatData = sectorUs.length > 0
    ? [{ name:'US', children: sectorUs.map(s => ({ name:s.sector, size:s.weight, pct:s.pct })) }]
    : []
  const krHeatData = sectorKr.length > 0
    ? [{ name:'KR', children: sectorKr.map(s => ({ name:s.sector, size:s.weight, pct:s.pct })) }]
    : []

  /* ── Bar Chart 데이터 (섹터 성과) ── */
  const barData = (activeList === 'us' ? sectorUs : sectorKr)
    .slice(0, 10)
    .map(s => ({ sector: s.sector.replace(' Services','').replace(' Care',''), pct: s.pct ?? 0 }))
    .sort((a, b) => b.pct - a.pct)

  /* ── 섹터 클릭 핸들러 ── */
  const handleSectorClick = (name) => {
    const inUs = sectorUs.some(s => s.sector === name)
    setSelectedSector({ name, market: inUs ? 'us' : 'kr' })
  }
  _onSectorClick = handleSectorClick
  const isUs = selectedSector?.market === 'us'

  return (
    <div className="trends-tab">

      {/* ══════════════════════════════════
          A. Market Headlines (뉴스)
          ══════════════════════════════════ */}
      {news.length > 0 && (
        <div className="tt-card tt-news-card">
          <div className="tt-card-header">
            <div className="tt-card-title">
              <span className="tt-news-live-dot" />
              Market Headlines
            </div>
            <span className="tt-news-count">{news.length}건</span>
          </div>
          <div className="tt-news-grid">
            {news.slice(0, 6).map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noreferrer" className="tt-news-item">
                <div className="tt-news-dot" />
                <div>
                  <div className="tt-news-title">{n.title}</div>
                  <div className="tt-news-pub">{n.publisher}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          B. Market Performance Bar Chart
          ══════════════════════════════════ */}
      <div className="tt-card">
        {/* 헤더 */}
        <div className="tt-card-header">
          <div>
            <div className="tt-card-title">Market Performance</div>
            <div className="tt-card-sub">섹터별 등락률 — {activeList === 'us' ? 'S&P500' : 'KOSPI'}</div>
          </div>
          <div className="tt-header-right">
            {/* US / KR 스위처 — 트렌드 탭 전체에 적용되는 단일 토글 */}
            <div className="tt-seg">
              {['us','kr'].map(v => (
                <button key={v} className={`tt-seg-btn ${activeList===v?'active':''}`}
                  onClick={() => setActiveList(v)}>
                  {v === 'us' ? '🇺🇸 US' : '🇰🇷 KR'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        {barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 8, right: 0, left: -20, bottom: 4 }}
              barCategoryGap="30%">
              <XAxis dataKey="sector" tick={{ fontSize: 9, fill: '#94A3B8', fontWeight: 600 }}
                axisLine={false} tickLine={false} interval={0}
                angle={-30} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v>0?'+':''}${v.toFixed(1)}%`} />
              <Tooltip content={<SectorTooltip />} cursor={{ fill: 'rgba(148,163,184,.08)' }} />
              <Bar dataKey="pct" radius={[3,3,0,0]}>
                {barData.map((d, i) => (
                  <Cell key={i} fill={d.pct >= 0 ? '#22C55E' : '#EF4444'}
                    fillOpacity={Math.abs(d.pct) > 2 ? 1 : 0.65} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="tt-loading">섹터 데이터 로딩 중...</div>
        )}
      </div>

      {/* ══════════════════════════════════
          C. Sector Heatmap (US + KR)
          ══════════════════════════════════ */}
      <div className="tt-heatmap-grid">
        {/* US */}
        <div className="tt-card">
          <div className="tt-card-header">
            <div>
              <div className="tt-card-title">🇺🇸 S&P500 섹터</div>
              <div className="tt-card-sub">섹터 탭 → 시총 Top 10 종목</div>
            </div>
          </div>
          {usHeatData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <Treemap data={usHeatData} dataKey="size" aspectRatio={4/3}
                  isAnimationActive={false} content={<HeatCell />} />
              </ResponsiveContainer>
              <HeatLegend />
            </>
          ) : <div className="tt-loading">로딩 중...</div>}
        </div>

        {/* KR */}
        <div className="tt-card">
          <div className="tt-card-header">
            <div>
              <div className="tt-card-title">🇰🇷 KOSPI 섹터</div>
              <div className="tt-card-sub">섹터 탭 → 시총 Top 10 종목</div>
            </div>
          </div>
          {krHeatData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <Treemap data={krHeatData} dataKey="size" aspectRatio={4/3}
                  isAnimationActive={false} content={<HeatCell />} />
              </ResponsiveContainer>
              <HeatLegend />
            </>
          ) : <div className="tt-loading">로딩 중...</div>}
        </div>
      </div>

      {/* ══════════════════════════════════
          섹터 드릴다운 패널 (기존 로직 유지)
          ══════════════════════════════════ */}
      <div className="tt-drill-wrap" style={{ maxHeight: selectedSector ? 500 : 0 }}>
        {selectedSector && (
          <div className="tt-drill-panel">
            <div className="tt-drill-header">
              <div>
                <div className="tt-drill-title">
                  {selectedSector.market==='us'?'🇺🇸':'🇰🇷'} {selectedSector.name} 섹터
                </div>
                <div className="tt-drill-sub">시가총액 상위 10개 종목</div>
              </div>
              <button className="tt-drill-close" onClick={() => setSelectedSector(null)}>✕ 닫기</button>
            </div>
            {stocksFetching ? (
              <div className="tt-loading">종목 조회 중...</div>
            ) : sectorStocks.length === 0 ? (
              <div className="tt-loading">종목 데이터를 불러오지 못했습니다</div>
            ) : (
              <div className="tt-drill-list">
                {sectorStocks.map((s, i) => (
                  <StockRow key={s.ticker} rank={i + 1}
                    ticker={s.ticker} name={s.name}
                    price={s.price} changePct={s.change_pct} spark={s.spark}
                    isUs={isUs}
                    subRight={isUs && s.market_cap > 0 ? fmtMktCap(s.market_cap) : null}
                    onClick={() => setChartTicker(s.ticker)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════
          D. Top Gainers Asset List
          ══════════════════════════════════ */}
      <div className="tt-card">
        <div className="tt-card-header">
          <div>
            <div className="tt-card-title">거래량 Top 10</div>
            <div className="tt-card-sub">
              {activeList === 'us' ? 'S&P500' : 'KOSPI'} · 위 토글로 시장 변경
            </div>
          </div>
        </div>

        {/* US 목록 */}
        {activeList === 'us' && usActive.slice(0, 10).map((s, i) => (
          <StockRow key={s.ticker} rank={i + 1}
            ticker={s.ticker} name={s.name}
            price={s.price} changePct={s.change_pct} spark={s.spark}
            isUs={true}
            subRight={s.volume ? `거래량 ${fmtVol(s.volume)}` : null}
            onClick={() => setChartTicker(s.ticker)} />
        ))}

        {/* KR 목록 */}
        {activeList === 'kr' && krItems.slice(0, 10).map((s, i) => (
          <StockRow key={s.ticker} rank={i + 1}
            ticker={s.ticker} name={s.name}
            price={s.price} changePct={s.change_pct} spark={s.spark}
            isUs={false}
            subRight={s.volume ? `거래량 ${fmtVol(s.volume)}` : null}
            onClick={() => setChartTicker(s.ticker)} />
        ))}
      </div>

      {/* ── 차트 비교 모드 (B5) ── */}
      <div style={{ marginTop: 18 }}>
        <CompareChart />
      </div>

      {/* ── 실적 캘린더 (B4) ── */}
      <div style={{ marginTop: 12 }}>
        <EarningsCalendar />
      </div>

      {/* ── 한·미 ETF 비교 도구 ── */}
      <div style={{ marginTop: 12 }}>
        <EtfCompare />
      </div>

      <div style={{ height: 24 }} />
    </div>
  )
}

/* ── 범례 ── */
function HeatLegend() {
  return (
    <div className="tt-legend">
      {[['#991B1B','< -4%'],['#EF4444','-2~-4%'],['#FCA5A5','0~-2%'],
        ['#86EFAC','0~+2%'],['#4ADE80','+2~+4%'],['#15803D','> +4%'],
      ].map(([col, label]) => (
        <div key={label} className="tt-legend-item">
          <div style={{ width: 9, height: 9, borderRadius: 2, background: col }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { getStock, getNews, searchStocks, getPortfolio, getFundamentals, getPeers, analyzeStock, getCachedAnalysis, getFinancialsTrend, authMe } from '../api'
import { useStore } from '../store'
import { useDragScroll } from '../hooks/useDragScroll'
import { displayName, isKrTicker } from '../utils/displayName'
import NumberTicker from '../components/NumberTicker'
import BorderBeam from '../components/BorderBeam'
import TransactionsSection from '../components/TransactionsSection'
import AlertSetSheet from '../components/AlertSetSheet'
import {
  ResponsiveContainer, ComposedChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Bar, Cell,
} from 'recharts'
import './ChartTab.css'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// 기본 포맷 (툴팁 등): "Apr 29, '26"
function fmtDate(d) {
  if (!d) return ''
  const p = String(d).split('-')
  if (p.length < 3) return d
  return `${MONTHS[parseInt(p[1],10)-1]} ${parseInt(p[2],10)}, '${p[0].slice(2)}`
}

// 캐시된 분석 시각을 사람이 읽기 쉬운 상대 시간으로 ("3시간 전", "어제", "5월 8일")
function formatRelativeTime(epochSec) {
  if (!epochSec) return ''
  const now = Date.now() / 1000
  const diff = now - epochSec
  if (diff < 60)        return '방금 전'
  if (diff < 3600)      return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 2) return '어제'
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  const d = new Date(epochSec * 1000)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/* ── X축 라벨 — 기간별 Best Practice ──
 *   1M  → "M/D"      예: 4/29 (주간)
 *   3M  → "M/D"      예: 4/15 (격주)
 *   6M  → "MMM"      예: Apr  (월간)
 *   1Y  → "MMM"      예: Apr  (격월), 연 경계는 "MMM 'YY"
 *   2Y  → "MMM 'YY"  예: Apr '26 (분기)
 *   5Y  → "'YY"      예: '26 (반기, 연 경계만 강조)
 */
function fmtXTick(d, range) {
  if (!d) return ''
  const p = String(d).split('-')
  if (p.length < 3) return d
  const [yyyy, mm, dd] = p
  const m = parseInt(mm, 10) - 1
  const day = parseInt(dd, 10)
  const yy2 = yyyy.slice(2)

  if (range === '1M' || range === '3M') return `${m + 1}/${day}`
  if (range === '6M') return MONTHS[m]
  if (range === '1Y') return m === 0 ? `${MONTHS[m]} '${yy2}` : MONTHS[m]
  if (range === '2Y') return `${MONTHS[m]} '${yy2}`
  if (range === '5Y') return `'${yy2}`
  return `${MONTHS[m]} ${day}`
}

// 기간별 추천 X축 tick 개수 — Best Practice: 5~7개로 제한
const TICK_COUNT = { '1M': 5, '3M': 6, '6M': 6, '1Y': 6, '2Y': 6, '5Y': 6 }
function fmtMktCap(v) {
  if (!v || v <= 0) return null
  if (v >= 1e12) return `$${(v/1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v/1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v/1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}

const RANGES = [
  { label: '1M', days: 21 },
  { label: '3M', days: 63 },
  { label: '6M', days: 126 },
  { label: '1Y', days: 252 },
  { label: '2Y', days: 504 },
  { label: '5Y', days: 9999 },
]

/* ── 시간 스케일 집계: 일봉(D) → 주봉(W) → 월봉(M) ──
 *   주봉: ISO 주차 (월요일 시작) 기준 그룹화
 *   월봉: YYYY-MM 기준 그룹화
 *   각 봉의 OHLC: open=첫 일봉의 open, close=마지막 일봉의 close,
 *                high=구간 최고가, low=구간 최저가, volume=합산
 *   MA/RSI는 마지막 일봉 값 사용 (간이 처리)
 */
function aggregateOHLC(daily, level) {
  if (level === 'D' || !daily?.length) return daily || []
  const groups = new Map()
  const order = []
  for (const d of daily) {
    if (!d?.date) continue
    let key
    if (level === 'W') {
      const dt = new Date(d.date + 'T00:00:00')
      const dow = dt.getDay()              // 일=0, 월=1, ..., 토=6
      const offset = (dow + 6) % 7         // 월요일=0
      dt.setDate(dt.getDate() - offset)
      key = dt.toISOString().slice(0, 10)
    } else {
      key = d.date.slice(0, 7) + '-01'     // YYYY-MM-01
    }
    if (!groups.has(key)) { groups.set(key, []); order.push(key) }
    groups.get(key).push(d)
  }
  return order.map(key => {
    const items = groups.get(key)
    const first = items[0]
    const last  = items[items.length - 1]
    const highs = items.map(x => x.high).filter(v => v != null)
    const lows  = items.map(x => x.low).filter(v => v != null)
    const vols  = items.map(x => x.volume).filter(v => v != null && v > 0)
    return {
      date:   key,
      open:   first.open,
      close:  last.close,
      high:   highs.length ? Math.max(...highs) : last.high,
      low:    lows.length  ? Math.min(...lows)  : last.low,
      volume: vols.length  ? vols.reduce((s, v) => s + v, 0) : null,
      ma20:   last.ma20,
      ma60:   last.ma60,
      ma120:  last.ma120,
      rsi:    last.rsi,
    }
  })
}

/* ── 순수 SVG 캔들스틱 차트 (드래그 줌 지원) ── */
function CandlestickChart({ data, isUs, maVis, range = '1Y', height = 240, onZoom, onResetZoom }) {
  const containerRef = useRef(null)
  const svgRef       = useRef(null)
  const [width, setWidth] = useState(0)
  const [tooltip, setTooltip] = useState(null)
  // 드래그 줌 상태: { startX, currentX } — null이면 비활성
  const [dragSel, setDragSel] = useState(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  if (!data.length) return <div ref={containerRef} style={{ height }} />

  const PAD = { top: 8, right: 52, bottom: 26, left: 4 }
  const W = Math.max(1, (width || 600) - PAD.left - PAD.right)
  const H = height - PAD.top - PAD.bottom

  const allPrices = data.flatMap(d => [
    d.high, d.low,
    maVis?.ma20 && d.ma20,
    maVis?.ma60 && d.ma60,
    maVis?.ma120 && d.ma120,
  ].filter(v => v != null && v > 0))
  if (!allPrices.length) return <div ref={containerRef} style={{ height }} />

  const minY = Math.min(...allPrices) * 0.997
  const maxY = Math.max(...allPrices) * 1.003
  const yRange = maxY - minY || 1

  const n = data.length
  const slotW = W / n
  const barW = Math.max(1.5, Math.min(12, slotW * 0.65))
  const xOf = i => PAD.left + (i + 0.5) * slotW
  const yOf = v => PAD.top + H - (v - minY) / yRange * H

  const Y_N = 5
  const yTicks = Array.from({ length: Y_N }, (_, i) => minY + yRange * i / (Y_N - 1))

  // X축 tick: 1M·3M → 주간 (5거래일), 6M → 월간, 1Y/2Y/5Y → 등간격 ~6개
  const targetTicks = TICK_COUNT[range] || 6
  const xTicks = []
  if ((range === '1M' || range === '3M') && n > 0) {
    // 주간 간격 (5 trading days)
    const step = range === '1M' ? 5 : 10
    for (let i = step - 1; i < n; i += step) xTicks.push(i)
    if (xTicks.length === 0 || xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1)
    if (xTicks[0] > 2) xTicks.unshift(0)
  } else if (range === '6M' && n > 0) {
    // 월별 첫 거래일 마킹
    let prevMonth = -1
    for (let i = 0; i < n; i++) {
      const d = String(data[i].date)
      const m = d.length >= 7 ? parseInt(d.slice(5, 7), 10) : -1
      if (m !== prevMonth) { xTicks.push(i); prevMonth = m }
    }
    // 라벨 너무 많으면 솎아내기
    while (xTicks.length > targetTicks + 1) {
      xTicks.splice(1 + Math.floor((xTicks.length - 2) / 2), 1)
    }
  } else {
    // 1Y/2Y/5Y: 균등 분할
    const step = Math.max(1, Math.floor(n / targetTicks))
    for (let i = 0; i < n; i += step) xTicks.push(i)
    if (xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1)
  }

  // Y축 — Best Practice: 가격 범위에 맞는 자동 자릿수
  const fmtY = v => {
    if (isUs) {
      if (v >= 1e6)  return `$${(v/1e6).toFixed(2)}M`
      if (v >= 1e3)  return `$${(v/1e3).toFixed(1)}K`
      if (v >= 100)  return `$${v.toFixed(0)}`
      return `$${v.toFixed(2)}`
    }
    if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`
    if (v >= 1e4) return `${(v/1e3).toFixed(0)}K`
    if (v >= 1e3) return `${(v/1e3).toFixed(1)}K`
    return v.toFixed(0)
  }

  const MA_COLORS = { ma20: '#F59E0B', ma60: '#10B981', ma120: '#8B5CF6' }

  /* ── 드래그 줌: SVG 좌표 → 데이터 인덱스 변환 ── */
  const xToIndex = (x) => {
    const local = Math.max(PAD.left, Math.min(PAD.left + W, x))
    const idx = Math.round((local - PAD.left) / slotW - 0.5)
    return Math.max(0, Math.min(n - 1, idx))
  }
  const handleMouseDown = (e) => {
    if (!onZoom) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < PAD.left || x > PAD.left + W) return
    setDragSel({ startX: x, currentX: x })
    setTooltip(null)
  }
  const handleMouseMove = (e) => {
    if (!dragSel) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = Math.max(PAD.left, Math.min(PAD.left + W, e.clientX - rect.left))
    setDragSel(s => ({ ...s, currentX: x }))
  }
  const handleMouseUp = () => {
    if (!dragSel || !onZoom) { setDragSel(null); return }
    const { startX, currentX } = dragSel
    const dx = Math.abs(currentX - startX)
    if (dx < 8) { setDragSel(null); return }   // 작은 클릭은 무시
    const i1 = xToIndex(Math.min(startX, currentX))
    const i2 = xToIndex(Math.max(startX, currentX))
    if (i2 - i1 >= 2) onZoom(i1, i2)
    setDragSel(null)
  }
  const handleMouseLeaveSvg = () => {
    if (dragSel) setDragSel(null)
    setTooltip(null)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width={width || '100%'} height={height}
        style={{ display: 'block', cursor: onZoom ? (dragSel ? 'col-resize' : 'crosshair') : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeaveSvg}
        onDoubleClick={() => onResetZoom && onResetZoom()}
      >
        {/* Grid */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.left} y1={yOf(t)} x2={PAD.left + W} y2={yOf(t)}
            stroke="var(--clr-border)" strokeWidth={1} />
        ))}

        {/* Candles */}
        {data.map((d, i) => {
          if (d.open == null || d.close == null || d.high == null || d.low == null) return null
          const isUp = d.close >= d.open
          const col = isUp ? '#22C55E' : '#EF4444'
          const cx = xOf(i)
          const yH = yOf(d.high)
          const yL = yOf(d.low)
          const yO = yOf(d.open)
          const yC = yOf(d.close)
          const bodyTop = Math.min(yO, yC)
          const bodyH = Math.max(1, Math.abs(yO - yC))
          return (
            <g key={i} style={{ cursor: 'crosshair' }}
              onMouseEnter={() => { if (!dragSel) setTooltip({ d, cx, cy: bodyTop, isUp }) }}
              onMouseLeave={() => setTooltip(null)}>
              {/* Wick */}
              <line x1={cx} y1={yH} x2={cx} y2={yL} stroke={col} strokeWidth={1} />
              {/* Body */}
              <rect x={cx - barW/2} y={bodyTop} width={barW} height={bodyH} fill={col} />
              {/* Wide hit area */}
              <rect x={cx - Math.max(5, slotW/2)} y={yH - 4}
                width={Math.max(10, slotW)} height={yL - yH + 8} fill="transparent" />
            </g>
          )
        })}

        {/* MA lines */}
        {Object.entries(MA_COLORS).map(([maKey, color]) => {
          if (!maVis?.[maKey]) return null
          const segments = []
          let seg = []
          data.forEach((d, i) => {
            if (d[maKey] != null) {
              seg.push(`${xOf(i).toFixed(1)},${yOf(d[maKey]).toFixed(1)}`)
            } else if (seg.length) {
              segments.push(seg); seg = []
            }
          })
          if (seg.length) segments.push(seg)
          return segments.map((s, si) => (
            <polyline key={`${maKey}-${si}`} points={s.join(' ')}
              fill="none" stroke={color} strokeWidth={1.8} />
          ))
        })}

        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD.left + W + 4} y={yOf(t)} fontSize={10} fill="#94A3B8"
            dominantBaseline="middle">{fmtY(t)}</text>
        ))}

        {/* X axis labels */}
        {xTicks.map(i => (
          data[i] ? (
            <text key={i} x={xOf(i)} y={height - 2} fontSize={10} fill="var(--clr-text-muted)"
              textAnchor="middle">{fmtXTick(data[i].date, range)}</text>
          ) : null
        ))}

        {/* 드래그 줌 selection 사각형 */}
        {dragSel && (
          <rect
            x={Math.min(dragSel.startX, dragSel.currentX)}
            y={PAD.top}
            width={Math.abs(dragSel.currentX - dragSel.startX)}
            height={H}
            fill="var(--clr-info)"
            fillOpacity={0.12}
            stroke="var(--clr-info)"
            strokeOpacity={0.4}
            strokeDasharray="3,3"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
      </svg>

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          top: Math.max(0, tooltip.cy - 100),
          left: tooltip.cx > (width || 600) / 2 ? tooltip.cx - 140 : tooltip.cx + 10,
          background: '#0F172A', borderRadius: 8, padding: '8px 12px',
          pointerEvents: 'none', zIndex: 10, minWidth: 130,
        }}>
          <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginBottom: 4 }}>{fmtDate(tooltip.d.date)}</div>
          {[['시가', tooltip.d.open],['고가', tooltip.d.high],['저가', tooltip.d.low],['종가', tooltip.d.close]].map(([k,v]) => (
            <div key={k} style={{ fontSize: 12, color: '#E2E8F0', display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--clr-text-sub)', minWidth: 24 }}>{k}</span>
              {v == null ? '—' : isUs ? `$${Number(v).toFixed(2)}` : `₩${Math.round(v).toLocaleString()}`}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 메인 컴포넌트 ── */
export default function ChartTab() {
  const chartTicker     = useStore(s => s.chartTicker)
  const hasAnthropicKey = useStore(s => s.hasAnthropicKey)
  const currentUser     = useStore(s => s.currentUser)
  const authToken       = useStore(s => s.authToken)
  const setAuth         = useStore(s => s.setAuth)
  const aiEnabled       = !!currentUser?.ai_enabled || !!currentUser?.is_admin
  // Tier 0/1/2: 캐시 열람은 전 유저 무료. 신규 생성은 Tier1 월 쿼터 or Tier2 무제한.
  const aiQuota         = currentUser?.ai_quota
  const quotaLeft       = aiQuota?.remaining
  const canAnalyze      = aiEnabled || !!aiQuota?.unlimited ||
                          (quotaLeft == null ? true : quotaLeft > 0)

  // chartTicker로 즉시 초기화 → 탭 전환 시 쿼리가 첫 렌더부터 발동
  const [inputVal,     setInputVal]     = useState(chartTicker || '')
  const [activeTicker, setActiveTicker] = useState(chartTicker || '')
  const [searchQ,      setSearchQ]      = useState('')
  const [showDrop,     setShowDrop]     = useState(false)
  const [alertSheetOpen, setAlertSheetOpen] = useState(false)
  const [maVis,        setMaVis]        = useState({ ma20: true, ma60: true, ma120: false })
  const [rangeOpt,     setRangeOpt]     = useState('1Y')  // 기본 1Y (전체 데이터는 5Y까지)
  const [scaleOpt,     setScaleOpt]     = useState('D')   // 'D' | 'W' | 'M' — 캔들 집계 단위
  const [zoomRange,    setZoomRange]    = useState(null)  // null 또는 [startIdx, endIdx] (집계된 데이터 기준)
  // (showFund/showPeers 제거됨 — 항상 펼침)
  const [aiResult,     setAiResult]     = useState(null)
  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiError,      setAiError]      = useState('')
  const [aiComputedAt, setAiComputedAt] = useState(0)     // epoch (캐시 시각)
  const [aiFromCache,  setAiFromCache]  = useState(false) // 캐시에서 불러온 결과인지
  const inputRef = useRef(null)
  const dropRef  = useRef(null)
  const holdingsScrollRef = useDragScroll()
  // 캐시 fetch 가드 — 동일 (ticker, name) 중복 호출 방지로 effect 무한 루프 차단
  const cacheFetchRef = useRef({ ticker: '', name: '' })

  useEffect(() => {
    function h(e) {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // chartTicker가 외부에서 변경될 때 동기화 (다른 탭에서 클릭)
  useEffect(() => {
    if (chartTicker && chartTicker !== activeTicker) {
      setActiveTicker(chartTicker)
      setInputVal(chartTicker)
      setShowDrop(false)
      setAiResult(null)
      setAiError('')
      setAiComputedAt(0)
      setAiFromCache(false)
      setRangeOpt('1Y')
      setScaleOpt('D')
      setZoomRange(null)
      if (cacheFetchRef.current) cacheFetchRef.current = { ticker: '', name: '' }
    }
  // activeTicker 를 의존성에 포함하면 루프 발생 → 의도적으로 제외
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTicker])

  // range 또는 scale 바꾸면 zoom 해제
  useEffect(() => { setZoomRange(null) }, [rangeOpt, scaleOpt, activeTicker])

  const [debouncedQ, setDebouncedQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 350)
    return () => clearTimeout(t)
  }, [searchQ])

  const { data: searchResults = [] } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => searchStocks(debouncedQ),
    enabled: debouncedQ.length >= 1,
  })

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })
  const allHoldings = React.useMemo(() => {
    if (!portfolio?.portfolios) return []
    // 동적 계좌 — API 응답의 모든 키 순회 (사용자별 정의된 계좌)
    const accs = Object.keys(portfolio.portfolios)
    const seen = new Set(); const result = []
    for (const acc of accs)
      for (const h of portfolio.portfolios?.[acc] || [])
        if (!seen.has(h.ticker)) { seen.add(h.ticker); result.push(h) }
    return result
  }, [portfolio])

  // activeTicker 변경 시 캐시된 분석을 자동으로 미리 보여주기 (분석 트리거 안 함).
  // ⚠ portfolio 선언 이후에 위치해야 함 (TDZ 회피).
  // ⚠ 무한 루프 방지를 위해 deps는 *원시 값*만 사용. portfolio 객체를 deps에 넣으면
  //    React Query background refetch 시마다 새 참조 → effect 재실행 → setState → 무한 루프.
  const portfolioReady = !!portfolio
  useEffect(() => {
    if (!activeTicker) return
    const accs = Object.keys(portfolio?.portfolios || {})
    let owned = null
    for (const a of accs) {
      const list = portfolio?.portfolios?.[a] || []
      const f = list.find(h => h.ticker === activeTicker)
      if (f) { owned = f; break }
    }
    const watched = (portfolio?.watchlist || []).find(w => w.ticker === activeTicker)
    const knownName = owned?.name || watched?.name || ''

    if (cacheFetchRef.current.ticker === activeTicker
        && cacheFetchRef.current.name === knownName) return
    cacheFetchRef.current = { ticker: activeTicker, name: knownName }

    let aborted = false
    ;(async () => {
      try {
        const cached = await getCachedAnalysis(activeTicker, knownName)
        if (aborted) return
        if (cacheFetchRef.current.ticker !== activeTicker) return
        if (cached?.cached && cached.data) {
          setAiResult(cached.data)
          setAiComputedAt(cached.computed_at || 0)
          setAiFromCache(true)
          setAiError('')
        }
      } catch (_) { /* 캐시 조회 실패는 조용히 무시 */ }
    })()
    return () => { aborted = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker, portfolioReady])

  const { data: stockData, isLoading, isError, error: stockError, refetch } = useQuery({
    queryKey: ['stock', activeTicker],
    queryFn: () => getStock(activeTicker),
    enabled: !!activeTicker,
    staleTime: 120_000,
    retry: 1,
    retryDelay: 2000,
  })
  const { data: newsData } = useQuery({
    queryKey: ['news', activeTicker],
    queryFn: () => getNews(activeTicker),
    enabled: !!activeTicker, staleTime: 1_800_000, retry: 0,
  })
  // Valuation / 동종업계 — 종목 진입 즉시 자동 fetch (항상 펼침으로 변경됨)
  const fundReady = !!activeTicker && !/^\^/.test(activeTicker)
    && !activeTicker.endsWith('=X') && !activeTicker.endsWith('-USD')
    && (/^[A-Z]/.test(activeTicker) || /^A?\d[0-9A-Z]{5}$/.test(activeTicker))   // US + KR 모두
  const { data: fundamentals, isLoading: fundLoading } = useQuery({
    queryKey: ['fundamentals', activeTicker],
    queryFn: () => getFundamentals(activeTicker),
    enabled: fundReady,
    staleTime: 3_600_000, retry: 0,
  })
  const { data: peers = [], isLoading: peersLoading } = useQuery({
    queryKey: ['peers', activeTicker],
    queryFn: () => getPeers(activeTicker),
    enabled: fundReady,
    staleTime: 3_600_000, retry: 0,
  })
  const { data: finTrend } = useQuery({
    queryKey: ['financials-trend', activeTicker],
    queryFn: () => getFinancialsTrend(activeTicker),
    enabled: !!activeTicker && !/^\^/.test(activeTicker) && !activeTicker.endsWith('=X') && !activeTicker.endsWith('-USD'),
    staleTime: 3_600_000, retry: 0,
  })

  function selectTicker(ticker) {
    const t = ticker.trim().toUpperCase()
    setActiveTicker(t); setInputVal(t); setSearchQ(''); setShowDrop(false)
    setAiResult(null); setAiError('')
    setAiComputedAt(0); setAiFromCache(false)
    cacheFetchRef.current = { ticker: '', name: '' }   // 새 티커 — fetch 가드 리셋
  }
  function handleKeyDown(e) { if (e.key === 'Enter') selectTicker(inputVal) }
  function handleInputChange(e) {
    const v = e.target.value; setInputVal(v); setSearchQ(v); setShowDrop(v.length >= 1)
  }

  async function handleAiAnalyze(forceRefresh = false) {
    if (!activeTicker) return
    if (!hasAnthropicKey) { setAiError('API Key를 입력해주세요'); return }
    if (forceRefresh) {
      const ok = window.confirm(
        `${displayName(activeTicker, stockData?.short_name)} 분석을 최신 데이터로 다시 실행할까요?\n` +
        `웹 검색 + AI 분석에 30~90초가 소요됩니다.`
      )
      if (!ok) return
    }
    setAiLoading(true); setAiError('')
    if (forceRefresh) setAiResult(null)
    try {
      // 환각 방지: 보유/관심 목록의 종목명을 백엔드에 전달
      const owned   = allHoldings.find(h => h.ticker === activeTicker)
      const watched = (portfolio?.watchlist || []).find(w => w.ticker === activeTicker)
      const knownName = owned?.name || watched?.name || stockData?.short_name || ''
      const result = await analyzeStock(activeTicker, { name: knownName, force_refresh: forceRefresh })
      setAiResult(result)
      setAiComputedAt(result?._computed_at || (Date.now() / 1000))
      setAiFromCache(!!result?._cached)
      // 신규 생성(캐시 미스)이면 쿼터가 차감됐으므로 잔여량 갱신
      if (!result?._cached && !aiEnabled) {
        try { const me = await authMe(); setAuth(authToken, me) } catch { /* 표시용 — 실패 무시 */ }
      }
    } catch (e) {
      setAiError(e.response?.data?.detail || e.message || '분석 실패')
    } finally {
      setAiLoading(false)
    }
  }

  const isKr     = /^A?\d[0-9A-Z]{5}$/.test(activeTicker)
  const isUs     = !isKr
  const isIndex  = /^\^/.test(activeTicker)           // ^GSPC, ^VIX, ^KS11 등
  const isForex  = activeTicker.endsWith('=X')        // KRW=X 등
  const isBond   = activeTicker === '^TNX' || activeTicker === '^FVX' || activeTicker === '^IRX'
  const isCrypto = activeTicker.endsWith('-USD') && !activeTicker.startsWith('^')

  const rawHist = (stockData?.hist || []).filter(d => d.close != null)
  const rangeDays = RANGES.find(r => r.label === rangeOpt)?.days ?? 9999
  const rangedHist = rangeDays >= 9999 ? rawHist : rawHist.slice(-rangeDays)

  // 시간 스케일 집계: D(원본) | W(주간) | M(월간)
  const scaledHist = React.useMemo(
    () => aggregateOHLC(rangedHist, scaleOpt),
    [rangedHist, scaleOpt],
  )

  // 줌: 집계된 데이터 기준 인덱스 범위
  const hist = zoomRange
    ? scaledHist.slice(zoomRange[0], zoomRange[1] + 1)
    : scaledHist

  const cur    = stockData?.current_price
  const chgPct = stockData?.change_pct ?? 0
  const up     = chgPct >= 0

  // 가격 포맷 (지수/채권/환율/코인 구분)
  function fmtCur(v) {
    if (v == null) return '—'
    if (isKr)     return `₩${Math.round(v).toLocaleString()}`
    if (isBond)   return `${v.toFixed(2)}%`
    if (isForex)  return `₩${Math.round(v).toLocaleString()}`
    if (isIndex && activeTicker === '^KS11') return v.toFixed(0)
    if (v >= 10000) return `$${Math.round(v).toLocaleString()}`
    if (v >= 100)   return `$${v.toFixed(2)}`
    return `$${v.toFixed(2)}`
  }

  return (
    <div className="chart-tab" onClick={() => setShowDrop(false)}>
      {/* 검색창 */}
      <div className="chart-search-wrap" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="input"
          placeholder="종목 검색 (AAPL, 005930, 애플...)"
          value={inputVal}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => inputVal.length >= 1 && setShowDrop(true)}
          autoCapitalize="characters"
        />
        {showDrop && searchResults.length > 0 && (
          <div ref={dropRef} className="chart-dropdown">
            {searchResults.slice(0, 8).map(r => (
              <div key={r.symbol} className="chart-drop-item"
                onMouseDown={() => selectTicker(r.symbol)}>
                <span style={{ fontWeight: 700, color: 'var(--clr-text-strong)', minWidth: 60 }}>{r.symbol}</span>
                <span style={{ color: 'var(--clr-text-muted)', fontSize: 12 }}>{r.shortname}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 보유 종목 빠른 선택 */}
      {allHoldings.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>보유 종목</div>
          <div ref={holdingsScrollRef} style={{
              display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
              scrollbarWidth: 'none', msOverflowStyle: 'none',
              cursor: 'grab', userSelect: 'none',
            }}>
            {allHoldings.map(h => (
              <button key={h.ticker} onClick={() => selectTicker(h.ticker)}
                title={`${h.ticker}${h.name ? ` · ${h.name}` : ''}`}
                style={{
                  flexShrink: 0, padding: '4px 10px', borderRadius: 4, border: '1px solid',
                  borderColor: activeTicker === h.ticker ? 'var(--clr-info)' : 'var(--clr-border-md)',
                  background: activeTicker === h.ticker ? 'var(--clr-info-bg)' : 'var(--clr-surface)',
                  color: activeTicker === h.ticker ? 'var(--clr-info-dark)' : 'var(--clr-text-sub)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}>{displayName(h.ticker, h.name)}</button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <div className="spinner" style={{ marginTop: 40 }} />}
      {isError && !isLoading && (
        <StockErrorPanel ticker={activeTicker} error={stockError} onRetry={() => refetch()} />
      )}
      {!activeTicker && !isLoading && (
        <div className="empty-state">
          <div className="empty-icon">📈</div>
          <div>종목을 검색하거나 보유/관심 탭에서 📈 버튼을 누르세요</div>
        </div>
      )}

      {stockData && !isError && (
        <div onClick={e => e.stopPropagation()}>
          {/* stale 데이터 사용 중 안내 — 데이터 신뢰성 명시 */}
          {stockData._data_status === 'stale' && stockData._data_message && (
            <div className="ko-keep" style={{
              padding: '8px 12px', marginBottom: 10,
              background: 'var(--m-surface-variant)',
              border: '1px solid var(--m-outline-variant)', borderRadius: 4,
              fontSize: 11.5, color: 'var(--m-text-secondary)',
              lineHeight: 1.6,
            }}>
              <strong style={{ color: '#B45309', fontWeight: 800,
                marginRight: 6 }}>실시간 X</strong>
              {stockData._data_message}
            </div>
          )}
          {/* Apple Stocks 풍 hero — 큰 가격 + 변동 + 미니 sparkline + 일중 차트 */}
          <AppleStocksHero
            stockData={stockData}
            cur={cur}
            chgPct={chgPct}
            up={up}
            fmtCur={fmtCur}
            isKr={isKr}
            isIndex={isIndex}
            isCrypto={isCrypto}
            isUs={isUs}
            activeTicker={activeTicker}
            sparkValues={scaledHist.slice(-50).map(d => d.close).filter(c => c != null)}
            onOpenAlerts={() => setAlertSheetOpen(true)}
          />
          {alertSheetOpen && (
            <AlertSetSheet
              ticker={activeTicker}
              name={stockData?.short_name || activeTicker}
              currentPrice={cur}
              isUs={!isKr}
              onClose={() => setAlertSheetOpen(false)}
            />
          )}

          {/* 52주 바 — 개별 주식만 표시 (지수/코인/환율 제외) */}
          {isUs && !isIndex && !isForex && !isBond && stockData.week_52_high && stockData.week_52_low && (
            <WeekBar cur={cur} low={stockData.week_52_low} high={stockData.week_52_high} isUs={isUs} />
          )}

          {/* Range + Scale + MA 토글 */}
          {scaledHist.length > 0 && (
            <div style={{ display: 'flex', gap: 6, margin: '12px 0 8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* 기간 */}
              <div className="seg-ctrl" style={{ flex: 'none' }}>
                {RANGES.map(r => (
                  <button key={r.label}
                    className={`seg-btn ${rangeOpt === r.label ? 'active' : ''}`}
                    onClick={() => setRangeOpt(r.label)}
                    style={{ minWidth: 36 }}>{r.label}</button>
                ))}
              </div>
              {/* 시간 스케일 — 일/주/월간 */}
              <div className="seg-ctrl" style={{ flex: 'none' }}>
                {[['D','일'],['W','주'],['M','월']].map(([k, label]) => (
                  <button key={k}
                    className={`seg-btn ${scaleOpt === k ? 'active' : ''}`}
                    onClick={() => setScaleOpt(k)}
                    title={`${label}봉`}
                    style={{ minWidth: 32 }}>{label}</button>
                ))}
              </div>
              {/* 이동평균 */}
              <div className="seg-ctrl" style={{ flex: 'none' }}>
                {[['ma20','MA20'],['ma60','MA60'],['ma120','MA120']].map(([k, label]) => (
                  <button key={k} className={`seg-btn ${maVis[k] ? 'active' : ''}`}
                    onClick={() => setMaVis(p => ({ ...p, [k]: !p[k] }))}>{label}</button>
                ))}
              </div>
              {/* 줌 리셋 — 줌 활성 시에만 노출 */}
              {zoomRange && (
                <button onClick={() => setZoomRange(null)}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: '1px solid var(--clr-info-border)',
                    background: 'var(--clr-info-bg)', color: 'var(--clr-info-dark)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}>↺ 줌 리셋</button>
              )}
              <span style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>
                차트 드래그로 확대 · 더블클릭 리셋
              </span>
            </div>
          )}

          {/* 캔들스틱 차트 (순수 SVG, 드래그 줌) */}
          {hist.length > 0 && (
            <div className="chart-card">
              <CandlestickChart data={hist} isUs={isUs} maVis={maVis}
                range={rangeOpt} height={240}
                onZoom={(i1, i2) => {
                  // 현재 표시 데이터 기준 인덱스 → scaledHist 절대 인덱스로 변환
                  const base = zoomRange ? zoomRange[0] : 0
                  setZoomRange([base + i1, base + i2])
                }}
                onResetZoom={() => setZoomRange(null)} />
            </div>
          )}

          {/* 거래량 */}
          {hist.length > 0 && (
            <div className="chart-card">
              <div className="chart-sub-title">거래량</div>
              <ResponsiveContainer width="100%" height={70}>
                <ComposedChart data={hist} margin={{ top: 0, right: 52, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip formatter={v => v?.toLocaleString()} labelFormatter={fmtDate} />
                  <Bar dataKey="volume" isAnimationActive={false} name="거래량"
                    shape={(props) => {
                      const { x, y, width, height, payload } = props
                      const isUpBar = (payload?.close ?? 0) >= (payload?.open ?? 0)
                      return <rect x={x} y={y} width={Math.max(1, width)} height={height}
                        fill={isUpBar ? '#86EFAC' : '#FCA5A5'} />
                    }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* RSI */}
          {hist.some(d => d.rsi != null) && (
            <div className="chart-card">
              <div className="chart-sub-title">RSI (14)</div>
              <ResponsiveContainer width="100%" height={90}>
                <ComposedChart data={hist} margin={{ top: 4, right: 52, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }}
                    tickFormatter={fmtDate} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94A3B8' }} width={28} />
                  <Tooltip formatter={v => v != null ? `${v.toFixed(1)}` : '—'} labelFormatter={fmtDate} />
                  <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="4 3" strokeWidth={1.2}
                    label={{ value: '70', position: 'insideTopRight', fontSize: 9, fill: '#EF4444' }} />
                  <ReferenceLine y={30} stroke="#22C55E" strokeDasharray="4 3" strokeWidth={1.2}
                    label={{ value: '30', position: 'insideBottomRight', fontSize: 9, fill: '#22C55E' }} />
                  <Line type="monotone" dataKey="rsi" stroke="#EC4899"
                    dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 애널리스트 목표가 — 개별 주식만 표시 */}
          {isUs && !isIndex && !isForex && !isBond && stockData.target_mean && (
            <AnalystBar cur={cur} low={stockData.target_low}
              high={stockData.target_high} avg={stockData.target_mean}
              rec={stockData.recommendation} analysts={stockData.num_analysts} />
          )}

          {/* 주요 지표 */}
          <div className="chart-card" style={{ marginBottom: 12 }}>
            {[
              ['52주 고가', stockData.week_52_high != null
                ? (isUs ? `$${stockData.week_52_high.toFixed(2)}` : `₩${Math.round(stockData.week_52_high).toLocaleString()}`)
                : null],
              ['52주 저가', stockData.week_52_low != null
                ? (isUs ? `$${stockData.week_52_low.toFixed(2)}`  : `₩${Math.round(stockData.week_52_low).toLocaleString()}`)
                : null],
              ['거래량', stockData.volume != null ? stockData.volume.toLocaleString() : null],
              ['시가총액', fmtMktCap(stockData.market_cap)],
              ['P/E', stockData.pe_ratio > 0 ? stockData.pe_ratio.toFixed(2) : null],
              ['섹터', stockData.sector && stockData.sector !== 'N/A' ? stockData.sector : null],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} className="metric-row">
                <span className="metric-label">{label}</span>
                <span className="metric-value">{val}</span>
              </div>
            ))}
          </div>

          {/* AI 투자 분석 */}
          <div className="chart-card" style={{ marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
            {aiLoading && (
              <BorderBeam
                size={220}
                duration={5}
                colorFrom="var(--clr-info)"
                colorTo="var(--clr-ai)"
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', display: 'flex', alignItems: 'center', gap: 7 }}><SqMark size={9} /> AI 투자 분석</div>
              <span style={{ fontSize: 10, color: 'var(--clr-text-muted)',
                background: 'var(--clr-bg)', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                🌐 실시간 웹 검색
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 10, lineHeight: 1.55 }}>
              회사 동향 · 분기 실적 · CEO 발언 · 단기/중기 호재 · 애널리스트 보고서를 실시간 조사 (30~90초 소요)
            </div>
            {!hasAnthropicKey && (
              <div style={{ marginBottom: 8, padding: '7px 10px', background: 'var(--clr-warn-bg)',
                borderRadius: 4, fontSize: 11, color: 'var(--clr-warn-dark)', border: '1px solid #FED7AA' }}>
                ⚙️ 관리 탭에서 API Key를 먼저 입력해주세요
              </div>
            )}
            {hasAnthropicKey && !aiEnabled && aiQuota && !aiQuota.unlimited && (
              <div className="ko-keep" style={{ marginBottom: 8, padding: '7px 10px',
                background: quotaLeft > 0 ? 'var(--m-surface-variant)' : 'var(--clr-warn-bg)',
                borderRadius: 4, fontSize: 11,
                color: quotaLeft > 0 ? 'var(--m-text-secondary)' : 'var(--clr-warn-dark)',
                border: quotaLeft > 0 ? '1px solid var(--m-outline-variant)' : '1px solid #FED7AA' }}>
                {quotaLeft > 0
                  ? `💡 이번 달 무료 AI 종목 분석 ${quotaLeft}/${aiQuota.limit}건 남음 · 이미 분석된 종목 열람은 무제한`
                  : `🔒 이번 달 무료 AI 종목 분석 한도(${aiQuota.limit}건)를 모두 사용했습니다 — 이미 분석된 종목은 계속 열람 가능 · 무제한은 관리자에게 요청`}
              </div>
            )}

            {/* 캐시된 분석 있으면 → 좌측 색띠 + 시각 + 업데이트 버튼 (음영 없음).
                없으면 → 일반 "심층 분석" 버튼. 사용자가 버튼 누르기 전에
                마지막 분석 결과를 우선 볼 수 있음. */}
            {aiResult && !aiLoading ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--m-surface-variant)',
                border: '1px solid var(--m-outline-variant)', borderRadius: 4,
                gap: 10, flexWrap: 'wrap',
              }}>
                <div style={{ fontSize: 11.5, color: 'var(--m-text-secondary)',
                  lineHeight: 1.5, minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 800, color: 'var(--m-text)' }}>
                    저장된 분석
                  </span>
                  {aiComputedAt > 0 && (
                    <span style={{ marginLeft: 6,
                      color: 'var(--m-text-tertiary)' }}>
                      · {formatRelativeTime(aiComputedAt)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleAiAnalyze(true)}
                  disabled={aiLoading || !canAnalyze}
                  style={{
                    padding: '6px 12px', borderRadius: 2,
                    border: '1px solid var(--m-outline-variant)',
                    background: 'transparent',
                    color: 'var(--m-text-secondary)',
                    fontSize: 11, fontWeight: 700,
                    cursor: (aiLoading || !canAnalyze) ? 'not-allowed' : 'pointer',
                    opacity: (aiLoading || !canAnalyze) ? 0.55 : 1,
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>
                  최신 정보로 업데이트
                </button>
              </div>
            ) : (
              <button onClick={() => handleAiAnalyze(false)}
                disabled={aiLoading || !canAnalyze}
                className="btn-primary" style={{ fontSize: 13 }}>
                {aiLoading
                  ? '실시간 조사 중… (30~90초)'
                  : !canAnalyze
                    ? '이번 달 분석 한도 소진'
                    : `${displayName(activeTicker, stockData?.short_name)} 심층 분석`}
              </button>
            )}

            {aiError && (
              <div style={{ marginTop: 8, padding: 8, background: 'var(--clr-neg-bg-soft)', borderRadius: 8,
                color: 'var(--clr-neg-dark)', fontSize: 12 }}>{aiError}</div>
            )}
            {aiResult && <AiStockResult data={aiResult} isUs={isUs} cur={cur} />}
          </div>

          {/* 매출 · 영업이익 · EPS 트렌드 — 개별 주식 + KR 종목 */}
          {!isIndex && !isForex && !isBond && finTrend && (
            <FinancialsTrendView data={finTrend} isKr={isKr} />
          )}

          {/* 거래내역 — 개별 주식·ETF만 (지수/환율/채권 제외) */}
          {!isIndex && !isForex && !isBond && activeTicker && (
            <TransactionsSection
              ticker={activeTicker}
              name={stockData?.short_name || ''}
              isUs={isUs}
            />
          )}

          {/* Valuation & Financial Highlights — 개별 주식(US+KR), 항상 펼침 */}
          {(isUs || isKr) && !isIndex && !isForex && !isBond && (
            <div className="chart-card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 8 }}>
                Valuation & Financials
              </div>
              {fundamentals && Object.keys(fundamentals).length > 0
                ? <FundamentalsView data={fundamentals} isKr={isKr} />
                : fundLoading
                  ? <div className="spinner" />
                  : <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', padding: '6px 0' }}>데이터 없음</div>}
            </div>
          )}

          {/* 동종업계 비교 — 개별 주식(US+KR), 항상 펼침 */}
          {(isUs || isKr) && !isIndex && !isForex && !isBond && (
            <div className="chart-card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 8 }}>
                동종업계 비교
              </div>
              {peers.length > 0
                ? <PeersTable peers={peers} />
                : peersLoading
                  ? <div className="spinner" />
                  : <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', padding: '6px 0' }}>동일업종 비교 데이터 없음</div>}
            </div>
          )}

          {/* 관련 뉴스 */}
          {newsData?.news?.length > 0 && (
            <>
              <div className="section-title">관련 뉴스</div>
              {newsData.news.map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noreferrer"
                  style={{ display: 'block', textDecoration: 'none', padding: '10px 0',
                    borderBottom: '1px solid var(--clr-border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-strong)', lineHeight: 1.5 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 3 }}>
                    {n.publisher}{n.date ? ` · ${n.date}` : ''}
                  </div>
                </a>
              ))}
            </>
          )}
          <div style={{ height: 20 }} />
        </div>
      )}
    </div>
  )
}

/* 문장이 끝날 때(. ? !)마다 줄바꿈 삽입 — 가독성 개선.
   숫자 소수점($613.8M, 47.5%)·약어(U.S.)는 깨지 않도록 마침표 앞이 숫자면 건너뜀.
   whiteSpace:'pre-wrap' 컨테이너에서 \n 이 실제 줄바꿈으로 렌더링됨. */
function breakSentences(text) {
  if (typeof text !== 'string') return text
  return text.replace(/([^\d\s])([.?!])\s+/g, '$1$2\n').trim()
}

/* ── AI 분석 결과 (확장 스키마: 회사 동향·실적·호재·애널리스트·출처) ── */
function AiStockResult({ data, isUs, cur }) {
  const recColor = data.recommendation === '매수' ? '#16A34A'
                 : data.recommendation === '매도' ? '#DC2626' : '#F59E0B'
  const sources = data.sources || []
  const fmtTarget = (v) => isUs
    ? `$${v.toFixed(2)}`
    : `₩${Math.round(v).toLocaleString()}`
  // 모든 산문 섹션 공통 본문 스타일 — 통일감
  const proseStyle = { fontSize: 12.5, color: 'var(--clr-text)', lineHeight: 1.7,
    margin: 0, whiteSpace: 'pre-wrap' }
  return (
    <motion.div
      style={{ marginTop: 12 }}
      variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
      initial="hidden"
      animate="show"
    >
      {/* 추천 + 목표가 */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 16, fontWeight: 900, color: recColor, border: `2px solid ${recColor}`,
          borderRadius: 8, padding: '3px 12px' }}>{data.recommendation}</span>
        {data.priceTarget > 0 && (
          <span style={{ fontSize: 12, color: 'var(--clr-text-sub)' }}>
            목표가: <NumberTicker value={data.priceTarget} format={fmtTarget} duration={1.0} />
            {cur > 0 && data.priceTarget > 0 && (
              <span style={{ color: data.priceTarget > cur ? '#16A34A' : '#DC2626', marginLeft: 4 }}>
                (<NumberTicker
                    value={(data.priceTarget - cur) / cur * 100}
                    format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                    duration={1.0}
                  />)
              </span>
            )}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 'auto',
          background: 'var(--clr-bg)', padding: '2px 8px', borderRadius: 6,
          letterSpacing: '.02em' }}>
          웹 검색 기반 · Claude Sonnet 4.6
        </span>
      </motion.div>

      {/* 핵심 요약 */}
      {data.summary && (
        <motion.p
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
          style={{ fontSize: 13, color: 'var(--clr-text)', lineHeight: 1.7, marginBottom: 12,
            whiteSpace: 'pre-wrap' }}
        >
          {breakSentences(data.summary)}
        </motion.p>
      )}

      {/* ── 본문: 번호 매긴 보고서 섹션 (존재하는 것만 01·02… 순번 통일) ── */}
      {(() => {
        const secs = []
        if (data.company_overview)
          secs.push({ title: '기업 개요 · 전략',
            body: <p style={proseStyle}>{breakSentences(data.company_overview)}</p> })
        if (data.earnings_ir)
          secs.push({ title: '실적 · 가이던스',
            body: <p style={proseStyle}>{breakSentences(data.earnings_ir)}</p> })
        if (((data.catalysts_short?.length || 0) + (data.catalysts_medium?.length || 0)) > 0)
          secs.push({ title: '투자 촉매', body: (
            <>
              {data.catalysts_short?.length > 0 && (
                <div style={{ marginBottom: data.catalysts_medium?.length ? 11 : 0 }}>
                  <GroupLabel>단기 · 1–3개월</GroupLabel>
                  {data.catalysts_short.map((c, i) => <Bullet key={i}>{c}</Bullet>)}
                </div>
              )}
              {data.catalysts_medium?.length > 0 && (
                <div>
                  <GroupLabel>중기 · 3–12개월</GroupLabel>
                  {data.catalysts_medium.map((c, i) => <Bullet key={i}>{c}</Bullet>)}
                </div>
              )}
            </>
          ) })
        if (data.backlog && data.backlog !== '확인 필요' && data.backlog.trim().length > 0)
          secs.push({ title: '수주 잔고 · 백로그',
            body: <p style={proseStyle}>{breakSentences(data.backlog)}</p> })
        if (data.analyst_views)
          secs.push({ title: '애널리스트 컨센서스',
            body: <p style={proseStyle}>{breakSentences(data.analyst_views)}</p> })
        if (data.bull?.length > 0)
          secs.push({ title: '강세 요인',
            body: data.bull.map((b, i) => <Bullet key={i}>{b}</Bullet>) })
        if (data.bear?.length > 0)
          secs.push({ title: '리스크 요인',
            body: data.bear.map((b, i) => <Bullet key={i}>{b}</Bullet>) })
        return secs.map((s, i) => (
          <Section key={s.title} num={i + 1} title={s.title} barColor={s.barColor}>
            {s.body}
          </Section>
        ))
      })()}

      {/* 최종 의견 — Insight Banner (좌측 색띠 = 추천 색) */}
      {data.verdict && (
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
          style={{ padding: '11px 14px', background: 'var(--m-surface-variant)',
            border: '1px solid var(--m-outline-variant)', borderRadius: 4, marginBottom: 8 }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: recColor,
            letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}><SqMark color="currentColor" size={7} /> 투자 의견</div>
          <p style={{ ...proseStyle, lineHeight: 1.65 }}>{breakSentences(data.verdict)}</p>
        </motion.div>
      )}

      {/* 분석 근거·한계 (Reference) — 문장 단위 출처는 불가하나 분석 전체의 근거·범위를 명시 (R6: 문장별 줄바꿈) */}
      <div className="ko-keep" style={{ marginTop: 10, padding: '8px 12px', borderRadius: 4,
        background: 'var(--clr-bg)', border: '1px solid var(--clr-border-md)',
        fontSize: 10, color: 'var(--clr-text-muted)', lineHeight: 1.8 }}>
        <strong style={{ color: 'var(--clr-text-sub)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><SqMark size={7} /> 분석 근거 · 한계 (Reference)</strong><br />
        이 분석은 <b>위에 표시된 분석 시점</b>에 AI가 웹을 검색해 작성했습니다
        {sources.length > 0 ? <> — 참조한 문서 <b>{sources.length}건</b>은 아래 "출처 · 보고서"에서 원문을 확인할 수 있습니다.</> : '.'}<br />
        가격·펀더멘털·애널리스트 컨센서스: <b>Yahoo Finance</b> (한국 종목 가격 보조: <b>네이버 금융</b>).<br />
        모든 수치는 출처·시점을 함께 적는 것이 원칙이며, 확인되지 않은 항목은 <b>"확인 필요"</b>로 표시됩니다.<br />
        분석 시점 이후의 뉴스·공시는 반영되어 있지 않습니다 — 최신 정보가 필요하면 재분석하세요.<br />
        본 내용은 <b>투자 판단의 참고 자료</b>이며 투자 권유가 아닙니다. 최종 판단과 책임은 투자자 본인에게 있습니다.
      </div>

      {/* 출처 — 웹 검색 결과 (클릭하면 새 탭 열림) */}
      {sources.length > 0 && (
        <Section title={`출처 · 보고서 (${sources.length})`} defaultOpen={true}>
          {sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer"
              style={{
                display: 'block', textDecoration: 'none', padding: '7px 10px',
                borderBottom: i < sources.length - 1 ? '1px solid var(--clr-border)' : 'none',
                background: 'transparent', borderRadius: 4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text)',
                lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {s.title || s.url}
              </div>
              <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(() => { try { return new URL(s.url).hostname.replace('www.', '') } catch { return s.url } })()}
                {' · '}새 탭에서 열기 ↗
              </div>
            </a>
          ))}
        </Section>
      )}
    </motion.div>
  )
}

/* 통일 머릿글 마커 — 채워진 작은 네모(■). AI 분석 모든 섹션 제목에 동일 적용. */
function SqMark({ color = 'var(--clr-text-secondary)', size = 8 }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size,
    background: color, borderRadius: 1, flexShrink: 0 }} />
}

/* AI 분석 결과 — 접고 펼치는 섹션 카드. 부모 stagger 변형을 따른다.
   머릿글 = 통일된 ■ 마커(번호·◆ 혼용 폐지). 이모지 없음(디자인 시스템 준수). */
function Section({ title, num, barColor = 'var(--clr-text-sub)', children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
      background: 'var(--clr-surface)', borderRadius: 4, padding: '11px 14px',
      marginBottom: 8, border: '1px solid var(--m-outline-variant)',
    }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'inherit', textAlign: 'left',
        }}>
        <SqMark />
        <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--clr-text)',
          letterSpacing: '.02em', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--clr-text-muted)',
          transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }}>▼</span>
      </button>
      {open && <div style={{ marginTop: 9 }}>{children}</div>}
    </motion.div>
  )
}

/* 통일 불릿 — 행잉 인덴트(내어쓰기): 줄바꿈 시 본문이 마커가 아닌 텍스트 기준 정렬 */
function Bullet({ children, markerColor = 'var(--clr-text-tertiary)' }) {
  // 한 불릿이 여러 문장이면 문장마다 줄바꿈 (가독성)
  const content = typeof children === 'string' ? breakSentences(children) : children
  return (
    <div style={{ display: 'flex', gap: 7, padding: '3px 0', fontSize: 12.5,
      lineHeight: 1.62, color: 'var(--clr-text)' }}>
      <span style={{ flexShrink: 0, color: markerColor, fontWeight: 700 }}>–</span>
      <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{content}</span>
    </div>
  )
}

/* 그룹 소제목 (단기/중기) — caps label, 모든 그룹 동일 */
function GroupLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--clr-text-secondary)',
      letterSpacing: '.07em', textTransform: 'uppercase', margin: '0 0 5px' }}>{children}</div>
  )
}

/* ── 52주 바 ── */
function WeekBar({ cur, low, high, isUs }) {
  if (!cur || !low || !high || high <= low) return null
  const pct = Math.max(2, Math.min(97, (cur - low) / (high - low) * 100))
  const fmt = v => isUs ? `$${v.toFixed(2)}` : `₩${Math.round(v).toLocaleString()}`
  return (
    <div style={{ padding: '6px 2px 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 8 }}>
        <span>52주 범위</span>
        <span>{((cur - low) / (high - low) * 100).toFixed(1)}% 위치</span>
      </div>
      <div style={{ position: 'relative', height: 5, background: '#E2E8F0', borderRadius: 3, margin: '0 4px' }}>
        <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: '100%',
          background: 'linear-gradient(90deg, #FCA5A5, #0EA5E9)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }}>
          <div style={{ width: 12, height: 12, background: '#0EA5E9', borderRadius: '50%',
            border: '2px solid #fff', boxShadow: '0 0 0 1.5px #0EA5E9' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11 }}>
        <div><div style={{ fontWeight: 700, color: 'var(--clr-neg-dark)' }}>{fmt(low)}</div><div style={{ fontSize: 9, color: 'var(--clr-text-muted)' }}>52주 저</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 700, color: 'var(--clr-pos-dark)' }}>{fmt(high)}</div><div style={{ fontSize: 9, color: 'var(--clr-text-muted)' }}>52주 고</div></div>
      </div>
    </div>
  )
}

/* ── 애널리스트 목표가 ── */
function AnalystBar({ cur, low, high, avg, rec, analysts }) {
  if (!cur || !low || !high || !avg) return null
  const mn = Math.min(cur * 0.88, low), mx = Math.max(cur * 1.12, high), rng = mx - mn
  const pct = v => Math.max(2, Math.min(97, ((v - mn) / rng * 100)))
  const upside = ((avg - cur) / cur * 100).toFixed(1)
  const REC_MAP = { strongbuy:'강매수', buy:'매수', hold:'보유', sell:'매도', strongsell:'강매도' }
  const recKor = REC_MAP[rec?.toLowerCase()] || rec || '—'
  const recColor = ['strongbuy','buy'].includes(rec?.toLowerCase()) ? '#16A34A' : rec?.toLowerCase() === 'hold' ? '#F59E0B' : '#DC2626'
  return (
    <div className="chart-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>Analyst Price Targets</span>
          <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 2 }}>출처: Yahoo Finance · Thomson Reuters/Refinitiv</div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: recColor }}>{recKor}{analysts > 0 ? ` (${analysts}명)` : ''}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: '#E2E8F0', borderRadius: 3, margin: '32px 8px 40px' }}>
        <div style={{ position: 'absolute', left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%`, height: '100%', background: 'linear-gradient(90deg,#93C5FD,#1D4ED8)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: `${pct(low)}%`, top: 12, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>${low.toFixed(2)} Low</div>
        <div style={{ position: 'absolute', left: `${pct(high)}%`, top: 12, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>${high.toFixed(2)} High</div>
        <div style={{ position: 'absolute', left: `${pct(cur)}%`, top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }}>
          <div style={{ width: 12, height: 12, background: '#0EA5E9', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1.5px #0EA5E9' }} />
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: '#64748B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>${cur.toFixed(2)} · Current</div>
        </div>
        <div style={{ position: 'absolute', left: `${pct(avg)}%`, top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }}>
          <div style={{ width: 12, height: 12, background: '#8B5CF6', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1.5px #8B5CF6' }} />
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: '#8B5CF6', whiteSpace: 'nowrap' }}>${avg.toFixed(2)} avg</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>업사이드 <span style={{ fontWeight: 700, color: parseFloat(upside) > 0 ? '#16A34A' : '#DC2626' }}>{upside > 0 ? '+' : ''}{upside}%</span> 여력</div>
    </div>
  )
}

/* ── Valuation + Financials ──
 * 지표명을 누르면 초보자용 설명이 펼쳐진다(모바일에서 hover title은 동작 안 함).
 * what=한 줄 정의 / how=계산식(용어 없이) / read=숫자를 어떻게 해석하나 / eg=비유·예시 */
const METRIC_HELP = {
  'Market Cap': {
    ko: '시가총액',
    what: '이 회사를 지금 통째로 사려면 얼마가 필요한지를 나타내는 값입니다.',
    how: '현재 주가 × 발행된 주식 총수.',
    read: '클수록 큰 회사입니다. 대형주는 안정적이지만 성장 여력이 작고, 소형주는 그 반대입니다.',
    eg: '주가 10만원인 회사가 주식 100만 주를 발행했다면 시가총액은 1,000억원입니다.',
  },
  'Ent. Value': {
    ko: '기업가치(EV)',
    what: '회사를 인수할 때 실제로 들어가는 돈입니다. 빚까지 갚아줘야 하니까요.',
    how: '시가총액 + 갚아야 할 빚 − 회사가 가진 현금.',
    read: '시가총액보다 크면 빚이 많은 회사, 작으면 현금이 많은 회사입니다.',
    eg: '시총 1,000억 + 빚 300억 − 현금 100억 = 기업가치 1,200억원.',
  },
  'Trailing P/E': {
    ko: '주가수익비율 (과거 실적 기준)',
    what: '지금 주가가 회사가 버는 돈의 몇 배인지 보여줍니다. 가장 많이 쓰는 "비싼가 싼가" 지표입니다.',
    how: '현재 주가 ÷ 지난 1년간 주당 순이익(EPS).',
    read: '숫자가 낮으면 이익 대비 주가가 싼 편, 높으면 비싼 편입니다. 다만 같은 업종끼리만 비교해야 의미가 있습니다.',
    eg: 'P/E 15배 = 회사가 지금처럼 벌면 투자금을 회수하는 데 15년 걸린다는 뜻입니다.',
  },
  'Forward P/E': {
    ko: '주가수익비율 (예상 실적 기준)',
    what: '앞으로 1년간 벌 것으로 예상되는 이익을 기준으로 계산한 P/E입니다.',
    how: '현재 주가 ÷ 앞으로 1년 예상 주당순이익.',
    read: '과거 기준 P/E보다 낮으면 이익이 늘어날 것으로 전망된다는 뜻입니다. 애널리스트 추정치라 틀릴 수 있습니다.',
  },
  'PEG Ratio': {
    ko: '주가수익성장비율',
    what: 'P/E가 비싸 보여도 회사가 빠르게 성장 중이면 정당할 수 있습니다. PEG는 그 성장 속도까지 감안해서 비싼지 판단하는 지표입니다.',
    how: 'P/E ÷ 연간 이익 성장률(%). 성장률의 % 기호는 떼고 숫자만 씁니다.',
    read: '1보다 낮으면 성장 속도에 비해 주가가 싸다는 신호, 1보다 꽤 높으면 성장을 감안해도 비싸다는 신호로 봅니다.',
    eg: 'P/E 30배는 비싸 보이지만 이익이 매년 30% 늘고 있다면 PEG = 30 ÷ 30 = 1.0으로 적정 수준입니다. 반대로 P/E 30배인데 성장률이 5%뿐이면 PEG = 6.0으로 매우 비쌉니다.',
  },
  'P/S (ttm)': {
    ko: '주가매출비율',
    what: '이익이 아니라 매출을 기준으로 주가가 비싼지 봅니다. 아직 적자인 회사를 평가할 때 씁니다.',
    how: '시가총액 ÷ 지난 1년 매출액.',
    read: '적자 기업은 P/E를 계산할 수 없어서(이익이 마이너스) 이 지표를 대신 씁니다. 낮을수록 매출 대비 싼 편입니다.',
  },
  'P/B (mrq)': {
    ko: '주가순자산비율',
    what: '회사가 지금 문을 닫고 재산을 다 팔았을 때의 가치와 주가를 비교합니다.',
    how: '주가 ÷ 주당 순자산(전체 자산 − 전체 부채).',
    read: '1보다 낮으면 장부상 재산보다 주가가 싸다는 뜻입니다. 은행·제조업에서 특히 유용하고, 자산이 적은 IT 기업엔 잘 안 맞습니다.',
  },
  'EV/Revenue': {
    ko: '기업가치 대비 매출',
    what: '빚까지 포함한 회사 값어치가 매출의 몇 배인지 봅니다.',
    how: '기업가치(EV) ÷ 지난 1년 매출액.',
    read: 'P/S와 비슷하지만 부채까지 반영해서 더 보수적입니다. 부채 구조가 다른 회사끼리 비교할 때 공정합니다.',
  },
  'EV/EBITDA': {
    ko: '기업가치 대비 영업현금이익',
    what: '세금·이자·감가상각 같은 회계 차이를 걷어내고, 영업으로 실제 벌어들이는 힘과 회사 값어치를 비교합니다.',
    how: '기업가치(EV) ÷ EBITDA(영업이익 + 감가상각비).',
    read: '국가·업종별 세금 차이를 지워주기 때문에 해외 기업 비교에 자주 쓰입니다. 낮을수록 싼 편입니다.',
  },
  'Profit Margin': {
    ko: '순이익률',
    what: '매출 100원을 팔아서 최종적으로 얼마가 남는지입니다.',
    how: '순이익 ÷ 매출액 × 100.',
    read: '높을수록 남기는 장사를 잘한다는 뜻입니다. 소프트웨어는 20~30%대, 유통·마트는 1~3%대가 흔합니다.',
  },
  'ROA (ttm)': {
    ko: '총자산이익률',
    what: '회사가 가진 자산을 얼마나 효율적으로 굴려 이익을 내는지입니다.',
    how: '순이익 ÷ 총자산 × 100.',
    read: '같은 자산으로 더 많이 벌면 높습니다. 5% 이상이면 양호한 편으로 봅니다.',
  },
  'ROE (ttm)': {
    ko: '자기자본이익률',
    what: '주주가 넣은 돈으로 얼마를 벌어다 주는지입니다. 워런 버핏이 중요하게 보는 지표입니다.',
    how: '순이익 ÷ 자기자본 × 100.',
    read: '높을수록 좋고 15% 이상을 우량하게 봅니다. 단, 빚을 많이 내면 인위적으로 높아지므로 D/E와 같이 봐야 합니다.',
  },
  'Revenue (ttm)': {
    ko: '매출액 (최근 1년)',
    what: '회사가 물건이나 서비스를 팔아 벌어들인 총액입니다. 비용을 빼기 전 금액입니다.',
    how: '최근 4개 분기 매출을 합친 값.',
    read: '회사의 규모와 성장 추세를 보는 출발점입니다. 매년 늘고 있는지가 중요합니다.',
  },
  'Net Income': {
    ko: '순이익 (최근 1년)',
    what: '매출에서 인건비·재료비·이자·세금까지 모두 빼고 최종적으로 남은 돈입니다.',
    how: '매출액 − 모든 비용 − 세금.',
    read: '마이너스면 적자입니다. 이 값이 주가수익비율(P/E)의 기준이 됩니다.',
  },
  'EPS (ttm)': {
    ko: '주당순이익',
    what: '내가 가진 주식 1주가 1년에 얼마를 벌어다 줬는지입니다.',
    how: '순이익 ÷ 발행 주식수.',
    read: '꾸준히 늘어나는 회사가 좋습니다. 주가를 EPS로 나누면 P/E가 됩니다.',
  },
  'Total Cash': {
    ko: '보유 현금',
    what: '회사 통장에 든 현금과 바로 현금화할 수 있는 자산입니다.',
    how: '현금 + 단기 금융상품.',
    read: '많으면 불황을 견디고 투자·배당을 할 여력이 큽니다. 적자 기업이라면 "얼마나 버틸 수 있나"의 핵심입니다.',
  },
  'D/E (mrq)': {
    ko: '부채비율',
    what: '주주 돈에 비해 빌린 돈이 얼마나 많은지입니다. 회사의 안전벨트 역할을 봅니다.',
    how: '총부채 ÷ 자기자본. (100을 곱해 %로 표시하는 곳도 있습니다)',
    read: '낮을수록 안전합니다. 높으면 금리가 오를 때 이자 부담으로 흔들릴 수 있습니다. 은행·통신처럼 원래 부채가 많은 업종은 기준이 다릅니다.',
  },
  'Free CF (ttm)': {
    ko: '잉여현금흐름',
    what: '영업으로 번 현금에서 공장·설비 유지비를 뺀, 회사가 자유롭게 쓸 수 있는 실제 현금입니다.',
    how: '영업활동 현금흐름 − 설비투자(CAPEX).',
    read: '회계상 이익은 조정이 가능하지만 현금은 속이기 어려워서, 순이익보다 신뢰도가 높다고 봅니다. 배당·자사주 매입의 재원입니다.',
  },
}


const PEER_COL_TIPS = {
  '시가총액': '현재가 × 발행주식수. T=조, B=십억 달러',
  'P/E': '주가수익비율. 현재가÷EPS. 낮을수록 저평가 경향',
  'EPS': '주당순이익. 높을수록 수익성 우수',
  'Forward P/E': '예상 주가수익비율. 미래 수익성 기준',
  '섹터': '기업이 속한 산업 섹터',
}

function MetricRow({ label, value }) {
  const [open, setOpen] = useState(false)
  const help = METRIC_HELP[label]

  return (
    <div style={{ borderBottom: '1px solid var(--m-outline-variant)' }}>
      <button
        type="button"
        onClick={() => help && setOpen(v => !v)}
        aria-expanded={help ? open : undefined}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12,
          background: 'none', border: 'none', fontFamily: 'inherit',
          cursor: help ? 'pointer' : 'default', textAlign: 'left',
        }}>
        <span style={{ color: 'var(--m-text-secondary)', display: 'flex',
          alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ borderBottom: help ? '1px dotted var(--m-outline)' : 'none' }}>
            {label}
          </span>
          {help && (
            <span aria-hidden="true" style={{
              fontSize: 9, color: 'var(--m-text-tertiary)', flexShrink: 0,
              transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
            }}>▾</span>
          )}
        </span>
        <span style={{ fontWeight: 700, color: 'var(--m-text)',
          fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{value ?? '—'}</span>
      </button>

      {open && help && (
        <div className="ko-keep" style={{
          padding: '9px 10px 11px', marginBottom: 7, borderRadius: 4,
          background: 'var(--m-surface-variant)',
          border: '1px solid var(--m-outline-variant)',
          fontSize: 11.5, lineHeight: 1.7, color: 'var(--m-text-secondary)',
        }}>
          <div style={{ fontWeight: 800, color: 'var(--m-text)', fontSize: 12,
            marginBottom: 5 }}>{help.ko}</div>
          {/* R6: 항목별로 줄을 나눠 한 덩어리 산문이 되지 않게 */}
          <div style={{ marginBottom: 6 }}>{help.what}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr',
            gap: '3px 8px', alignItems: 'start' }}>
            <b style={HELP_K}>계산</b><span>{help.how}</span>
            <b style={HELP_K}>읽는 법</b><span>{help.read}</span>
            {help.eg && (<><b style={HELP_K}>예시</b><span>{help.eg}</span></>)}
          </div>
        </div>
      )}
    </div>
  )
}

const HELP_K = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em',
  color: 'var(--m-text-tertiary)', textTransform: 'uppercase',
  whiteSpace: 'nowrap', paddingTop: 2,
}

function FundamentalsView({ data, isKr = false }) {
  function fmtB(v) {
    if (!v) return '—'
    const a = Math.abs(v)
    if (isKr) {   // 원화 — 조/억 단위
      if (a >= 1e12) return `₩${(v/1e12).toFixed(2)}조`
      if (a >= 1e8)  return `₩${(v/1e8).toFixed(0)}억`
      return `₩${v.toLocaleString()}`
    }
    if (a >= 1e12) return `$${(v/1e12).toFixed(2)}T`
    if (a >= 1e9)  return `$${(v/1e9).toFixed(2)}B`
    if (a >= 1e6)  return `$${(v/1e6).toFixed(2)}M`
    return `$${v.toLocaleString()}`
  }
  const n = (v, s='') => v != null ? `${v}${s}` : '—'
  const p = v => v != null ? `${v.toFixed(2)}%` : '—'
  const eps = data.diluted_eps != null
    ? (isKr ? `₩${Math.round(data.diluted_eps).toLocaleString()}` : data.diluted_eps.toFixed(2))
    : '—'
  return (
    // 좁은 폭(≈400px)에서는 1열로 떨어진다 — 2열 고정이면 지표 설명이 반쪽 칸에 갇혀
    // 한 줄에 4~5자씩 끊긴다(design.md R5 앱폭 점검).
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '.06em' }}>Valuation</div>
        {[
          ['Market Cap',   fmtB(data.market_cap)],
          ['Ent. Value',   fmtB(data.enterprise_value)],
          ['Trailing P/E', n(data.trailing_pe?.toFixed(2))],
          ['Forward P/E',  n(data.forward_pe?.toFixed(2))],
          ['PEG Ratio',    n(data.peg_ratio?.toFixed(2))],
          ['P/S (ttm)',    n(data.price_to_sales?.toFixed(2))],
          ['P/B (mrq)',    n(data.price_to_book?.toFixed(2))],
          ['EV/Revenue',   n(data.ev_revenue?.toFixed(2))],
          ['EV/EBITDA',    n(data.ev_ebitda?.toFixed(2))],
        ].map(([k, v]) => <MetricRow key={k} label={k} value={v} />)}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '.06em' }}>Financials</div>
        {[
          ['Profit Margin', p(data.profit_margin)],
          ['ROA (ttm)',     p(data.roa)],
          ['ROE (ttm)',     p(data.roe)],
          ['Revenue (ttm)', fmtB(data.revenue)],
          ['Net Income',    fmtB(data.net_income)],
          ['EPS (ttm)',     eps],
          ['Total Cash',    fmtB(data.total_cash)],
          ['D/E (mrq)',     n(data.debt_to_equity?.toFixed(2))],
          ['Free CF (ttm)', fmtB(data.free_cash_flow)],
        ].map(([k, v]) => <MetricRow key={k} label={k} value={v} />)}
      </div>
    </div>
  )
}

/* ── Peers Table (hover 툴팁 포함) ── */
function PeersTable({ peers }) {
  function fmtMC(v) {
    if (!v) return '—'
    if (v >= 1e12) return `${(v/1e12).toFixed(2)}T`
    if (v >= 1e9)  return `${(v/1e9).toFixed(2)}B`
    return `${(v/1e6).toFixed(0)}M`
  }
  const cols = ['티커','종목명','시가총액','P/E','EPS','Forward P/E','섹터']
  const NUM_COLS = new Set(['시가총액','P/E','EPS','Forward P/E'])
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--clr-border-md)' }}>
            {cols.map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: NUM_COLS.has(h) ? 'right' : 'left',
                fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)', whiteSpace: 'nowrap',
                cursor: PEER_COL_TIPS[h] ? 'help' : 'default',
                borderBottom: PEER_COL_TIPS[h] ? '1px dotted #CBD5E1' : 'none' }}
                title={PEER_COL_TIPS[h] || ''}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {peers.map((p, i) => (
            <tr key={p.ticker} style={{ borderBottom: '1px solid var(--clr-border)',
              background: i === 0 ? '#F0F9FF' : 'transparent' }}>
              <td style={{ padding: '7px 8px', fontWeight: 700, color: 'var(--clr-info-dark)', whiteSpace: 'nowrap' }}>{p.ticker}</td>
              <td style={{ padding: '7px 8px', maxWidth: 120, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
              <td style={{ padding: '7px 8px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMC(p.market_cap)}</td>
              <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.pe_ratio?.toFixed(2) ?? '—'}</td>
              <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.eps?.toFixed(2) ?? '—'}</td>
              <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.forward_pe?.toFixed(2) ?? '—'}</td>
              <td style={{ padding: '7px 8px', color: 'var(--clr-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{p.sector || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Yahoo Finance 스타일 Earnings Trends 차트 ── */
function fmtMoneyShort(v) {
  if (v == null) return '—'
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1e12) return `${s}$${(a/1e12).toFixed(2)}T`
  if (a >= 1e9)  return `${s}$${(a/1e9).toFixed(2)}B`
  if (a >= 1e6)  return `${s}$${(a/1e6).toFixed(2)}M`
  return `${s}$${a.toLocaleString()}`
}

function fmtMoneyCompact(v) {
  if (v == null) return '—'
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1e9)  return `${s}${(a/1e9).toFixed(2)}B`
  if (a >= 1e6)  return `${s}${(a/1e6).toFixed(2)}M`
  if (a >= 1e3)  return `${s}${(a/1e3).toFixed(1)}K`
  return `${s}${a.toLocaleString()}`
}

// "25Q1" → "Q1 FY25" (영문) 또는 "25년 1Q" (한글)
function fmtFy(period, isKr = false) {
  const m = String(period || '').match(/^(\d{2})Q([1-4])$/)
  if (!m) return period || '—'
  if (isKr) return `${m[1]}년 ${m[2]}Q`
  return `Q${m[2]} FY${m[1]}`
}

// 영문: "2026-05-05" → "May 05" / 한글: "5월 5일"
function fmtEarningsDate(date, isKr = false) {
  if (!date) return '—'
  const p = String(date).split('-')
  if (p.length < 3) return date
  if (isKr) return `${parseInt(p[1],10)}월 ${parseInt(p[2],10)}일`
  return `${MONTHS[parseInt(p[1],10)-1]} ${p[2]}`
}

function useContainerWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function FinancialsTrendView({ data, isKr = false }) {
  const hasRev = data.revenue?.some(d => d.value != null)
  const hasOp  = data.operating_income?.some(d => d.value != null)
  const hasEps = (data.eps || []).length > 0

  if (!hasRev && !hasOp && !hasEps) return null

  const L = isKr ? {
    title: '실적 추이',
    eps: '주당순이익 (EPS)',
    revenue: '매출 vs 영업이익',
    estimate: '컨센서스',
    actual: '실적',
    beat: '초과 달성',
    miss: '미달',
    revLabel: '매출',
    earnLabel: '영업이익',
    tip: '막대를 터치/호버하면 해당 분기의 값이 표시됩니다 · 미래 분기는 옅은 색',
    subtitle: 'Yahoo Finance · 최근 2년 분기별',
    currency: '₩',
  } : {
    title: 'Earnings Trends',
    eps: 'Earnings Per Share',
    revenue: 'Revenue vs. Earnings',
    estimate: 'Estimate',
    actual: 'Actual',
    beat: 'Beat',
    miss: 'Missed',
    revLabel: 'Revenue',
    earnLabel: 'Earnings',
    tip: '막대를 터치/호버하면 헤더의 값이 해당 분기로 갱신됩니다 · 미래 분기는 옅은 색',
    subtitle: 'Yahoo Finance · 최근 2년 분기별',
    currency: '$',
  }

  return (
    <div className="chart-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--clr-text-strong)' }}>{L.title}</div>
        <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>{L.subtitle}</div>
      </div>
      {hasEps     && <EpsTrendPanel eps={data.eps} L={L} isKr={isKr} />}
      {(hasRev || hasOp) && <RevenueEarningsPanel data={data} L={L} isKr={isKr} />}
    </div>
  )
}

/* ── Earnings Per Share ── */
function EpsTrendPanel({ eps, L, isKr }) {
  const [ref, width] = useContainerWidth()

  // 기본 선택: 가장 최근 실적 발표된 분기 (actual 있는 마지막 index)
  const defaultIdx = React.useMemo(() => {
    for (let i = eps.length - 1; i >= 0; i--) {
      if (!eps[i].is_future && eps[i].actual != null) return i
    }
    return 0
  }, [eps])
  const [selIdx, setSelIdx] = useState(defaultIdx)
  useEffect(() => { setSelIdx(defaultIdx) }, [defaultIdx])

  if (!eps.length) return null

  const H = 270
  const PAD = { top: 16, right: 16, bottom: 72, left: 52 }
  const W = Math.max(1, (width || 600) - PAD.left - PAD.right)
  const plotH = H - PAD.top - PAD.bottom

  const allVals = eps.flatMap(e => [e.estimate, e.actual].filter(v => v != null))
  let minV = Math.min(...allVals)
  let maxV = Math.max(...allVals)
  const range = (maxV - minV) || Math.max(Math.abs(minV), 1)
  minV -= range * 0.25
  maxV += range * 0.25
  const yR = maxV - minV || 1

  const n = eps.length
  const slotW = W / n
  const xOf = i => PAD.left + (i + 0.5) * slotW
  const yOf = v => PAD.top + plotH - (v - minV) / yR * plotH

  const Y_N = 5
  const yTicks = Array.from({ length: Y_N }, (_, i) => minV + yR * i / (Y_N - 1))
  const selected = eps[selIdx]

  const cur = L.currency
  const fmtEps = v => {
    if (v == null) return '—'
    const s = v < 0 ? '-' : ''
    if (isKr) return `${s}${cur}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    return `${s}${cur}${Math.abs(v).toFixed(2)}`
  }
  const fmtDiff = (v) => {
    if (isKr) return `${v >= 0 ? '+' : '-'}${cur}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    return `${v >= 0 ? '+' : '-'}${cur}${Math.abs(v).toFixed(2)}`
  }

  function beatInfo(e) {
    if (e.is_future || e.actual == null) {
      return { label: '—', value: fmtEarningsDate(e.date, isKr), color: 'var(--clr-text-muted)' }
    }
    const diff = e.actual - e.estimate
    if (diff >= 0) return { label: L.beat, value: fmtDiff(diff), color: 'var(--clr-pos-dark)' }
    return { label: L.miss, value: fmtDiff(diff), color: 'var(--clr-neg-dark)' }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 6 }}>
        {L.eps}
      </div>
      {selected && (
        <div style={{ fontSize: 12, color: 'var(--clr-text-mid)', marginBottom: 6, display: 'flex',
          flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: 'var(--clr-text-strong)' }}>{fmtFy(selected.period, isKr)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              border: '1.5px solid #94A3B8', background: 'var(--clr-surface)' }} />
            <span style={{ color: 'var(--clr-text-sub)' }}>{L.estimate}</span>
            <span style={{ color: 'var(--clr-text-strong)', fontWeight: 600 }}>{fmtEps(selected.estimate)}</span>
          </span>
          {selected.actual != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: selected.actual >= selected.estimate ? '#16A34A' : '#DC2626' }} />
              <span style={{ color: 'var(--clr-text-sub)' }}>{L.actual}</span>
              <span style={{ color: selected.actual >= selected.estimate ? '#16A34A' : '#DC2626',
                fontWeight: 700 }}>{fmtEps(selected.actual)}</span>
            </span>
          )}
        </div>
      )}
      <div ref={ref} style={{ width: '100%', userSelect: 'none' }}>
        <svg width={width || '100%'} height={H} style={{ display: 'block' }}>
          {/* Y grid */}
          {yTicks.map((t, i) => (
            <line key={`g${i}`} x1={PAD.left} y1={yOf(t)} x2={PAD.left + W} y2={yOf(t)}
              stroke="#F1F5F9" strokeWidth={1} strokeDasharray={Math.abs(t) < 1e-6 ? '0' : '3 3'} />
          ))}
          {/* Y labels */}
          {yTicks.map((t, i) => (
            <text key={`yl${i}`} x={PAD.left - 6} y={yOf(t)} fontSize={10} fill="#94A3B8"
              textAnchor="end" dominantBaseline="middle">
              {t < 0 ? `-${Math.abs(t).toFixed(2)}` : t.toFixed(2)}
            </text>
          ))}

          {/* Selected vertical dashed line */}
          {selected && (
            <line x1={xOf(selIdx)} y1={PAD.top} x2={xOf(selIdx)} y2={H - PAD.bottom}
              stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 4" />
          )}

          {/* Quarters */}
          {eps.map((e, i) => {
            const cx = xOf(i)
            const info = beatInfo(e)
            const beat = e.actual != null && e.actual >= e.estimate
            return (
              <g key={i} style={{ cursor: 'pointer' }}
                 onClick={() => setSelIdx(i)}
                 onMouseEnter={() => setSelIdx(i)}>
                {/* hit area */}
                <rect x={cx - slotW/2} y={0} width={slotW} height={H} fill="transparent" />

                {/* Estimate — hollow circle */}
                {e.estimate != null && (
                  <circle cx={cx} cy={yOf(e.estimate)} r={7}
                    fill="#fff" stroke="#94A3B8" strokeWidth={1.7} />
                )}
                {/* Actual — filled circle */}
                {e.actual != null && (
                  <circle cx={cx} cy={yOf(e.actual)} r={7}
                    fill={beat ? '#16A34A' : '#DC2626'} stroke="#fff" strokeWidth={2} />
                )}

                {/* Period label */}
                <text x={cx} y={H - PAD.bottom + 16} fontSize={10.5} fill="#64748B"
                  textAnchor="middle" fontWeight={600}>{fmtFy(e.period, isKr)}</text>
                {/* Beat/Miss label */}
                <text x={cx} y={H - PAD.bottom + 32} fontSize={10.5} fill={info.color}
                  textAnchor="middle" fontWeight={700}>{info.label}</text>
                <text x={cx} y={H - PAD.bottom + 46} fontSize={10} fill={info.color}
                  textAnchor="middle" fontWeight={600}>{info.value}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

/* ── Revenue vs. Earnings ── */
function RevenueEarningsPanel({ data, L, isKr }) {
  const [ref, width] = useContainerWidth()

  const merged = React.useMemo(() => {
    const map = {}
    for (const r of data.revenue || []) {
      if (!map[r.period]) map[r.period] = { period: r.period, date: r.date }
      map[r.period].revenue = r.value
    }
    for (const o of data.operating_income || []) {
      if (!map[o.period]) map[o.period] = { period: o.period, date: o.date }
      map[o.period].op_income = o.value
    }
    const today = new Date().toISOString().slice(0, 10)
    const arr = Object.values(map).sort((a, b) => (a.date > b.date ? 1 : -1))
    for (const it of arr) it.is_future = it.date > today
    return arr
  }, [data])

  const defaultIdx = React.useMemo(() => {
    for (let i = merged.length - 1; i >= 0; i--) {
      if (!merged[i].is_future && merged[i].revenue != null) return i
    }
    return merged.length - 1
  }, [merged])
  const [selIdx, setSelIdx] = useState(defaultIdx)
  useEffect(() => { setSelIdx(defaultIdx) }, [defaultIdx])

  if (!merged.length) return null

  const H = 240
  const PAD = { top: 16, right: 16, bottom: 36, left: 52 }
  const W = Math.max(1, (width || 600) - PAD.left - PAD.right)
  const plotH = H - PAD.top - PAD.bottom

  const vals = merged.flatMap(d => [d.revenue, d.op_income].filter(v => v != null))
  const posMax = Math.max(0, ...vals)
  const negMin = Math.min(0, ...vals)
  const yRange = (posMax - negMin) || 1
  const pad = yRange * 0.12
  const maxV = posMax + pad
  const minV = negMin < 0 ? negMin - pad : 0
  const yR = maxV - minV || 1

  const n = merged.length
  const slotW = W / n
  const groupW = Math.min(46, slotW * 0.75)
  const barW = (groupW - 4) / 2
  const xCenter = i => PAD.left + (i + 0.5) * slotW
  const yOf = v => PAD.top + plotH - (v - minV) / yR * plotH
  const y0 = yOf(0)

  const Y_N = 5
  const yTicks = Array.from({ length: Y_N }, (_, i) => minV + yR * i / (Y_N - 1))

  const selected = merged[selIdx]

  // KR 금액 포맷 (원화 단위 - 조/억/만)
  const fmtKrw = (v) => {
    if (v == null) return '—'
    const s = v < 0 ? '-' : ''
    const a = Math.abs(v)
    if (a >= 1e12) return `${s}₩${(a/1e12).toFixed(2)}조`
    if (a >= 1e8)  return `${s}₩${(a/1e8).toFixed(1)}억`
    if (a >= 1e4)  return `${s}₩${(a/1e4).toFixed(0)}만`
    return `${s}₩${a.toLocaleString()}`
  }
  const fmtKrwAxis = (v) => {
    const s = v < 0 ? '-' : ''
    const a = Math.abs(v)
    if (a >= 1e12) return `${s}${(a/1e12).toFixed(1)}조`
    if (a >= 1e8)  return `${s}${(a/1e8).toFixed(0)}억`
    if (a >= 1e4)  return `${s}${(a/1e4).toFixed(0)}만`
    return `${s}${a}`
  }
  const fmtAmount = (v) => isKr ? fmtKrw(v) : fmtMoneyCompact(v)
  const fmtYTick  = (v) => isKr ? fmtKrwAxis(v) : fmtMoneyCompact(v)

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 6 }}>
        {L.revenue}
      </div>
      {selected && (
        <div style={{ fontSize: 12, color: 'var(--clr-text-mid)', marginBottom: 6, display: 'flex',
          flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: 'var(--clr-text-strong)' }}>{fmtFy(selected.period, isKr)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#38BDF8' }} />
            <span style={{ color: 'var(--clr-text-sub)' }}>{L.revLabel}</span>
            <span style={{ color: 'var(--clr-text-strong)', fontWeight: 700 }}>{fmtAmount(selected.revenue)}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#F59E0B' }} />
            <span style={{ color: 'var(--clr-text-sub)' }}>{L.earnLabel}</span>
            <span style={{ color: selected.op_income >= 0 ? '#0F172A' : '#DC2626', fontWeight: 700 }}>
              {fmtAmount(selected.op_income)}
            </span>
          </span>
        </div>
      )}
      <div ref={ref} style={{ width: '100%', userSelect: 'none' }}>
        <svg width={width || '100%'} height={H} style={{ display: 'block' }}>
          {/* Y grid + labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={yOf(t)} x2={PAD.left + W} y2={yOf(t)}
                stroke="#F1F5F9" strokeWidth={1}
                strokeDasharray={Math.abs(t) < 1e-6 ? '0' : '3 3'} />
              <text x={PAD.left - 6} y={yOf(t)} fontSize={10} fill="#94A3B8"
                textAnchor="end" dominantBaseline="middle">{fmtYTick(t)}</text>
            </g>
          ))}

          {/* Zero line emphasis */}
          <line x1={PAD.left} y1={y0} x2={PAD.left + W} y2={y0}
            stroke="#CBD5E1" strokeWidth={1} />

          {/* Bars per quarter */}
          {merged.map((d, i) => {
            const cx = xCenter(i)
            const leftX  = cx - barW - 2
            const rightX = cx + 2
            const revFill = d.is_future ? '#BAE6FD' : '#38BDF8'
            const opFill  = d.is_future ? '#FDE68A' : '#F59E0B'

            const bar = (v, x, fill) => {
              if (v == null) return null
              const y = yOf(v)
              const h = Math.abs(y - y0)
              const top = v >= 0 ? y : y0
              return (
                <rect x={x} y={top} width={barW} height={Math.max(1, h)}
                  fill={fill} rx={2}
                  opacity={selIdx === i ? 1 : 0.85} />
              )
            }

            return (
              <g key={i} style={{ cursor: 'pointer' }}
                 onClick={() => setSelIdx(i)}
                 onMouseEnter={() => setSelIdx(i)}>
                <rect x={cx - slotW/2} y={0} width={slotW} height={H} fill="transparent" />
                {bar(d.revenue,  leftX,  revFill)}
                {bar(d.op_income, rightX, opFill)}
                {/* Period label */}
                <text x={cx} y={H - PAD.bottom + 18} fontSize={10.5}
                  fill={selIdx === i ? '#0F172A' : '#64748B'}
                  textAnchor="middle" fontWeight={selIdx === i ? 700 : 600}>
                  {fmtFy(d.period, isKr)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', textAlign: 'right', marginTop: 2 }}>
        {L.tip}
      </div>
    </div>
  )
}

/* ─── Apple Stocks 풍 Hero 카드 (P2-5) ──────────────────────────────────
   큰 가격 + 변동(금액/%) + 미니 sparkline + 종목 메타. NumberTicker로 부드러운 변화. */
function AppleStocksHero({
  stockData, cur, chgPct, up, fmtCur, isKr, isIndex, isCrypto, isUs, activeTicker, sparkValues,
  onOpenAlerts,
}) {
  // 변동 금액 추정 — prev close 기반
  const prev = cur && chgPct != null ? cur / (1 + chgPct / 100) : null
  const chgAmt = prev && cur ? cur - prev : 0
  const accent = up ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)'
  const accentBg = up ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)'

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--m-surface)',
      borderRadius: 4, padding: '18px 18px 16px',
      marginBottom: 14,
      border: '1px solid var(--m-outline-variant)',
      // 변동률 표시는 우측 큰 색 chip으로만 — 배경 그라데이션 제거
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 종목명 + 티커 + 알림 아이콘 (한 줄 통합) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--clr-text-strong)',
              letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', minWidth: 0 }}>
              {stockData.short_name || activeTicker}
            </span>
            {isIndex && <Badge color="var(--clr-border-strong)" bg="var(--clr-bg)">INDEX</Badge>}
            {isCrypto && <Badge color="var(--clr-info-dark)" bg="var(--clr-info-bg)">CRYPTO</Badge>}
            {isKr && !isIndex && <Badge color="var(--clr-info-dark)" bg="var(--clr-info-bg)">KR</Badge>}
            {isUs && !isIndex && !isKr && <Badge color="var(--clr-text-mid)" bg="var(--clr-bg)">US</Badge>}
            {onOpenAlerts && !isIndex && (
              <button onClick={onOpenAlerts}
                title="가격 알림 설정"
                aria-label="가격 알림 설정"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, padding: 0, borderRadius: 2,
                  background: 'transparent',
                  border: '1px solid var(--m-outline-variant)',
                  color: 'var(--m-text-tertiary)',
                  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  width="11" height="11">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)',
            fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {activeTicker}{stockData.sector && stockData.sector !== 'N/A'
              && ` · ${stockData.sector}`}
          </div>
        </div>

        {/* 우측: sparkline 단독 (큼) — 정렬 깔끔 */}
        {sparkValues && sparkValues.length > 4 && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center',
            paddingTop: 4 }}>
            <MiniSparkline values={sparkValues} positive={up} width={120} height={42} />
          </div>
        )}
      </div>

      {/* 큰 현재가 + 변동 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: 'var(--clr-text-strong)',
          letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          <NumberTicker
            value={cur || 0}
            format={v => fmtCur(v)}
            duration={0.6}
          />
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 4,
          background: accent, color: '#fff',
          fontSize: 13, fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ fontSize: 11 }}>{up ? '▲' : '▼'}</span>
          {chgAmt != null && (
            <span>{up ? '+' : ''}{fmtCur(Math.abs(chgAmt)).replace(/^[$₩]/, (up ? '+' : '-') + (isKr || !isUs ? '₩' : '$'))}</span>
          )}
          <span style={{ opacity: 0.9 }}>· {up ? '+' : ''}{(chgPct ?? 0).toFixed(2)}%</span>
        </div>
      </div>
    </div>
  )
}

/* 종목 조회 실패 시 사유별 명확한 안내 — 사용자가 "왜 안 뜨는지" 즉시 알 수 있도록.
   backend는 detail에 { error_code, message, hint, sources_tried } 구조화 반환. */
function StockErrorPanel({ ticker, error, onRetry }) {
  // axios error → response.data.detail (FastAPI HTTPException detail 구조)
  const detail = error?.response?.data?.detail
  const httpStatus = error?.response?.status
  const isNetworkError = !error?.response   // request 자체 실패 (CORS/타임아웃/오프라인)

  let title, body, hint, tone

  if (isNetworkError) {
    tone = 'network'
    title = '서버에 연결할 수 없습니다'
    body  = '인터넷 연결을 확인하시거나 잠시 후 다시 시도해주세요.'
    hint  = 'PWA 오프라인 모드일 수 있습니다. 페이지를 새로고침해보세요.'
  } else if (typeof detail === 'object' && detail?.error_code === 'unsupported_kr_fund') {
    tone = 'info'
    title = '한국 펀드 · 일부 ETF는 시세 데이터가 제공되지 않습니다'
    body  = detail.message
    hint  = detail.hint
  } else if (typeof detail === 'object' && detail?.error_code === 'kr_price_unavailable') {
    tone = 'warn'
    title = '현재가 조회 실패 — 거래정지/공시 휴장 가능성'
    body  = detail.message
    hint  = '잠시 후 재시도하면 정상 표시될 수 있습니다.'
  } else if (typeof detail === 'object' && detail?.error_code === 'delisted_or_invalid') {
    tone = 'warn'
    title = '잘못된 티커 또는 상장폐지 종목입니다'
    body  = detail.message
    hint  = detail.hint
  } else if (httpStatus === 404) {
    tone = 'warn'
    title = `종목을 찾을 수 없습니다 — ${ticker}`
    body  = '티커를 확인해주세요. 한국 종목은 6자리 숫자(예: 005930), 미국은 알파벳(예: AAPL)입니다.'
  } else if (httpStatus >= 500) {
    tone = 'error'
    title = '서버 일시 오류'
    body  = `상태 코드 ${httpStatus}. 잠시 후 다시 시도해주세요.`
  } else {
    tone = 'error'
    title = '데이터를 불러올 수 없습니다'
    body  = typeof detail === 'string' ? detail
          : (detail?.message || '예기치 못한 오류가 발생했습니다.')
  }

  const accent = tone === 'info' ? 'var(--m-text)'
              : tone === 'warn' ? '#B45309'
              : tone === 'network' ? 'var(--m-text-secondary)'
              : 'var(--m-negative)'

  return (
    <div style={{
      margin: '20px 0 12px', padding: '16px 18px',
      border: '1px solid var(--m-outline-variant)',
      borderRadius: 4, background: 'var(--m-surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div className="ko-keep" style={{ fontSize: 13, fontWeight: 800,
          color: accent, letterSpacing: '-.01em' }}>
          {title}
        </div>
        <span className="mono-pill" style={{ flexShrink: 0,
          color: 'var(--m-text-tertiary)' }}>
          {ticker} · {httpStatus || 'NETWORK'}
        </span>
      </div>
      {body && (
        <div className="ko-keep" style={{ fontSize: 12,
          color: 'var(--m-text-secondary)', lineHeight: 1.65, marginTop: 6 }}>
          {body}
        </div>
      )}
      {hint && (
        <div className="ko-keep" style={{ fontSize: 11,
          color: 'var(--m-text-tertiary)', lineHeight: 1.6, marginTop: 8 }}>
          <strong style={{ fontWeight: 700,
            color: 'var(--m-text-secondary)' }}>대안: </strong>
          {hint}
        </div>
      )}
      {Array.isArray(detail?.sources_tried) && detail.sources_tried.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {detail.sources_tried.map(s => (
            <span key={s} className="mono-pill" style={{
              color: 'var(--m-text-tertiary)', fontSize: 9 }}>{s}</span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button onClick={onRetry}
          style={{
            padding: '8px 16px', borderRadius: 2,
            border: '1px solid var(--m-outline-variant)',
            background: 'transparent', color: 'var(--m-text-secondary)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
          다시 시도
        </button>
      </div>
    </div>
  )
}

function Badge({ children, color, bg }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 800,
      color, background: bg, letterSpacing: '.05em',
    }}>{children}</span>
  )
}

/* 가벼운 sparkline — Apple Stocks 풍 (점·선만) */
function MiniSparkline({ values = [], positive = true, width = 80, height = 32 }) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = positive ? '#16A34A' : '#DC2626'
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`mini-grad-${positive ? 'p' : 'n'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#mini-grad-${positive ? 'p' : 'n'})`} />
      <polyline points={points} stroke={color} strokeWidth="1.5"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* 마지막 점 */}
      {(() => {
        const lastX = (values.length - 1) * stepX
        const lastY = height - ((values[values.length - 1] - min) / range) * height
        return <circle cx={lastX} cy={lastY} r="2.5" fill={color}
          stroke="var(--clr-surface)" strokeWidth="1.5" />
      })()}
    </svg>
  )
}

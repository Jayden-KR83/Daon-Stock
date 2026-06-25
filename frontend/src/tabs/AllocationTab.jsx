import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { getPortfolio, getPricesBatch, getPortfolioMetrics, getPortfolioMetricsCached, getPortfolioStrategy, getPortfolioStrategyCached, pollPortfolioStrategy, getPortfolioHealth, getPortfolioAlerts, getPortfolioDividends } from '../api'
import { useStore } from '../store'
import LogoCircle from '../components/LogoCircle'
import BorderBeam from '../components/BorderBeam'
import BacktestSection from '../components/BacktestSection'
import NetWorthChart from '../components/NetWorthChart'
import GoalsCard from '../components/GoalsCard'
import HealthScoreCard from '../components/HealthScoreCard'
import AlertsCard from '../components/AlertsCard'
import DividendsCard from '../components/DividendsCard'
import PortfolioSummaryBanner from '../components/PortfolioSummaryBanner'
import ShimmerButton from '../components/ShimmerButton'
import { useAccounts } from '../utils/accounts'
import { effPrice } from '../utils/effPrice'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import './TrendsTab.css'   // tt-ai-widget 스타일 공유 사용

function formatRelativeKo(epochSec) {
  if (!epochSec) return ''
  const now = Date.now() / 1000
  const diff = now - epochSec
  if (diff < 60)        return '방금 전'
  if (diff < 3600)      return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 2) return '어제'
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  const d = new Date(epochSec * 1000)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
const COLORS = [
  '#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#14B8A6','#F97316','#0EA5E9','#84CC16',
  '#6366F1','#A78BFA','#34D399','#FCD34D','#FB923C',
]
// 계좌 아이콘
const ACC_ICONS = { US: '🇺🇸', KR_RETIRE: '🏦', KR_PERSONAL: '💼', KR_ISA: '🎯', '미국': '🇺🇸', '퇴직': '🏦', '개별': '💼', 'ISA': '🎯' }
// 섹터 아이콘 (한/영 매핑)
const SECTOR_ICONS = {
  '반도체': '💾', '반도체·AI': '💾',
  'AI': '🤖', 'AI & 빅테크': '🤖', '빅테크': '🤖',
  '시장지수': '📈', '나스닥100': '📈', 'S&P 500': '📈', 'S&P500': '📈',
  '우주항공': '🚀', '항공우주': '🚀', 'Aerospace': '🚀',
  '2차전지': '🔋', '배터리': '🔋',
  '자율주행': '🚗', 'EV': '🚗',
  'TDF': '📅', 'TDF Fund': '📅',
  '배당': '💰', '배당 성장': '💰',
  '채권': '🏛️', 'Bonds': '🏛️',
  '핀테크': '💳', 'Fintech': '💳',
  'IT': '💻', 'Technology': '💻', '기술': '💻',
  '바이오': '🧬', 'Biotech': '🧬',
  '헬스케어': '🏥', 'Healthcare': '🏥',
  '금융': '🏦', 'Financial': '🏦',
  '에너지': '⚡', 'Energy': '⚡',
  '소비재': '🛒', 'Consumer': '🛒',
  '산업재': '🏭', 'Industrial': '🏭',
  '통신서비스': '📡', 'Communication': '📡',
  '필수소비재': '🥫',
  '유틸리티': '💡',
  '소재': '⛏️', 'Materials': '⛏️',
  '부동산': '🏢', 'Real Estate': '🏢',
  '원자력': '⚛️',
  '크립토': '₿', 'Crypto': '₿', 'BTC ETF': '₿',
  '기타': '📦',
}
function iconFor(name, type) {
  if (!name) return '📊'
  if (type === 'account') return ACC_ICONS[name] || '📊'
  // 섹터: 완전 일치 먼저, 아니면 부분 매칭
  if (SECTOR_ICONS[name]) return SECTOR_ICONS[name]
  for (const k of Object.keys(SECTOR_ICONS)) {
    if (name.includes(k) || k.includes(name)) return SECTOR_ICONS[k]
  }
  return '📊'
}

/* ── 분석 리포트 MD 빌더 (타 LLM 교차검증용) ── */
function _won(n) { return '₩' + Math.round(n || 0).toLocaleString() }
function _pct(v, t) { return t > 0 ? (v / t * 100) : 0 }
function _strategyToMd(s) {
  if (!s || typeof s !== 'object')
    return '_AI 전략 리포트가 아직 생성되지 않았습니다 — 분석 탭에서 "다온 AI 전략 리포트"를 생성한 뒤 다시 내보내면 포함됩니다._'
  const skip = new Set(['_cached', '_computed_at', 'cached', 'computed_at', 'fingerprint', 'scope', 'model'])
  const out = []
  for (const [k, v] of Object.entries(s)) {
    if (skip.has(k) || v == null) continue
    if (typeof v === 'string' && v.trim()) out.push(`**${k}**\n\n${v}\n`)
    else if (Array.isArray(v) && v.length) out.push(`**${k}**\n` + v.map(x => typeof x === 'string' ? `- ${x}` : `- ${JSON.stringify(x)}`).join('\n') + '\n')
    else if (typeof v === 'object') out.push(`**${k}**\n\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\`\n`)
  }
  return out.join('\n') || '_(전략 내용 없음)_'
}
function _buildAnalysisMd({ dateStr, rows, health, alerts, div, strategy }) {
  const totalVal = rows.reduce((s, r) => s + r.value, 0)
  const acc = {}, sec = {}
  for (const r of rows) { acc[r.account] = (acc[r.account] || 0) + r.value; sec[r.sector] = (sec[r.sector] || 0) + r.value }
  const L = []
  L.push(`# 다온 포트폴리오 분석 리포트`, ``)
  L.push(`- **생성일**: ${dateStr}`)
  L.push(`- **출처**: 다온(daonwealth.com) 분석 탭 내보내기`)
  L.push(`- **용도**: 타 LLM 교차검증 — 분석 정합성·오류·품질 향상`)
  L.push(`- ⚠️ 본 문서는 **개인 보유 데이터**를 포함합니다. 공유 시 주의.`, ``)
  L.push(`## 1. 보유 구성`)
  L.push(`- 총 평가액(KRW 환산): **${_won(totalVal)}** · 보유 **${rows.length}종**`, ``)
  L.push(`### 계좌별`, `| 계좌 | 평가액 | 비중 |`, `|---|--:|--:|`)
  for (const [k, v] of Object.entries(acc).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${_won(v)} | ${_pct(v, totalVal).toFixed(1)}% |`)
  L.push(``, `### 섹터별`, `| 섹터 | 평가액 | 비중 |`, `|---|--:|--:|`)
  for (const [k, v] of Object.entries(sec).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${_won(v)} | ${_pct(v, totalVal).toFixed(1)}% |`)
  L.push(``, `### 종목별`, `| 종목 | 티커 | 계좌 | 섹터 | 수량 | 평가액 | 비중 | 평가손익% |`, `|---|---|---|---|--:|--:|--:|--:|`)
  for (const r of [...rows].sort((a, b) => b.value - a.value))
    L.push(`| ${r.name} | ${r.ticker} | ${r.account} | ${r.sector} | ${r.qty} | ${_won(r.value)} | ${_pct(r.value, totalVal).toFixed(1)}% | ${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(1)}% |`)
  L.push(``, `## 2. Portfolio Health Score`)
  if (health) {
    L.push(`- 종합: **${health.overall}/100 (${health.grade}등급)**`)
    if (health.sub_scores) L.push(`- 하위지표: ` + Object.entries(health.sub_scores).map(([k, v]) => `${k} ${v}`).join(' · '))
    if (health.stats) L.push(`- 통계: ${health.stats.holdings_count}종 · 최대섹터 ${health.stats.max_sector_pct}% · 평균MDD -${health.stats.avg_mdd}% · 샤프 ${health.stats.avg_sharpe}`)
    if (health.comment) L.push(`- 종합평가: ${health.comment}`)
  } else L.push(`_계산 실패 또는 데이터 부족_`)
  L.push(``, `## 3. 자동 리밸런싱 경고`)
  const al = alerts?.alerts || []
  if (!al.length) L.push(`- 현재 임계값 기준 경고 없음`)
  else for (const a of al) L.push(`- [${a.severity}] ${a.title}${a.detail ? ` — ${a.detail}` : ''}`)
  if (div && (div.annual_estimate_krw || div.ttm_received_krw)) {
    L.push(``, `## 4. 배당`)
    if (div.annual_estimate_krw) L.push(`- 연간 예상 배당: ${_won(div.annual_estimate_krw)}`)
    if (div.ttm_received_krw) L.push(`- 최근 12개월 수령: ${_won(div.ttm_received_krw)}`)
  }
  L.push(``, `## 5. AI 전략 리포트 (Claude Haiku)`, _strategyToMd(strategy))
  L.push(``, `## 6. 교차검증 요청 (다른 LLM에게)`, `아래 관점에서 검토해 주세요:`)
  L.push(`1. **수치 정합성** — 비중 합계·평가액·손익 계산 오류`)
  L.push(`2. **진단 타당성** — Health Score·집중도 경고가 보유 구성과 부합하는지`)
  L.push(`3. **누락 리스크** — 놓친 집중·상관·거시 리스크`)
  L.push(`4. **개선 제안** — 분산·리밸런싱·헷지 관점의 구체적 액션`)
  L.push(`5. **AI 전략 품질** — 근거·실행가능성·과신 여부`)
  L.push(``, `> 가정: 미국 종목은 USD→KRW 환율 환산, 가격은 조회 시점 기준. 참고용이며 투자 자문 아님.`)
  return L.join('\n')
}

export default function AllocationTab() {
  const usdKrw          = useStore(s => s.usdKrw)
  const hasAnthropicKey = useStore(s => s.hasAnthropicKey)
  const setChartTicker  = useStore(s => s.setChartTicker)
  const currentUser     = useStore(s => s.currentUser)
  const aiEnabled       = !!currentUser?.ai_enabled || !!currentUser?.is_admin
  // 동적 계좌
  const { accountKeys: ACCOUNTS, accLabels: ACC_LABELS } = useAccounts()

  const [view,       setView]       = useState('계좌별')
  const [accFilter,  setAccFilter]  = useState('ALL')  // for 섹터별/종목별
  const [expandedKey, setExpandedKey] = useState(null) // 클릭 시 펼쳐지는 그룹 키
  const [metrics,    setMetrics]    = useState(null)  // { metrics: [...], summary: {...}, computed_at, fingerprint }
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsErr, setMetricsErr] = useState('')
  const [metricsAcc, setMetricsAcc] = useState('ALL')
  const [metricsStale, setMetricsStale] = useState(false)  // 보유 종목 변경 감지

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })

  const allHoldings = React.useMemo(() => {
    if (!portfolio) return []
    const result = []
    for (const acc of ACCOUNTS) {
      for (const h of portfolio.portfolios?.[acc] || []) {
        result.push({ ...h, account: acc })
      }
    }
    return result
  }, [portfolio])

  const tickers = allHoldings.map(h => h.ticker)
  const { data: prices = {} } = useQuery({
    queryKey: ['prices-batch', tickers.join(',')],
    queryFn: () => getPricesBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 60_000,
  })

  const isUs = h => !/^A?\d{6}$/.test(h.ticker)
  const val  = h => {
    const cur = effPrice(h, prices)
    return h.quantity * cur * (isUs(h) ? usdKrw : 1)
  }

  // 뷰에 따른 데이터 (accFilter 적용)
  const filteredForView = React.useMemo(() => {
    if (view === '계좌별') return allHoldings
    if (accFilter === 'ALL') return allHoldings
    return allHoldings.filter(h => h.account === accFilter)
  }, [allHoldings, view, accFilter])

  const pieData = React.useMemo(() => {
    if (view === '계좌별') {
      const map = {}
      for (const h of allHoldings) {
        const k = ACC_LABELS[h.account] || h.account
        map[k] = (map[k] || 0) + val(h)
      }
      return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
    }
    if (view === '섹터별') {
      const map = {}
      for (const h of filteredForView) {
        const k = h.sector || '기타'
        map[k] = (map[k] || 0) + val(h)
      }
      return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
    }
    // 종목별: name으로 표시
    return filteredForView
      .map(h => ({ name: h.name || h.ticker, ticker: h.ticker, value: Math.round(val(h)), quantity: h.quantity }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }, [filteredForView, view, allHoldings, prices, usdKrw])

  const total = pieData.reduce((s, d) => s + d.value, 0)

  // 다온 AI 전략 리포트
  const [exporting, setExporting] = useState(false)
  async function exportReport() {
    if (exporting || allHoldings.length === 0) return
    setExporting(true)
    try {
      const rows = allHoldings.map(h => {
        const cur = effPrice(h, prices)
        return {
          ticker: h.ticker, name: h.name || h.ticker,
          account: ACC_LABELS[h.account] || h.account, sector: h.sector || '기타',
          qty: h.quantity, value: Math.round(val(h)),
          pnl: h.avg_price > 0 ? (cur - h.avg_price) / h.avg_price * 100 : 0,
        }
      })
      const payload = {
        holdings: allHoldings.map(h => ({ ticker: h.ticker, quantity: h.quantity,
          avg_price: h.avg_price, account: h.account, sector: h.sector, name: h.name })),
        prices, usd_krw: usdKrw,
      }
      const [hR, aR, dR] = await Promise.allSettled([
        getPortfolioHealth(payload),
        getPortfolioAlerts({ ...payload, target_max_ticker_pct: 30, target_max_sector_pct: 50, target_max_loss_pct: -20 }),
        getPortfolioDividends(payload),
      ])
      // KST 기준 날짜 (toISOString은 UTC라 KST 오전엔 전날로 표기되던 버그 수정)
      const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
      const md = _buildAnalysisMd({
        dateStr, rows,
        health: hR.status === 'fulfilled' ? hR.value : null,
        alerts: aR.status === 'fulfilled' ? aR.value : null,
        div:    dR.status === 'fulfilled' ? dR.value : null,
        strategy: strategyReport,
      })
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `daon-portfolio-analysis-${dateStr}.md`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('리포트 생성 실패: ' + (e?.response?.data?.detail || e?.message || e))
    } finally { setExporting(false) }
  }

  const [strategyReport, setStrategyReport] = useState(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategyErr, setStrategyErr] = useState('')
  const [strategyAcc, setStrategyAcc] = useState('ALL')
  const [strategyComputedAt, setStrategyComputedAt] = useState(0)  // epoch seconds
  // 은퇴까지 기간·월 납입은 '목표 기반 포트폴리오' 카드에서 설정 → localStorage 공유(생성 시 읽음)

  // 계좌 필터/최초 진입 시: 저장된 전략 결과 미리보기
  useEffect(() => {
    if (allHoldings.length === 0) return
    let aborted = false
    ;(async () => {
      try {
        const cached = await getPortfolioStrategyCached(strategyAcc)
        if (aborted) return
        if (cached?.cached && cached.data) {
          setStrategyReport(cached.data)
          setStrategyComputedAt(cached.computed_at || 0)
          setStrategyErr('')
        } else {
          setStrategyReport(null)
          setStrategyComputedAt(0)
        }
      } catch {
        if (!aborted) { setStrategyReport(null); setStrategyComputedAt(0) }
      }
    })()
    return () => { aborted = true }
  }, [strategyAcc, allHoldings.length])

  async function runStrategy(forceRefresh = false) {
    const targets = strategyAcc === 'ALL'
      ? allHoldings
      : allHoldings.filter(h => h.account === strategyAcc)
    if (targets.length === 0) { setStrategyErr('해당 계좌에 종목이 없습니다'); return }
    setStrategyLoading(true); setStrategyErr('')
    if (forceRefresh) setStrategyReport(null)
    try {
      const res = await getPortfolioStrategy({
        holdings: targets.map(h => ({ ...h })),
        prices,
        scope: strategyAcc,
        force_refresh: forceRefresh,
        years_to_retirement: Number(localStorage.getItem('daon_retire_years')) || null,
        monthly_inflow: Number(localStorage.getItem('daon_monthly_inflow')) || null,
      })
      // 캐시 적중 → 즉시 결과. 미스 → 백그라운드 생성 중(generating) → 폴링.
      if (res && !res.generating) {
        setStrategyReport(res)
        setStrategyComputedAt(Math.floor(Date.now() / 1000))
        return
      }
      const fp = res?.fingerprint
      const started = Date.now()
      // AI 생성은 1~3분 소요 — 5초 간격으로 최대 ~3.5분 폴링 (Cloudflare 100s 한도 우회)
      while (fp && Date.now() - started < 210_000) {
        await new Promise(r => setTimeout(r, 5000))
        let p
        try { p = await pollPortfolioStrategy(fp, strategyAcc) } catch { continue }
        if (p.status === 'done') {
          setStrategyReport(p.data)
          setStrategyComputedAt(Math.floor(Date.now() / 1000))
          return
        }
        if (p.status === 'error') { setStrategyErr(p.error || 'AI 분석 실패'); return }
        // running / unknown → 계속 폴링
      }
      setStrategyErr('분석이 지연되고 있습니다 — 잠시 후 다시 시도해주세요')
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || '분석 실패'
      setStrategyErr(msg)
    } finally {
      setStrategyLoading(false)
    }
  }

  // 보유 종목 구성 fingerprint 계산 (백엔드와 동일 로직)
  const currentFingerprint = React.useMemo(() => {
    const targets = metricsAcc === 'ALL'
      ? allHoldings
      : allHoldings.filter(h => h.account === metricsAcc)
    if (targets.length === 0) return ''
    const items = targets.map(h => [
      h.ticker,
      Math.round(Number(h.avg_price) * 10000) / 10000,
      Math.round(Number(h.quantity) * 10000) / 10000,
      h.account || '',
    ])
    items.sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0))
    return JSON.stringify(items)
  }, [allHoldings, metricsAcc])

  // 계좌 필터 또는 최초 진입 시: 저장된 결과 불러오기
  // (성과 분석 카드 제거됨 — 자동 cached fetch effect 삭제로 불필요 API 호출 차단)

  async function runMetrics(forceRefresh = false) {
    const targets = metricsAcc === 'ALL'
      ? allHoldings
      : allHoldings.filter(h => h.account === metricsAcc)
    if (targets.length === 0) { setMetricsErr('해당 계좌에 종목이 없습니다'); return }
    setMetricsLoading(true); setMetricsErr('')
    try {
      const result = await getPortfolioMetrics({
        holdings: targets.map(h => ({ ticker: h.ticker, avg_price: h.avg_price, quantity: h.quantity, account: h.account })),
        scope: metricsAcc,
        force_refresh: forceRefresh,
      })
      setMetrics(result)
      setMetricsStale(false)
    } catch (e) {
      setMetricsErr(e.response?.data?.detail || e.message || '계산 실패')
    } finally {
      setMetricsLoading(false)
    }
  }

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.05) return null
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const short = name.length > 6 ? name.slice(0, 6) + '…' : name
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
        fontSize={10} fontWeight={700}>
        <tspan x={x} dy="-5">{short}</tspan>
        <tspan x={x} dy="13">{(percent * 100).toFixed(1)}%</tspan>
      </text>
    )
  }

  return (
    <div style={{ paddingTop: 8 }}>
      {/* 한눈에 보이는 포트폴리오 요약 (M3 banner) — 항상 최상단 */}
      {allHoldings.length > 0 && (
        <PortfolioSummaryBanner allHoldings={allHoldings} prices={prices} usdKrw={usdKrw} />
      )}

      {/* 분석 리포트 MD 내보내기 — 타 LLM 교차검증용 */}
      {allHoldings.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={exportReport} disabled={exporting} style={{
            padding: '7px 14px', borderRadius: 2, background: 'transparent',
            border: '1px solid var(--m-outline-variant)', color: 'var(--m-text-secondary)',
            fontSize: 12, fontWeight: 700, cursor: exporting ? 'default' : 'pointer',
            opacity: exporting ? 0.5 : 1, fontFamily: 'inherit' }}
            title="현재 분석 결과(보유구성·Health·경고·배당·AI전략)를 마크다운으로 내려받아 다른 LLM에 교차검증 의뢰">
            {exporting ? '리포트 생성 중… (최대 20초)' : '분석 리포트 MD 내보내기'}
          </button>
        </div>
      )}

      {/* ━━ Ⅰ. 포트폴리오 스냅샷 — 현황 한눈에 ━━ */}
      <ChapterHeader n="Ⅰ" title="포트폴리오 스냅샷" sub="자산 추이 · 배당 · 비중 구성" />

      {/* Net Worth 추이 */}
      <NetWorthChart />

      {/* 배당금 이력 + 캘린더 */}
      {allHoldings.length > 0 && (
        <DividendsCard allHoldings={allHoldings} usdKrw={usdKrw} />
      )}
      {/* (이어서 아래에 비중 — 계좌·섹터·종목 분해가 표시됩니다) */}


      {/* View toggle */}
      <div className="seg-ctrl" style={{ marginBottom: 12 }}>
        {['계좌별', '섹터별', '종목별'].map(v => (
          <button key={v} className={`seg-btn ${view === v ? 'active' : ''}`}
            onClick={() => setView(v)}>{v}</button>
        ))}
      </div>

      {/* Account filter (섹터별/종목별일 때만) */}
      {view !== '계좌별' && (
        <div className="seg-ctrl" style={{ marginBottom: 12 }}>
          {['ALL', ...ACCOUNTS].map(acc => (
            <button key={acc}
              className={`seg-btn ${accFilter === acc ? 'active' : ''}`}
              onClick={() => setAccFilter(acc)}
              style={{ fontSize: 12 }}>
              {acc === 'ALL' ? '전체' : ACC_LABELS[acc]}
            </button>
          ))}
        </div>
      )}

      {pieData.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div>데이터가 없습니다</div>
        </div>
      ) : (
        <>
          {/* 파이 차트 — 슬라이스별 그라데이션 + 부드러운 drop-shadow */}
          <div style={{ background: 'var(--clr-surface)', borderRadius: 4,
            padding: '20px 0 12px', marginBottom: 12,
            border: '1px solid var(--m-outline-variant)',
            position: 'relative', overflow: 'hidden' }}>
            {/* 배경 mesh-gradient (얇은 액센트) */}
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background:
                'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(99,102,241,.06) 0%, transparent 70%)',
            }} />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <defs>
                  {pieData.map((_, i) => {
                    const base = COLORS[i % COLORS.length]
                    return (
                      <linearGradient
                        key={`pg-${i}`}
                        id={`pie-grad-${i}`}
                        x1="0%" y1="0%" x2="100%" y2="100%"
                      >
                        <stop offset="0%"   stopColor={base} stopOpacity="1" />
                        <stop offset="100%" stopColor={base} stopOpacity="0.72" />
                      </linearGradient>
                    )
                  })}
                  <filter id="pie-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                    <feOffset dx="0" dy="2" result="offsetblur" />
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.22" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <Pie data={pieData} cx="50%" cy="50%"
                  outerRadius={108} innerRadius={56}
                  paddingAngle={1.2}
                  cornerRadius={4}
                  dataKey="value" nameKey="name"
                  labelLine={false} label={renderLabel}
                  isAnimationActive={true} animationDuration={650}
                  filter="url(#pie-shadow)">
                  {pieData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={`url(#pie-grad-${i})`}
                      stroke="var(--clr-surface)"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [`₩${v.toLocaleString()}`, name]}
                  contentStyle={{
                    borderRadius: 4,
                    border: '1px solid var(--clr-border-md)',
                    boxShadow: '0 8px 24px rgba(15,23,42,.12)',
                    fontSize: 12,
                    background: 'var(--clr-surface)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* 중앙 총합 표기 */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)', textAlign: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--clr-text-muted)',
                letterSpacing: '.1em', textTransform: 'uppercase' }}>총 평가액</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--clr-text-strong)',
                letterSpacing: '-.02em', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                ₩{(total / 1e8 >= 1
                  ? `${(total / 1e8).toFixed(2)}억`
                  : total / 1e4 >= 1
                    ? `${(total / 1e4).toFixed(0)}만`
                    : total.toLocaleString())}
              </div>
            </div>
          </div>

          {/* 범례 리스트 */}
          <div style={{ background: 'var(--clr-surface)', borderRadius: 4, padding: '4px 16px 8px',
            border: '1px solid var(--m-outline-variant)', marginBottom: 16 }}>
            {pieData.map((d, i) => {
              const isStock = !!d.ticker
              const color = COLORS[i % COLORS.length]
              const iconType = view === '계좌별' ? 'account' : 'sector'
              const groupKey = `${view}:${d.name}`
              const expanded = !isStock && expandedKey === groupKey

              // 해당 그룹에 속하는 하위 종목 찾기
              const children = !isStock ? allHoldings.filter(h => {
                if (view === '계좌별') {
                  // d.name 은 "미국" 등 ACC_LABELS
                  const accKey = Object.entries(ACC_LABELS).find(([, v]) => v === d.name)?.[0]
                  return accKey ? h.account === accKey : false
                }
                if (view === '섹터별') {
                  return (h.sector || '기타') === d.name
                }
                return false
              }).map(h => ({ ...h, v: val(h) }))
                .sort((a, b) => b.v - a.v)
                : []

              return (
                <div key={d.name + i}>
                  <div
                    onClick={() => isStock ? setChartTicker(d.ticker)
                                           : setExpandedKey(expanded ? null : groupKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 0',
                      borderBottom: (i < pieData.length - 1 || expanded) ? '1px solid #F1F5F9' : 'none',
                      cursor: 'pointer',
                    }}>
                    {isStock ? (
                      <LogoCircle ticker={d.ticker} size={28} />
                    ) : (
                      <div style={{
                        width: 32, height: 32, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, filter: 'grayscale(100%) opacity(.75)',
                      }}>{iconFor(d.name, iconType)}</div>
                    )}
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600,
                      color: isStock ? '#0284C7' : '#0F172A',
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                      {isStock && d.ticker !== d.name && (
                        <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 4 }}>({d.ticker})</span>
                      )}
                      {!isStock && children.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 6 }}>
                          · {children.length}종목
                        </span>
                      )}
                    </span>
                    {d.quantity != null && view === '종목별' && (
                      <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', minWidth: 36 }}>
                        {d.quantity}주
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', minWidth: 36, textAlign: 'right' }}>
                      {total > 0 ? (d.value / total * 100).toFixed(1) : 0}%
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)',
                      minWidth: 86, textAlign: 'right' }}>
                      ₩{d.value.toLocaleString()}
                    </span>
                    {!isStock && (
                      <span style={{ fontSize: 10, color: 'var(--clr-text-muted)',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform .15s' }}>▼</span>
                    )}
                  </div>

                  {/* 펼친 하위 종목 */}
                  {expanded && children.length > 0 && (
                    <div style={{ padding: '4px 0 8px 42px',
                      borderBottom: i < pieData.length - 1 ? '1px solid #F1F5F9' : 'none',
                      background: 'var(--clr-bg)' }}>
                      {children.map(c => (
                        <div key={c.ticker}
                          onClick={(e) => { e.stopPropagation(); setChartTicker(c.ticker) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                            cursor: 'pointer', borderRadius: 8 }}>
                          <LogoCircle ticker={c.ticker} size={22} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--clr-info-dark)',
                            fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name || c.ticker}
                            <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 4 }}>({c.ticker})</span>
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', minWidth: 44, textAlign: 'right' }}>
                            {total > 0 ? (c.v / total * 100).toFixed(1) : 0}%
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-strong)',
                            minWidth: 80, textAlign: 'right' }}>
                            ₩{Math.round(c.v).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ━━ Ⅱ. 리스크 진단 · 건강도 ━━ */}
      {allHoldings.length > 0 && (
        <>
          <ChapterHeader n="Ⅱ" title="리스크 진단 · 건강도"
            sub="종합 건강 점수 · 자동 리밸런싱 경고 · 백테스트" />
          <HealthScoreCard allHoldings={allHoldings} prices={prices} usdKrw={usdKrw} />
          <AlertsCard allHoldings={allHoldings} prices={prices} usdKrw={usdKrw} />
        </>
      )}

      {/* 백테스트 시뮬레이션 */}
      {allHoldings.length > 0 && (
        <BacktestSection allHoldings={allHoldings} />
      )}

      {/* ━━ Ⅲ. 액션 플랜 & 목표 ━━ */}
      <ChapterHeader n="Ⅲ" title="액션 플랜 & 목표"
        sub="목표 기반 계획 · AI 시계열 전략 · 리밸런싱 · 액션" />
      <GoalsCard />

      {/* 다온 AI 전략 리포트 — Portfolio Strategy Report 스타일 */}
      {allHoldings.length > 0 && (
        <>
          <div className="tt-ai-widget" style={{ marginBottom: 12 }}>
            {/* 로딩 중에만 BorderBeam — 일반 상태는 정적 */}
            {strategyLoading && (
              <BorderBeam
                size={260}
                duration={4}
                colorFrom="#8B5CF6"
                colorTo="#6366F1"
              />
            )}
            <div className="tt-ai-content">
              {/* AI POWERED + 타이틀 한 줄 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="tt-ai-badge">AI POWERED</div>
                <div className="tt-ai-title">Portfolio Strategy Report</div>
              </div>
              <div className="tt-ai-desc" style={{ marginTop: 6 }}>
                보유 종목 + 은퇴 타임라인을 결합해 5년 단위 자산배분·월배당 시뮬을 생성합니다. 소요 약 1~3분.
              </div>

              {/* 은퇴 기간·월 납입은 위 '목표 기반 포트폴리오'에서 설정 → 여기선 그 값을 읽어 분석에만 반영 */}
              <div className="tt-ai-desc" style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
                은퇴까지 기간·매월 납입액은 위 <strong>목표 기반 포트폴리오</strong>에서 설정한 값을 사용합니다.
              </div>

              {/* 분석 대상(드롭다운 필터) + 실행 버튼 — 같은 줄 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                flexWrap: 'wrap', marginTop: 12 }}>
                <select
                  value={strategyAcc}
                  onChange={e => setStrategyAcc(e.target.value)}
                  aria-label="분석 대상 계좌"
                  style={{
                    appearance: 'none', WebkitAppearance: 'none',
                    height: 36, padding: '0 30px 0 12px', borderRadius: 8,
                    border: '1px solid rgba(148,163,184,.35)',
                    background: 'rgba(15,23,42,.45)', color: '#F8FAFC',
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                    cursor: 'pointer', letterSpacing: '-.01em',
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23CBD5E1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center',
                  }}>
                  {['ALL', ...ACCOUNTS].map(acc => (
                    <option key={acc} value={acc} style={{ color: '#0F172A' }}>
                      {acc === 'ALL'
                        ? '전체 계좌'
                        : `${ACC_LABELS[acc]} (${allHoldings.filter(h => h.account === acc).length})`}
                    </option>
                  ))}
                </select>

                <ShimmerButton
                  variant="ai"
                  disabled={strategyLoading || !hasAnthropicKey || !aiEnabled}
                  onClick={() => runStrategy(!!strategyReport)}
                  style={{ width: 'fit-content' }}>
                  {strategyLoading ? (
                    <><Spinner /> AI가 분석 중입니다...</>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                      {strategyReport ? '↻ 최신 정보로 업데이트' : 'AI 전략 분석 시작'}
                    </>
                  )}
                </ShimmerButton>
              </div>

              {/* 저장된 분석 미리보기 박스 — 사용자 요청으로 비표시 (주석 보존, 2026-06-06)
              {strategyReport && !strategyLoading && strategyComputedAt > 0 && (
                <div style={{
                  marginTop: 12, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(99,102,241,.18)',
                  border: '1px solid rgba(99,102,241,.35)',
                  fontSize: 11, color: 'rgba(248,250,252,.85)', lineHeight: 1.5,
                }}>
                  <span style={{ fontWeight: 700, color: '#C7D2FE' }}>저장된 분석 미리보기</span>
                  <span style={{ marginLeft: 6, opacity: 0.85 }}>
                    · {formatRelativeKo(strategyComputedAt)}
                  </span>
                </div>
              )} */}
            </div>
            {!hasAnthropicKey && (
              <div className="tt-ai-nokey">⚠ API Key 미설정 — 관리 탭에서 설정하세요</div>
            )}
            {hasAnthropicKey && !aiEnabled && (
              <div className="tt-ai-nokey" style={{ color: 'var(--clr-warn, #F59E0B)' }}>
                🔒 AI 분석 권한이 비활성화되어 있습니다 — 관리자에게 사용 권한 요청을 부탁드립니다
              </div>
            )}
          </div>

          {strategyErr && (
            <div style={{ padding: '10px 12px', borderRadius: 2,
              border: '1px solid var(--m-negative)',
              color: 'var(--m-negative)', fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
              {strategyErr}
            </div>
          )}

          {strategyReport && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
              style={{ marginBottom: 16 }}
            >
              <DaonAIReport data={strategyReport} computedAt={strategyComputedAt} />
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}

function MetricsResult({ data, holdings }) {
  const { metrics, summary } = data
  const holdingMap = Object.fromEntries(holdings.map(h => [h.ticker, h]))

  const colorFor = (v, type) => {
    if (v == null) return '#94A3B8'
    if (type === 'return') return v >= 0 ? '#16A34A' : '#DC2626'
    if (type === 'mdd')    return v <= 10 ? '#16A34A' : v <= 25 ? '#D97706' : '#DC2626'
    if (type === 'sharpe') return v >= 1 ? '#16A34A' : v >= 0 ? '#D97706' : '#DC2626'
    return '#334155'
  }
  const fmt = (v, type) => {
    if (v == null) return '—'
    if (type === 'return') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
    if (type === 'mdd')    return `-${v.toFixed(1)}%`
    if (type === 'sharpe') return v.toFixed(2)
    return v
  }

  return (
    <div>
      {/* 포트폴리오 요약 카드 */}
      {summary && summary.valid_count > 0 && (
        <div style={{ background: 'var(--clr-bg)', borderRadius: 4, padding: '12px 14px', marginBottom: 14,
          border: '1px solid var(--clr-border-md)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-mid)', marginBottom: 10 }}>
            포트폴리오 종합 ({summary.valid_count}개 종목 평균)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: '평균 수익률', value: fmt(summary.avg_return, 'return'), color: colorFor(summary.avg_return, 'return') },
              { label: '평균 MDD', value: fmt(summary.avg_mdd, 'mdd'), color: colorFor(summary.avg_mdd, 'mdd') },
              { label: '평균 샤프', value: fmt(summary.avg_sharpe, 'sharpe'), color: colorFor(summary.avg_sharpe, 'sharpe') },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center', padding: '8px 4px',
                background: 'var(--clr-surface)', borderRadius: 8, border: '1px solid var(--clr-border-md)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: '최고 수익', value: summary.best_ticker },
              { label: '최저 수익', value: summary.worst_ticker },
              { label: '최고 위험(MDD)', value: summary.highest_risk },
              { label: '최고 샤프', value: summary.best_sharpe },
            ].map(item => (
              <div key={item.label} style={{ fontSize: 11, color: 'var(--clr-text-sub)' }}>
                <span style={{ color: 'var(--clr-text-muted)' }}>{item.label}: </span>
                <span style={{ fontWeight: 700, color: 'var(--clr-text-strong)' }}>
                  {holdingMap[item.value]?.name || item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 종목별 테이블 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--clr-border-md)' }}>
              {['종목', '계좌', '수익률', 'MDD', '샤프'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: h === '종목' ? 'left' : 'right',
                  color: 'var(--clr-text-sub)', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.sort((a, b) => (b.return_pct ?? -999) - (a.return_pct ?? -999)).map((m, i) => {
              const h = holdingMap[m.ticker]
              return (
                <tr key={m.ticker + i} style={{ borderBottom: '1px solid var(--clr-border)' }}>
                  <td style={{ padding: '8px 8px', fontWeight: 600, color: 'var(--clr-text-strong)' }}>
                    <div style={{ fontSize: 12 }}>{h?.name || m.ticker}</div>
                    <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>{m.ticker}</div>
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--clr-text-sub)', fontSize: 11 }}>
                    {ACC_LABELS[m.account] || m.account || '—'}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700,
                    color: colorFor(m.return_pct, 'return') }}>
                    {fmt(m.return_pct, 'return')}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700,
                    color: colorFor(m.mdd, 'mdd') }}>
                    {fmt(m.mdd, 'mdd')}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700,
                    color: colorFor(m.sharpe, 'sharpe') }}>
                    {fmt(m.sharpe, 'sharpe')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--clr-bg)', borderRadius: 8,
        fontSize: 10, color: 'var(--clr-text-muted)', lineHeight: 1.8 }}>
        <strong style={{ color: 'var(--clr-text-sub)' }}>지표 해석 가이드</strong><br />
        수익률: 평균단가 기준 현재 손익률<br />
        MDD: 1년 내 최고점 대비 최대 낙폭 — 낮을수록 안정적 (10% 이하 ✅, 25% 초과 ⚠️)<br />
        샤프: 위험 대비 초과수익 — 1 이상 우수, 0 미만 비효율 (무위험률 4% 적용)
      </div>
    </div>
  )
}

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
      borderTop: '2px solid #fff', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  )
}

/* 한글 문장을 마침표(.) 기준으로 잘라 bullet 배열로 변환. 1문장이면 그대로 1개. */
function splitToSentences(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .split(/(?<=[.。!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 4)
}

/* 문장이 끝나면(.?!。) 줄바꿈 삽입 — whiteSpace:'pre-line' 컨테이너와 함께 사용. */
function breakSentences(text) {
  if (typeof text !== 'string') return text
  return text.replace(/([^\d\s])([.?!。])\s+/g, '$1$2\n').trim()
}

/* 분석탭 3대 장 구분 헤더 (스냅샷 → 리스크 진단 → 액션). design.md 직사각·무채색 준수. */
function ChapterHeader({ n, title, sub }) {
  return (
    <div style={{ margin: '20px 0 10px', borderTop: '2px solid var(--m-text)', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--m-primary)' }}>{n}</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--m-text)',
          letterSpacing: '-.02em' }}>{title}</span>
      </div>
      {sub && <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-tertiary)',
        marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/* 숫자·퍼센트·금액을 글자색+굵게 강조 (음영 X, 직사각형 X). 음수=빨강 / 양수=초록 / 중립=진한글씨 */
function NumHighlight({ text }) {
  if (!text) return null
  const re = /(\+?-?\d+(?:,\d{3})*(?:\.\d+)?%?|₩\s*[\d,]+|\$\s*[\d,]+(?:\.\d+)?)/g
  const numRe = /^(\+?-?\d+(?:,\d{3})*(?:\.\d+)?%?|₩\s*[\d,]+|\$\s*[\d,]+(?:\.\d+)?)$/
  return (
    <>
      {text.split(re).map((p, i) => {
        if (!p) return null
        if (numRe.test(p)) {
          const klass = /^-/.test(p) ? 'num-neg' : /^\+/.test(p) ? 'num-pos' : 'num-neutral'
          return <span key={i} className={klass}
            style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{p}</span>
        }
        return <React.Fragment key={i}>{p}</React.Fragment>
      })}
    </>
  )
}

/* AI 본문 강조 렌더러:
   - **어구** → 굵은 글씨 + 강조색(--m-primary) (AI가 문장당 핵심 1개 표시)
   - 숫자/퍼센트/금액 → 색상 + 굵게 (NumHighlight) */
function HighlightedText({ text, tone = 'neutral' }) {
  if (!text) return null
  const segs = String(text).split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {segs.map((seg, si) => {
        const m = /^\*\*([^*]+)\*\*$/.exec(seg)
        if (m) {
          return <strong key={si} style={{ color: 'var(--m-primary)', fontWeight: 800 }}>{m[1]}</strong>
        }
        return <NumHighlight key={si} text={seg} />
      })}
    </>
  )
}

/* 위험 강도 시각화 — title의 키워드 기반으로 자동 추정 */
function riskSeverity(title = '', detail = '') {
  const t = (title + ' ' + detail).toLowerCase()
  if (/매우 ?높|치명|극단|급락|폭락|심각/i.test(t)) return { level: 'critical', label: '심각', value: 0.95 }
  if (/높|취약|위협|급등|hot/i.test(t)) return { level: 'high', label: '높음', value: 0.75 }
  if (/중간|주의|보통/i.test(t)) return { level: 'med', label: '중간', value: 0.5 }
  if (/낮|경미|미미/i.test(t)) return { level: 'low', label: '낮음', value: 0.25 }
  return { level: 'med', label: '관찰', value: 0.5 }
}

/* 검증된 핵심 수치 — 백엔드가 직접 계산한 권위 수치(verified_facts).
   AI 본문 텍스트 드리프트와 무관하게 항상 이 값이 정확. (정합성 최우선) */
function VerifiedFacts({ vf }) {
  if (!vf) return null
  const top = (vf.holdings || []).slice(0, 5)
  const sectors = (vf.sectors || []).slice(0, 4)
  const tax = vf.tax_scope || {}
  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header">
        <div className="mono-section-title is-accent">검증된 핵심 수치</div>
        <span className="mono-pill" style={{ color: 'var(--m-text-tertiary)' }}>실시간 계산값</span>
      </div>
      <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)',
        margin: '4px 0 10px', lineHeight: 1.55 }}>
        아래 AI 전략 글은 가끔 숫자를 잘못 인용할 수 있습니다. 이 표는 시스템이 회원님의 보유 데이터로
        <strong style={{ color: 'var(--m-text-secondary)' }}> 직접 계산한 정확한 값</strong>이니,
        AI 글의 수치와 다르면 <strong style={{ color: 'var(--m-text-secondary)' }}>이 값을 기준</strong>으로 삼으세요.
      </div>

      <div style={{ marginBottom: 10 }}>
        <div className="m3-label" style={{ marginBottom: 2 }}>총 평가 자산</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--m-text)',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{_won(vf.total_krw)}</div>
      </div>

      {top.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: sectors.length ? 10 : 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: 'var(--m-text-tertiary)' }}>
                <th style={thStyle}>상위 종목</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>비중</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>수익률</th>
              </tr>
            </thead>
            <tbody>
              {top.map((h, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--m-outline-variant)' }}>
                  <td style={{ ...tdStyle, minWidth: 0 }}>{h.name || h.ticker}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums' }}>{h.weight_pct}%</td>
                  <td className={(h.return_pct ?? 0) >= 0 ? 'num-pos' : 'num-neg'}
                    style={{ ...tdStyle, textAlign: 'right', fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums' }}>
                    {(h.return_pct ?? 0) >= 0 ? '+' : ''}{h.return_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sectors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6,
          marginBottom: (tax.US || tax.KR) ? 10 : 0 }}>
          {sectors.map((s, i) => (
            <span key={i} style={{ fontSize: 11, color: 'var(--m-text-secondary)',
              border: '1px solid var(--m-outline-variant)', borderRadius: 2, padding: '3px 7px' }}>
              {s.sector} <strong style={{ color: 'var(--m-text)' }}>{s.weight_pct}%</strong>
            </span>
          ))}
        </div>
      )}

      {(tax.US?.count > 0 || tax.KR?.count > 0) && (
        <div style={{ display: 'flex', gap: 6 }}>
          {tax.US?.count > 0 && (
            <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--m-outline-variant)',
              borderRadius: 2, padding: '6px 8px' }}>
              <div className="m3-label">미국 계좌 · 양도세권</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-text)',
                fontVariantNumeric: 'tabular-nums' }}>{_won(tax.US.value_krw)} · {tax.US.count}종</div>
            </div>
          )}
          {tax.KR?.count > 0 && (
            <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--m-outline-variant)',
              borderRadius: 2, padding: '6px 8px' }}>
              <div className="m3-label">한국 계좌 · ISA/연금 등</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-text)',
                fontVariantNumeric: 'tabular-nums' }}>{_won(tax.KR.value_krw)} · {tax.KR.count}종</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* 저점발굴 시계열 매칭 — 단/중/장기 지평선별 고위험 혁신주 위성 후보(백엔드 결정론값).
   가드레일 대신 '시간 지평선 가중치'로 성격을 바꾸는 구조: 단기=생존력, 중기=R&D알파, 장기=0% 수렴. */
function DiscoveryHorizon({ dh }) {
  if (!dh || ((dh.short?.length || 0) === 0 && (dh.mid?.length || 0) === 0)) return null
  const Chips = ({ items, meta }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((c, i) => (
        <span key={i} style={{ fontSize: 11, color: 'var(--m-text)',
          border: '1px solid var(--m-outline-variant)', borderRadius: 2, padding: '3px 7px' }}>
          <strong>{c.ticker}</strong>
          <span style={{ color: 'var(--m-text-tertiary)', marginLeft: 4 }}>{meta(c)}</span>
        </span>
      ))}
    </div>
  )
  const Row = ({ label, desc, children }) => (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--m-outline-variant)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-text)', marginBottom: 2 }}>{label}</div>
      <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)',
        marginBottom: 6, lineHeight: 1.5 }}>{desc}</div>
      {children}
    </div>
  )
  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-title is-accent" style={{ marginBottom: 2 }}>
        저점발굴 시계열 매칭
      </div>
      <div className="mono-section-sub ko-keep" style={{ marginBottom: 6 }}>
        고위험 혁신주(AI·바이오)를 지평선별 <strong>위성(satellite)</strong> 비중으로만 — 핵심 자산 아님.
      </div>
      {dh.short?.length > 0 && (
        <Row label="단기 (1~3년) · 안정성 우선"
          desc="생존 런웨이 3년 초과 + 바닥다지기 80 초과 — 부도·증자 리스크 낮은 종목만, 소액(≤5%) 분산">
          <Chips items={dh.short} meta={c => `런웨이 ${c.runway_years}y · 바닥 ${c.base_building}`} />
        </Row>
      )}
      {dh.mid?.length > 0 && (
        <Row label="중기 (5~10년) · 구조적 알파"
          desc="R&D 집중도 최상위 — AI·바이오 메가트렌드 상업화(≈5년) 알파 포착">
          <Chips items={dh.mid} meta={c => `R&D ${c.rnd_intensity}`} />
        </Row>
      )}
      <Row label="장기 (11~15년·은퇴 임박) · 0% 수렴"
        desc={dh.long_rule || '고위험 혁신주 비중 0%로 수렴 — 자본손실 위험 동결'}>
        <span style={{ fontSize: 11, color: 'var(--m-negative)', fontWeight: 700 }}>
          목표 비중 0% (Decay)
        </span>
      </Row>
    </div>
  )
}

/* 월 배당 전환 시뮬레이터 — AI 제안(계좌·자산·비중)을 시드로, 사용자가 비중·가정 배당률을
   직접 조정하면 예상 월 현금흐름을 결정론으로 즉시 재계산. 예상월 = 총액 × 비중% × 배당률% ÷ 12. */
function _extractYield(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*%/)
  return m ? Number(m[1]) : null
}
function DividendSimulator({ sim, totalKrw }) {
  const seed = React.useMemo(() => (sim?.rows || []).map(r => ({
    account: r.account, asset: r.asset,
    weight: Number(r.weight) || 0,
    yieldPct: _extractYield(r.monthly_cashflow) ?? 3.0,
  })), [sim])
  const [rows, setRows] = useState(seed)
  const [base, setBase] = useState(Math.round(totalKrw) || 0)
  React.useEffect(() => { setRows(seed) }, [seed])
  React.useEffect(() => { if (totalKrw) setBase(Math.round(totalKrw)) }, [totalKrw])

  const won = n => '₩' + Math.round(n || 0).toLocaleString()
  const monthlyOf = r => base * (r.weight / 100) * (r.yieldPct / 100) / 12
  const totalMonthly = rows.reduce((s, r) => s + monthlyOf(r), 0)
  const weightSum = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0)
  const setRow = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const inp = {
    width: 52, textAlign: 'right', padding: '3px 5px', borderRadius: 2,
    border: '1px solid var(--m-outline-variant)', background: 'var(--m-surface)',
    color: 'var(--m-text)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
  }
  return (
    <div>
      {/* 기준 설정: 전환 대상 총액 + 합계 월 현금흐름 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="m3-label">전환 대상 총액</span>
        <input type="number" value={base} onChange={e => setBase(Number(e.target.value) || 0)}
          style={{ ...inp, width: 128 }} />
        <span style={{ fontSize: 11, color: 'var(--m-text-tertiary)' }}>원</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 900, color: 'var(--m-positive)',
          fontVariantNumeric: 'tabular-nums' }}>월 {won(totalMonthly)}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ color: 'var(--m-text-tertiary)' }}>
              <th style={thStyle}>계좌</th><th style={thStyle}>추천 자산</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>비중%</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>배당률%</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>예상 월</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--m-outline-variant)' }}>
                <td style={tdStyle}>{r.account}</td>
                <td style={tdStyle}>{r.asset}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={r.weight} min={0} max={100}
                    onChange={e => setRow(i, 'weight', Number(e.target.value) || 0)} style={inp} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={r.yieldPct} step="0.1" min={0} max={20}
                    onChange={e => setRow(i, 'yieldPct', Number(e.target.value) || 0)} style={inp} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums' }}>{won(monthlyOf(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ko-keep" style={{ fontSize: 10, lineHeight: 1.5, marginTop: 6,
        color: weightSum === 100 ? 'var(--m-text-tertiary)' : '#D97706' }}>
        {weightSum !== 100 ? `⚠ 비중 합계 ${weightSum}% (100% 기준 권장) · ` : ''}
        예상 월 = 총액 × 비중% × 배당률% ÷ 12. 가정 배당률 기반 추정이며 실제 배당은 종목·시기마다 다릅니다.
      </div>
    </div>
  )
}

function _fmtKstDateTime(epochSec) {
  if (!epochSec) return ''
  return new Date(epochSec * 1000).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function DaonAIReport({ data, computedAt = 0 }) {
  const priorityMeta = {
    HIGH: { color: '#DC2626', bg: 'rgba(220,38,38,.10)', label: '즉시', desc: '1주일 내', icon: '⚡' },
    MED:  { color: '#D97706', bg: 'rgba(217,119,6,.10)', label: '중기', desc: '1-3개월',  icon: '◆'  },
    LOW:  { color: '#16A34A', bg: 'rgba(22,163,74,.10)', label: '장기', desc: '6개월+',  icon: '✓'  },
  }

  return (
    <div>
      {/* 분석 도출 시각 — 우측 작게. 사용자가 최신 정보로 업데이트할지 판단용 */}
      {computedAt > 0 && (
        <div style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--m-text-tertiary)',
          marginBottom: 6 }}>
          분석 기준 {_fmtKstDateTime(computedAt)}
        </div>
      )}

      {/* 전문가 총평 */}
      <div className="mono-card" style={{ marginBottom: 12 }}>
        <div className="mono-section-title is-accent" style={{ marginBottom: 8 }}>
          전문가 총평
        </div>
        <BulletList items={splitToSentences(data.expert_review)}
          color="var(--m-text)" bulletColor="var(--m-text-tertiary)" tone="neutral" />
      </div>

      {/* [1] 종합 리스크 진단 — 타임라인 vs 현재 포지션 */}
      {data.risk_diagnosis && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title is-accent" style={{ marginBottom: 8 }}>
            종합 리스크 진단 · 타임라인 vs 현재 포지션
          </div>
          <BulletList items={splitToSentences(data.risk_diagnosis)}
            color="var(--m-text)" bulletColor="var(--m-text-tertiary)" tone="neutral" />
        </div>
      )}

      {/* [2] 인생 타임라인 5년 단위 자산배분 */}
      {data.allocation_phases?.length > 0 && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title is-accent" style={{ marginBottom: 10 }}>
            인생 타임라인 · 5년 단위 자산배분
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.allocation_phases.map((ph, i) => <AllocPhase key={i} phase={ph} idx={i} />)}
          </div>
        </div>
      )}

      {/* 저점발굴 시계열 매칭 — 지평선별 위성(satellite) 후보 + 장기 decay */}
      <DiscoveryHorizon dh={data.discovery_horizon} />

      {/* [3] 월 배당 전환 시뮬레이션 */}
      {data.dividend_simulation
        && (data.dividend_simulation.rows?.length > 0 || data.dividend_simulation.warning) && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>월 배당 전환 시뮬레이션</div>
          <div className="mono-section-sub ko-keep" style={{ marginBottom: 8 }}>
            비중·가정 배당수익률을 직접 조정하면 예상 월 현금흐름이 즉시 다시 계산됩니다.
          </div>
          {data.dividend_simulation.rows?.length > 0 && (
            <DividendSimulator sim={data.dividend_simulation}
              totalKrw={data.verified_facts?.total_krw || data._metrics_summary?.total_krw || 0} />
          )}
          {data.dividend_simulation.warning && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--m-surface-variant)',
              border: '1px solid var(--m-outline-variant)', borderRadius: 4 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--m-negative)',
                letterSpacing: '.03em', marginBottom: 3 }}>월가의 경고</div>
              <div className="ko-keep" style={{ fontSize: 12, color: 'var(--m-text)',
                lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {breakSentences(String(data.dividend_simulation.warning).replace(/^\s*\[?월가의 경고\]?\s*[:·-]?\s*/, ''))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 매크로 뷰 */}
      {data.macro_view && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title" style={{ marginBottom: 8 }}>
            글로벌 매크로 포지셔닝
          </div>
          <BulletList items={splitToSentences(data.macro_view)}
            color="var(--m-text)" bulletColor="var(--m-text-tertiary)" tone="neutral" />
        </div>
      )}

      {/* 위험 요소 — sev-dot 제거, 우측 라벨만 */}
      {data.risk_factors?.length > 0 && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-header">
            <div className="mono-section-title is-negative">
              주요 위험 요소 <span style={{ color: 'var(--m-text-tertiary)',
                fontWeight: 600, marginLeft: 4 }}>{data.risk_factors.length}</span>
            </div>
          </div>
          {data.risk_factors.map((r, i) => {
            const sev = riskSeverity(r.title, r.detail)
            const sevClass = `is-${sev.level}`
            return (
              <div key={i} className="mono-row">
                <div className="mono-row-content">
                  {/* 배지 좌측 통일 (추천 액션과 동일 위치) */}
                  <div className="mono-row-title ko-keep" style={{ display: 'flex',
                    alignItems: 'center', gap: 6 }}>
                    <span className={`sev-label ${sevClass}`}>{sev.label}</span>
                    <span style={{ color: 'var(--m-text)' }}>{r.title}</span>
                  </div>
                  <div className="mono-row-body ko-keep">
                    <BulletList items={splitToSentences(r.detail)}
                      color="var(--m-text)"
                      bulletColor="var(--m-text-tertiary)" tone="neutral" small />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 실행 가이드 — 리밸런싱(비중 조정) + 추천 액션 통합. 둘 다 "무엇을 할까"라 한 카드로. */}
      {(data.rebalancing || data.actions?.length > 0) && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-header">
            <div className="mono-section-title is-accent">추천 액션</div>
            <span className="mono-section-sub" style={{ paddingLeft: 0, marginTop: 0 }}>
              우선순위 순
            </span>
          </div>

          {/* 리밸런싱 = 비중 조정 제안 (좌측 띠 banner — design.md R1) */}
          {data.rebalancing && (
            <div style={{ marginBottom: data.actions?.length > 0 ? 12 : 0,
              background: 'var(--m-surface-variant)',
              border: '1px solid var(--m-outline-variant)',
              borderRadius: 4, padding: '8px 12px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--m-positive)',
                letterSpacing: '.03em', marginBottom: 4 }}>리밸런싱 · 비중 조정</div>
              <BulletList items={splitToSentences(data.rebalancing)}
                color="var(--m-text)" bulletColor="var(--m-text-tertiary)" tone="neutral" small />
            </div>
          )}

          {data.actions?.map((a, i) => {
            const m = priorityMeta[a.priority] || priorityMeta.MED
            const sevClass = a.priority === 'HIGH' ? 'is-critical'
                           : a.priority === 'MED'  ? 'is-high' : 'is-low'
            return (
              <div key={i} className="mono-row">
                <div className="mono-row-content">
                  <div className="mono-row-title" style={{ marginBottom: 2 }}>
                    <span className={`sev-label ${sevClass}`}>{m.label}</span>
                    <span style={{ color: 'var(--m-text-tertiary)', fontSize: 10.5,
                      fontWeight: 500 }}>· {m.desc}</span>
                  </div>
                  <div className="mono-row-body ko-keep">
                    <HighlightedText text={a.action} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 예외 처리 메모 — 마이크로캡 격리·환율 등 */}
      {data.edge_notes && String(data.edge_notes).trim() && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title" style={{ marginBottom: 6 }}>예외 처리 메모</div>
          <BulletList items={splitToSentences(data.edge_notes)}
            color="var(--m-text-secondary)" bulletColor="var(--m-text-tertiary)" tone="neutral" small />
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--clr-border-strong)', textAlign: 'right', marginTop: 4 }}>
        {computedAt > 0 ? `분석 도출: ${_fmtKstDateTime(computedAt)}` : '생성됨'} · Claude Sonnet 4.6
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/* ─── Life Timeline 5년 단위 자산배분 Phase 카드 (design.md R1/R2 준수) ─── */
const ALLOC_COLORS = ['#1F4FD3', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#64748B']
const thStyle = { padding: '4px 6px', fontWeight: 700, fontSize: 10.5, textAlign: 'left' }
const tdStyle = { padding: '6px 6px', color: 'var(--m-text)' }

function AllocPhase({ phase, idx }) {
  const alloc = phase.allocation || {}
  const entries = Object.entries(alloc).filter(([, v]) => Number(v) > 0)
  const total = entries.reduce((s, [, v]) => s + Number(v), 0) || 100
  return (
    <div style={{ border: '1px solid var(--m-outline-variant)', borderRadius: 4, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)' }}>
          {phase.name || `Phase ${idx + 1}`}
        </span>
        <span style={{ fontSize: 11, color: 'var(--m-text-tertiary)', fontWeight: 700 }}>{phase.years}</span>
      </div>
      {/* 자산 비중 스택 바 */}
      <div style={{ display: 'flex', height: 8, borderRadius: 2, overflow: 'hidden', marginBottom: 6,
        background: 'var(--m-outline-variant)' }}>
        {entries.map(([k, v], i) => (
          <span key={k} title={`${k} ${v}%`}
            style={{ width: `${Number(v) / total * 100}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
        ))}
      </div>
      {/* 범례 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, fontSize: 10.5,
        color: 'var(--m-text-secondary)' }}>
        {entries.map(([k, v], i) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2,
              background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
            {k} <strong style={{ color: 'var(--m-text)' }}>{v}%</strong>
          </span>
        ))}
      </div>
      {phase.account_strategy && (
        <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text)',
          lineHeight: 1.6, marginBottom: 3, whiteSpace: 'pre-line' }}>
          <span style={{ color: 'var(--m-text-tertiary)', fontWeight: 700 }}>계좌 운용 </span>
          {breakSentences(phase.account_strategy)}
        </div>
      )}
      {phase.inflow_direction && (
        <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text)',
          lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          <span style={{ color: 'var(--m-text-tertiary)', fontWeight: 700 }}>추가 투입 </span>
          {breakSentences(phase.inflow_direction)}
        </div>
      )}
    </div>
  )
}

/* ─── 시각화 helper: BulletList ─────────────────────────────────────────
   긴 문장 텍스트를 가독성 좋은 bullet 목록으로 렌더링.
   - tone: 'pos' | 'neg' | 'neutral' — 숫자 강조 색상 결정
   - small: 더 작은 폰트 사용 */
function BulletList({ items = [], color, bulletColor, tone = 'neutral', small = false }) {
  if (!items || items.length === 0) return null
  // 머릿글 마커 통일: 모든 문장(단일 포함)에 동일한 작은 정사각형 마커.
  // 전문 자산관리 보고서 톤 + design.md 직사각형 원칙(원형 점 → 사각형).
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((s, i) => (
        <li key={i} className="ko-keep" style={{
          position: 'relative', paddingLeft: 15,
          marginBottom: i < items.length - 1 ? 7 : 0,
          fontSize: small ? 12 : 13, color, lineHeight: 1.7,
        }}>
          <span style={{
            position: 'absolute', left: 0, top: '0.6em',
            width: 5, height: 5, borderRadius: 0,
            background: bulletColor || color, opacity: 0.9,
          }} />
          <HighlightedText text={s} tone={tone} />
        </li>
      ))}
    </ul>
  )
}

/* ─── 시각화 helper: GaugeTile ──────────────────────────────────────────
   포트폴리오 핵심 지표를 게이지 막대로 시각화한 타일. */
function GaugeTile({ label, value, pos, color, caption }) {
  const clampedPos = Math.max(2, Math.min(98, pos))
  return (
    <div style={{ padding: '10px 10px 12px',
      background: 'transparent', borderRadius: 2,
      border: '1px solid var(--m-outline-variant)' }}>
      <div style={{ fontSize: 11, color: 'var(--m-text-tertiary)',
        fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
        marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color,
        letterSpacing: '-.025em', fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.05 }}>{value}</div>
      {/* 게이지 막대 — 직사각형, 마커 미니 사각형 */}
      <div style={{ position: 'relative', height: 3, marginTop: 8,
        background: 'var(--m-outline-variant)', borderRadius: 0, overflow: 'visible' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${clampedPos}%`, background: color,
          transition: 'width .6s ease-out' }} />
        <div style={{ position: 'absolute', left: `${clampedPos}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 6, height: 6, background: color,
        }} />
      </div>
      <div style={{ fontSize: 10, color, marginTop: 6, fontWeight: 700 }}>{caption}</div>
    </div>
  )
}

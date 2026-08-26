import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { getPortfolio, getPricesBatch, getPortfolioMetrics, getPortfolioMetricsCached, getPortfolioStrategy, getPortfolioStrategyCached, pollPortfolioStrategy, getPortfolioHealth, getPortfolioAlerts, getPortfolioDividends } from '../api'
import { useStore } from '../store'
import { usePrivacy, maskText } from '../utils/privacy'
import LogoCircle from '../components/LogoCircle'
import InfoTip from '../components/InfoTip'
import BorderBeam from '../components/BorderBeam'
import NetWorthChart from '../components/NetWorthChart'
import GoalsCard from '../components/GoalsCard'
import HealthScoreCard from '../components/HealthScoreCard'
import AlertsCard from '../components/AlertsCard'
import DividendsCard from '../components/DividendsCard'
import PortfolioSummaryBanner from '../components/PortfolioSummaryBanner'
import CompassBanner from '../components/CompassBanner'
import ShimmerButton from '../components/ShimmerButton'
import { useAccounts } from '../utils/accounts'
import { effPrice, priceableTickers, qtyUnit } from '../utils/effPrice'
import { cashToKrw } from '../components/AccountCashCard'
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
function _buildAnalysisMd({ dateStr, rows, health, alerts, div, strategy, cashKrw = 0 }) {
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
  L.push(`- 총 평가액(KRW 환산): **${_won(totalVal)}** · 보유 **${rows.length}종**`)
  // 현금 비중은 교차검증에서 자주 묻는 항목이라 총자산과 함께 명시한다
  if (cashKrw) {
    const totalAssets = totalVal + cashKrw
    L.push(`- 예수금(KRW 환산): **${_won(cashKrw)}** · **총자산 ${_won(totalAssets)}** ` +
           `(현금 비중 ${_pct(cashKrw, totalAssets).toFixed(1)}%)`)
  }
  L.push(``)
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
  /* 🟥 금액은 반드시 priv.won()/priv.eok() 으로 찍는다 — src/utils/privacy.js 참조.
     직접 toLocaleString() 하면 가림 모드가 뚫린다(2026-08-26 사고). */
  const priv            = usePrivacy()
  const usdKrw          = useStore(s => s.usdKrw)
  const hasAnthropicKey = useStore(s => s.hasAnthropicKey)
  const setChartTicker  = useStore(s => s.setChartTicker)
  const currentUser     = useStore(s => s.currentUser)
  const aiEnabled       = !!currentUser?.ai_enabled || !!currentUser?.is_admin
  // 동적 계좌
  const { accountKeys: ACCOUNTS, accLabels: ACC_LABELS } = useAccounts()

  const [view,       setView]       = useState('계좌별')
  const [accFilter,  setAccFilter]  = useState('ALL')  // for 섹터별/종목별
  // 진단(경고·건강도) 범위. 기본은 'ALL' — 계좌 단위로만 보면 분산이 실제보다
  // 나빠 보인다(ISA에 반도체만·퇴직에 채권만이면 각각은 쏠림이지만 합치면 균형).
  const [diagAcc,    setDiagAcc]    = useState('ALL')
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

  const tickers = priceableTickers(allHoldings)   // 비상장 펀드 제외
  const { data: prices = {} } = useQuery({
    queryKey: ['prices-batch', tickers.join(',')],
    queryFn: () => getPricesBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 60_000,
  })

  const isUs = h => !/^A?\d[0-9A-Z]{5}$/.test(h.ticker)
  const val  = h => {
    const cur = effPrice(h, prices)
    return h.quantity * cur * (isUs(h) ? usdKrw : 1)
  }

  // 예수금 — 현금도 자산 배분의 일부다. 주식만으로 비중을 그리면
  // '현금 30%를 들고 있는 사람'과 '전액 투자한 사람'이 똑같은 그림으로 보인다.
  const accountsList = useStore(s => s.accounts)
  const cashByAccount = React.useMemo(() => {
    const m = {}
    for (const a of accountsList) {
      const v = cashToKrw(a.cash, a.currency, usdKrw)
      if (v) m[a.key] = v
    }
    return m
  }, [accountsList, usdKrw])
  const cashForView = React.useMemo(() => {
    if (accFilter === 'ALL') return Object.values(cashByAccount).reduce((s, v) => s + v, 0)
    return cashByAccount[accFilter] || 0
  }, [cashByAccount, accFilter])

  // 진단 대상 — 계좌 필터 적용본
  const diagHoldings = React.useMemo(() => (
    diagAcc === 'ALL' ? allHoldings : allHoldings.filter(h => h.account === diagAcc)
  ), [allHoldings, diagAcc])

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
      // 계좌별 뷰에서는 현금을 그 계좌 몫에 합친다 (= 계좌의 실제 총액)
      for (const [key, v] of Object.entries(cashByAccount)) {
        const k = ACC_LABELS[key] || key
        map[k] = (map[k] || 0) + v
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
      if (cashForView) map['현금'] = (map['현금'] || 0) + cashForView
      return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
    }
    // 종목별: 같은 종목은 계좌가 달라도 하나로 합산한다.
    // "이 종목에 내 자산의 몇 %가 걸려 있나"를 보는 차트이므로 계좌는 무관하다.
    // (보유 목록은 계좌별 평단·과세가 달라 지금처럼 분리 유지)
    // KR은 A접두 유무가 달라도 같은 종목 → kr_code 와 같은 규칙으로 정규화.
    const map = {}
    for (const h of filteredForView) {
      const t = String(h.ticker || '')
      const key = /^A\d[0-9A-Z]{5}$/.test(t) ? t.slice(1) : t
      if (!map[key]) {
        map[key] = { name: h.name || t, ticker: t, value: 0, quantity: 0, accounts: 0 }
      }
      map[key].value += val(h)
      map[key].quantity += Number(h.quantity) || 0
      map[key].accounts += 1
    }
    const top = Object.values(map)
      .map(d => ({ ...d, value: Math.round(d.value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
    // 현금은 상위 15 컷 뒤에 붙인다 — 컷에 걸려 사라지면 '전액 투자'처럼 보인다
    if (cashForView) {
      top.push({ name: '현금', ticker: 'CASH', value: Math.round(cashForView),
                 quantity: 0, accounts: 0 })
      top.sort((a, b) => b.value - a.value)
    }
    return top
  }, [filteredForView, view, allHoldings, prices, usdKrw, cashByAccount, cashForView])

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
        cashKrw: Object.values(cashByAccount).reduce((sum, v) => sum + v, 0),
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
  // 리포트가 며칠 지났나 — 갱신 권장 표시용. 0 이면 '없음'.
  // ⚠️ 반드시 strategyComputedAt 선언 **뒤**에 둔다. 위로 올리면 렌더 중 TDZ
  //    ReferenceError 가 나서 탭 전체가 백지가 된다(2026-08-24 실제 발생).
  //    빌드는 통과하므로 정적 검사로는 안 잡힌다 — 띄워봐야 보인다.
  const strategyStaleDays = React.useMemo(() => {
    if (!strategyComputedAt) return 0
    return Math.floor((Date.now() / 1000 - strategyComputedAt) / 86400)
  }, [strategyComputedAt])
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
      {/* 목차 — 분석 탭은 3~5화면이라 원하는 챕터까지 스크롤로만 가기 힘들다 */}
      <ChapterNav />

      {/* 투자 나침반 — 판단이 바뀐 보유 종목이 있을 때만 나타난다(없으면 렌더 0) */}
      <CompassBanner allHoldings={allHoldings} prices={prices} usdKrw={usdKrw} />

      {/* 한눈에 보이는 포트폴리오 요약 (M3 banner) — 항상 최상단 */}
      {allHoldings.length > 0 && (
        <PortfolioSummaryBanner allHoldings={allHoldings} prices={prices} usdKrw={usdKrw} />
      )}

      {/* ━━ Ⅰ. 지금 내 상태 ━━
          현황만 담는다. 문제 제기(Ⅱ)·실행(Ⅲ)과 섞지 않는다. */}
      <ChapterHeader id="ch-1" n="Ⅰ" title="지금 내 상태" sub="자산 추이 · 비중 구성" />

      {/* Net Worth 추이 */}
      <NetWorthChart />

      {/* (이어서 비중 — 계좌·섹터·종목 분해)
          배당은 Ⅲ장으로 옮겼다. '과거 배당 이력'과 '목표 배당 시뮬'이 서로 다른
          장에 떨어져 있으면 "지금 얼마 → 목표 얼마 → 그러려면 이렇게"가 이어지지 않는다. */}


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
                  formatter={(v, name) => [priv.won(v), name]}
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
                letterSpacing: '.1em', textTransform: 'uppercase' }}>{cashForView ? '총 자산' : '총 평가액'}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--clr-text-strong)',
                letterSpacing: '-.02em', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {priv.won(total, { compact: true })}
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
                      {isStock && d.accounts > 1 && (
                        <span title={`${d.accounts}개 계좌에 나눠 보유 — 합산 비중`}
                          style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 5 }}>
                          · {d.accounts}계좌 합산
                        </span>
                      )}
                      {!isStock && children.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 6 }}>
                          · {children.length}종목
                        </span>
                      )}
                    </span>
                    {d.quantity != null && view === '종목별' && (
                      <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', minWidth: 36 }}>
                        {priv.on ? '•••' : Number(d.quantity).toLocaleString(undefined, { maximumFractionDigits: 8 })}{qtyUnit(d)}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', minWidth: 36, textAlign: 'right' }}>
                      {total > 0 ? (d.value / total * 100).toFixed(1) : 0}%
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)',
                      minWidth: 86, textAlign: 'right' }}>
                      {priv.won(d.value)}
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
                            {priv.won(c.v)}
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

      {/* ━━ Ⅱ. 무엇이 문제인가 ━━
          결정론(룰 엔진) 경고를 먼저, AI 진단을 그다음에.
          백테스트는 삭제했다 — 지금 보유한 종목은 이미 살아남은 종목이라 과거 성과가
          구조적으로 과대평가되고(생존 편향), '내 실제 성과'는 Ⅰ장 자산 추이가 이미 보여준다. */}
      {allHoldings.length > 0 && (
        <>
          <ChapterHeader id="ch-2" n="Ⅱ" title="무엇이 문제인가"
            sub="리밸런싱 경고 · 건강도 · AI 리스크 진단" />

          {/* 진단 범위 — 계좌 단위로 좁혀 볼 수 있다 */}
          <div className="seg-ctrl" style={{ marginBottom: 8 }}>
            {['ALL', ...ACCOUNTS].map(acc => (
              <button key={acc} className={`seg-btn ${diagAcc === acc ? 'active' : ''}`}
                onClick={() => setDiagAcc(acc)}>
                {acc === 'ALL' ? '전체' : (ACC_LABELS[acc] || acc)}
              </button>
            ))}
          </div>
          {diagAcc !== 'ALL' && (
            <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-tertiary)',
              lineHeight: 1.6, marginBottom: 10 }}>
              <div>이 진단은 <strong>{ACC_LABELS[diagAcc] || diagAcc}</strong> 계좌만 기준입니다.</div>
              <div>계좌 하나만 보면 분산이 실제보다 나빠 보일 수 있습니다 — 전체 기준도 함께 확인하세요.</div>
            </div>
          )}

          {diagHoldings.length === 0 ? (
            <div className="mono-card ko-keep" style={{ marginBottom: 12, fontSize: 12,
              color: 'var(--m-text-tertiary)' }}>
              이 계좌에는 보유 종목이 없습니다.
            </div>
          ) : (
            <>
              {/* 건강도 = 한 줄 배지. 점수 자체는 행동을 지시하지 못하므로 축약하고,
                  실제 행동은 바로 아래 경고에서 나온다. */}
              <HealthScoreCard key={`h-${diagAcc}`} compact
                allHoldings={diagHoldings} prices={prices} usdKrw={usdKrw} />
              <AlertsCard key={`a-${diagAcc}`}
                allHoldings={diagHoldings} prices={prices} usdKrw={usdKrw} />
            </>
          )}

          {/* AI 리스크 진단 — 생성 버튼은 Ⅲ장에 있다.
              결과가 이 위치(Ⅱ장)에 붙으므로, 리포트가 없을 때는 어디서 만드는지 알려준다.
              안내가 없으면 Ⅱ장이 그냥 빈 채로 끝나 사용자가 기능의 존재를 모른다. */}
          {strategyReport ? (
            <DaonAIReport data={strategyReport} computedAt={strategyComputedAt} part="diagnosis" />
          ) : (
            <div className="mono-card ko-keep" style={{ marginBottom: 12, fontSize: 11.5,
              color: 'var(--m-text-tertiary)', lineHeight: 1.6 }}>
              <div>AI 리스크 진단은 아직 없습니다.</div>
              <div>아래 Ⅲ장의 <strong>Portfolio Strategy Report</strong>를 실행하면 여기에 표시됩니다.</div>
            </div>
          )}
        </>
      )}

      {/* ━━ Ⅲ. 그래서 무엇을 할까 ━━ */}
      <ChapterHeader id="ch-3" n="Ⅲ" title="그래서 무엇을 할까"
        sub="목표 · 자산배분 · 배당 · 추천 액션" />
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

              {/* 이 리포트가 '언제 기준'인지 — 버튼 바로 옆에 둔다.
                  아래 결과만 보고는 며칠 전 것인지 알 수 없어 최신 여부를 판단할 수 없었다.
                  AI 리포트는 생성 시점의 보유·시세를 그대로 굳혀 저장하므로,
                  생성 시각이 곧 데이터 기준 시각(cut-off)이다. */}
              <div className="tt-ai-desc ko-keep" style={{ marginTop: 8, fontSize: 11.5 }}>
                {strategyReport && strategyComputedAt > 0 ? (
                  <>
                    <strong style={{ color: 'rgba(248,250,252,.85)' }}>
                      {_fmtKstDateTime(strategyComputedAt)}
                    </strong>
                    {' 기준 · '}
                    {strategyAcc === 'ALL' ? '전체 계좌' : (ACC_LABELS[strategyAcc] || strategyAcc)}
                    {strategyStaleDays >= 7 && (
                      <span style={{ color: '#FCD34D', fontWeight: 700 }}>
                        {' · '}{strategyStaleDays}일 지남 — 갱신을 권장합니다
                      </span>
                    )}
                  </>
                ) : (
                  <>아직 생성된 리포트가 없습니다 — 아래 버튼을 눌러 시작하세요.</>
                )}
              </div>

              {/* 은퇴 기간·월 납입은 위 '목표 기반 포트폴리오'에서 설정 → 여기선 그 값을 읽어 분석에만 반영 */}
              <div className="tt-ai-desc" style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
                은퇴까지 기간·매월 납입액은 위 <strong>목표 기반 포트폴리오</strong>에서 설정한 값을 사용합니다.
                계좌를 고르면 <strong>그 계좌의 보유 종목만</strong>으로 분석하며, 결과는 계좌별로 따로 저장됩니다.
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
              {/* ① 5년 단위 자산배분 */}
              <DaonAIReport data={strategyReport} part="alloc" />
            </motion.div>
          )}
        </>
      )}

      {/* ② 배당 — "지금 얼마 받고 있나 → 목표를 넣으면 → 이렇게 배분하면 된다"
          한 흐름으로 붙인다. 예전에는 이력이 Ⅰ장, 시뮬이 Ⅲ장에 떨어져 있었다. */}
      {allHoldings.length > 0 && (
        <>
          <DividendsCard allHoldings={allHoldings} usdKrw={usdKrw} />
          {strategyReport && (
            <DaonAIReport data={strategyReport} part="dividend" />
          )}
        </>
      )}

      {/* ③ 결론 — 추천 액션 */}
      {strategyReport && (
        <DaonAIReport data={strategyReport} computedAt={strategyComputedAt} part="actions" />
      )}

      {/* ━━ 부록 ━━ 자주 쓰지 않는 도구는 맨 아래로 */}
      {allHoldings.length > 0 && (
        <ChapterHeader id="ch-x" n="부록" title="내보내기" sub="다른 LLM에 교차검증을 맡길 때" />
      )}
      {allHoldings.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end',
          marginTop: 8, marginBottom: 12 }}>
          <button onClick={exportReport} disabled={exporting} className="tap-target-y" style={{
            padding: '7px 14px', borderRadius: 2, background: 'transparent',
            border: '1px solid var(--m-outline-variant)', color: 'var(--m-text-secondary)',
            fontSize: 12, fontWeight: 700, cursor: exporting ? 'default' : 'pointer',
            opacity: exporting ? 0.5 : 1, fontFamily: 'inherit' }}
            title="현재 분석 결과(보유구성·Health·경고·배당·AI전략)를 마크다운으로 내려받아 다른 LLM에 교차검증 의뢰">
            {exporting ? '리포트 생성 중… (최대 20초)' : '분석 리포트 MD 내보내기'}
          </button>
        </div>
      )}
    </div>
  )
}

// 주식 초보자용 지표 용어 해설 — 마우스 hover(title)로 노출.
// 문구는 backend `_calc_metrics`의 실제 계산식과 1:1로 맞춤(설명과 구현 불일치 금지).
// R6: 문장마다 줄바꿈(\n) — title 속성은 개행을 그대로 렌더한다.
const METRIC_HELP = {
  return: [
    '수익률 — 내가 산 가격 대비 지금 얼마나 벌었나(%).',
    '계산: (현재가 − 내 평균단가) ÷ 평균단가.',
    '주의: 최근 1년 주가 상승률이 아니라 "내 매수단가" 기준입니다.',
    '같은 종목이라도 언제 샀는지에 따라 사람마다 다릅니다.',
  ].join('\n'),
  mdd: [
    'MDD(최대낙폭) — 최근 1년 중 고점에서 가장 크게 떨어졌던 폭(%).',
    '계산: 1년 일별 종가에서 (그때까지의 최고가 − 현재가) ÷ 최고가 의 최댓값.',
    '읽는 법: 숫자가 클수록 마음고생이 심한 종목입니다.',
    '예: -30%면 한때 고점 대비 30%까지 빠진 적이 있다는 뜻입니다.',
    '내 손실이 아니라 "종목 자체의 출렁임" 크기입니다.',
  ].join('\n'),
  sharpe: [
    '샤프지수 — 위험을 감수한 만큼 잘 벌었나(효율).',
    '계산: (연율화 수익률 − 무위험수익률 4%) ÷ 연율화 변동성.',
    '1년 일별 등락으로 계산하며, 클수록 좋습니다.',
    '읽는 법: 1 이상이면 우수, 0 미만이면 예금만도 못한 셈입니다.',
    '같은 수익이라도 덜 출렁이며 벌었으면 점수가 높아집니다.',
  ].join('\n'),
}

// 라벨 옆 ⓘ — hover·탭·키보드 모두 지원(InfoTip). 네이티브 title(마우스 전용) 대체.
function HelpMark({ tip, label }) {
  return <InfoTip text={tip} label={label} size={11} />
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
              { label: '평균 수익률', value: fmt(summary.avg_return, 'return'), color: colorFor(summary.avg_return, 'return'), tip: METRIC_HELP.return },
              { label: '평균 MDD', value: fmt(summary.avg_mdd, 'mdd'), color: colorFor(summary.avg_mdd, 'mdd'), tip: METRIC_HELP.mdd },
              { label: '평균 샤프', value: fmt(summary.avg_sharpe, 'sharpe'), color: colorFor(summary.avg_sharpe, 'sharpe'), tip: METRIC_HELP.sharpe },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center', padding: '8px 4px',
                background: 'var(--clr-surface)', borderRadius: 4, border: '1px solid var(--clr-border-md)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
                  {item.label}<HelpMark tip={item.tip} label={item.label} />
                </div>
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
              {[
                { h: '종목' }, { h: '계좌' },
                { h: '수익률', tip: METRIC_HELP.return },
                { h: 'MDD',    tip: METRIC_HELP.mdd },
                { h: '샤프',   tip: METRIC_HELP.sharpe },
              ].map(({ h, tip }) => (
                <th key={h} style={{ padding: '6px 8px', textAlign: h === '종목' ? 'left' : 'right',
                  color: 'var(--clr-text-sub)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {h}{tip && <HelpMark tip={tip} label={h} />}
                </th>
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

      {/* 범례 + 계산 근거·출처 (R6: 문장마다 줄바꿈) */}
      <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--clr-bg)', borderRadius: 4,
        border: '1px solid var(--clr-border-md)',
        fontSize: 10, color: 'var(--clr-text-muted)', lineHeight: 1.8 }}>
        <strong style={{ color: 'var(--clr-text-sub)' }}>지표 해석 가이드</strong>
        <span style={{ marginLeft: 4, opacity: 0.7 }}>(각 지표 라벨에 마우스를 올리면 상세 설명)</span><br />
        수익률: 평균단가 기준 현재 손익률 — (현재가 − 내 평균단가) ÷ 평균단가<br />
        MDD: 1년 내 최고점 대비 최대 낙폭 — 낮을수록 안정적 (10% 이하 ✅, 25% 초과 ⚠️)<br />
        샤프: 위험 대비 초과수익 — 1 이상 우수, 0 미만 비효율 (무위험률 4% 적용)<br />
        <span style={{ color: 'var(--clr-text-sub)', fontWeight: 700 }}>계산 근거 · 출처</span><br />
        가격 데이터: 최근 1년 일별 종가 — 미국 Yahoo Finance, 한국 Yahoo Finance(.KS/.KQ).<br />
        MDD·샤프는 이 1년 종가로 계산하며, 내 매수 시점·수량과 무관한 <b>종목 자체의 위험 지표</b>입니다.<br />
        샤프 = (연율화 수익률 − 무위험 4%) ÷ 연율화 변동성 (일간 등락 기준, 연율화 계수 252일).<br />
        무위험수익률 4%는 고정 가정값이며, 실제 국채 금리 변동은 반영되지 않습니다.<br />
        수익률만 내 평균단가 기준이라 사람마다 다르고, 나머지 두 지표는 모두에게 동일합니다.<br />
        방법론: 샤프지수(Sharpe, 1966) · 최대낙폭(MDD)은 표준 정의를 따릅니다.
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

/* 문장이 끝나면(.?!。) 줄바꿈 삽입 — whiteSpace:'pre-line' 컨테이너와 함께 사용.
   ⚠ 여기서도 가림을 적용한다. AI 본문이 화면에 들어가는 경로가 NumHighlight 외에
   이 함수로도 있어서, 빼먹으면 '월가의 경고' 카드만 금액이 그대로 보인다
   (2026-08-27 운영에서 확인). 모듈 레벨이라 상태를 즉석에서 읽고, 재렌더는
   AllocationTab 이 usePrivacy() 로 구독해 일으킨다. */
function breakSentences(text) {
  if (typeof text !== 'string') return text
  const masked = maskText(text, useStore.getState().privacyMode)
  return masked.replace(/([^\d\s])([.?!。])\s+/g, '$1$2\n').trim()
}

/* 분석탭 3대 장 구분 헤더 (스냅샷 → 리스크 진단 → 액션). design.md 직사각·무채색 준수. */
/* 분석 탭 목차 — 챕터로 바로 점프 + 지금 보고 있는 챕터 표시.
   챕터 목록을 코드에 적지 않고 DOM([data-chapter])에서 읽는 이유:
   Ⅱ장·부록은 보유 종목이 없으면 렌더되지 않는다. 하드코딩하면 없는 챕터로
   점프하는 죽은 버튼이 생긴다. */
/* 스크롤포트의 실제 윗변 — 컨테이너 top 에 padding-top 을 더해야 한다.
   웹 모드의 .web-main-col 은 padding-top 이 24px 이라, 이걸 빼먹으면 점프 후
   챕터 제목이 딱 그만큼 sticky 목차 바 뒤로 들어간다. */
function viewTop(sc) {
  if (!sc) return 0
  return sc.getBoundingClientRect().top + (parseFloat(getComputedStyle(sc).paddingTop) || 0)
}

function ChapterNav() {
  const wrapRef     = useRef(null)
  const scrollerRef = useRef(null)
  const [items, setItems]   = useState([])
  const [active, setActive] = useState('')

  useEffect(() => {
    /* 스크롤 컨테이너는 모드마다 다르다(앱=.app-main, 웹=.web-main-col).
       클래스명을 박아두는 대신 실제로 스크롤되는 조상을 찾아 올라간다. */
    let scroller = wrapRef.current?.parentElement
    while (scroller && scroller !== document.body) {
      const ov = getComputedStyle(scroller).overflowY
      if (ov === 'auto' || ov === 'scroll') break
      scroller = scroller.parentElement
    }
    if (scroller === document.body) scroller = null
    scrollerRef.current = scroller

    let raf = 0
    const read = () => {
      raf = 0
      const nodes = Array.from(document.querySelectorAll('[data-chapter]'))
      const next = nodes.map(n => ({ id: n.id, label: n.dataset.chapter, num: n.dataset.chapterNum || '' }))
      setItems(prev => (prev.map(p => p.id).join() === next.map(p => p.id).join() ? prev : next))
      // 목차 바 바로 아래를 지난 마지막 챕터가 '지금 보는 챕터'
      const line = viewTop(scroller) + (wrapRef.current?.getBoundingClientRect().height || 44) + 14
      let cur = next[0]?.id || ''
      nodes.forEach(n => { if (n.getBoundingClientRect().top <= line) cur = n.id })
      setActive(cur)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }

    read()
    // 지연 로딩(차트·AI 카드)이 붙은 뒤 한 번 더 읽는다
    const t1 = setTimeout(read, 1200)
    const t2 = setTimeout(read, 4000)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      clearTimeout(t1); clearTimeout(t2)
      if (raf) cancelAnimationFrame(raf)
      scroller?.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
    /* ⚠ items.length 를 의존성에 두는 이유: 첫 렌더에서는 챕터가 0개라
       아래에서 null 을 반환하고, 그러면 wrapRef 가 DOM에 붙지 않아
       스크롤 컨테이너를 못 찾는다. 목차가 실제로 그려진 뒤 한 번 더 붙여야
       '지금 보는 챕터' 추적이 동작한다. */
  }, [items.length])

  /* scrollIntoView 대신 직접 계산해 스크롤한다.
     scrollIntoView({block:'start'}) 는 웹 모드에서 제목이 sticky 목차 바 뒤로
     들어가는 경우가 있었다(스크롤포트가 중첩돼 scroll-margin 이 기대대로 안 먹었다).
     '목차 바 높이 + 10px' 만큼 아래에 오도록 직접 옮기면 두 모드에서 같게 동작한다. */
  const jump = (id) => {
    const sc = scrollerRef.current
    let tries = 0
    /* 한 번에 안 끝내고 최대 2번 보정한다. 스크롤이 부드럽게 움직이는 동안
       위쪽에서 지연 로딩 카드가 붙으면 목표 지점이 밀린다(웹 모드에서 24px 어긋났다). */
    const step = () => {
      const el = document.getElementById(id)
      if (!el || !wrapRef.current) return
      const pad  = (wrapRef.current.getBoundingClientRect().height || 44) + 10
      const d    = el.getBoundingClientRect().top - viewTop(sc) - pad
      if (Math.abs(d) < 4 || tries > 2) return
      tries += 1
      ;(sc || window).scrollBy({ top: d, behavior: tries === 1 ? 'smooth' : 'auto' })
      setTimeout(step, 550)
    }
    step()
  }

  if (items.length < 2) return null
  return (
    <nav className="chapter-nav" ref={wrapRef} aria-label="분석 목차">
      {items.map(it => (
        <button key={it.id} type="button"
          className={`chapter-nav-btn${active === it.id ? ' is-active' : ''}`}
          aria-current={active === it.id ? 'true' : undefined}
          onClick={() => jump(it.id)}>
          {it.num && <span className="chapter-nav-num">{it.num}</span>}{it.label}
        </button>
      ))}
    </nav>
  )
}

function ChapterHeader({ n, title, sub, id }) {
  return (
    /* id/data-chapter 는 목차(ChapterNav)가 DOM에서 챕터를 찾는 단서다.
       scrollMarginTop 은 점프했을 때 sticky 목차 바 뒤로 제목이 숨지 않게 한다. */
    <div id={id} data-chapter={title} data-chapter-num={n}
      style={{ margin: '20px 0 10px', borderTop: '2px solid var(--m-text)', paddingTop: 8,
        scrollMarginTop: 56 }}>
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
  /* AI 리포트 본문은 우리가 포맷하지 않은 문장이다. 가림 모드에서 여기가 뚫려
     '총자산 ₩618,010,693' 같은 문구가 그대로 보였다(2026-08-26 사고). */
  const privacyMode = useStore(s => s.privacyMode)
  text = maskText(text, privacyMode)
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
  /* ⚠ **강조** 구간은 NumHighlight 를 거치지 않고 그대로 렌더된다.
     AI 는 문장에서 핵심 수치를 굵게 표시하는 경향이 있어, 여기를 빼먹으면
     정작 가장 중요한 금액만 가림을 통과한다(2026-08-27 운영에서 발견). */
  const privacyMode = useStore(s => s.privacyMode)
  if (!text) return null
  const segs = String(maskText(text, privacyMode)).split(/(\*\*[^*]+\*\*)/g)
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

  const dpriv = usePrivacy()
  const won = n => dpriv.won(n)
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

/* '26. 08. 24. 오후 11:36' 은 연도가 2자리라 한눈에 안 읽힌다.
   기준 시각은 리포트의 신선도를 판단하는 값이라 모호하면 안 된다 →
   'YYYY-MM-DD HH:mm KST' 로 고정한다(24시간제, 타임존 명시). */
function _fmtKstDateTime(epochSec) {
  if (!epochSec) return ''
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(epochSec * 1000))
  const g = t => (p.find(x => x.type === t) || {}).value || ''
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')} KST`
}

/* AI 전략 리포트 — 챕터별로 나눠 렌더한다.
 *
 * part: 'diagnosis' | 'alloc' | 'dividend' | 'actions'
 *
 * 왜 나눴나: 한 덩어리로 쏟으면 "지금 어떤가 → 뭐가 문제인가 → 그래서 뭘 할까"의
 * 흐름이 끊긴다. 진단은 Ⅱ장(문제)에, 배분·배당·액션은 Ⅲ장(실행)에 놓기 위해
 * 같은 data 를 파트별로 나눠 그린다(상태는 하나, 그림만 여러 곳).
 *
 * 2026-08-24 정리 — 카드 수를 줄였다(오너 판정):
 *  · 전문가 총평 → '종합 리스크 진단'에 흡수 (같은 말을 두 카드가 반복)
 *  · 주요 위험 요소 → 같은 진단 카드 안으로 (구조는 유지, 카드만 통합)
 *  · 글로벌 매크로 포지셔닝 → 삭제 (예측이고, 개인 포트폴리오 행동을 바꾸지 않는다)
 *  · 저점발굴 시계열 → 삭제 (발굴 탭이 따로 있어 중복. 투기 영역을 전략에 섞지 않는다)
 */
function DaonAIReport({ data, computedAt = 0, part = 'diagnosis' }) {
  const priorityMeta = {
    HIGH: { color: '#DC2626', bg: 'rgba(220,38,38,.10)', label: '즉시', desc: '1주일 내', icon: '⚡' },
    MED:  { color: '#D97706', bg: 'rgba(217,119,6,.10)', label: '중기', desc: '1-3개월',  icon: '◆'  },
    LOW:  { color: '#16A34A', bg: 'rgba(22,163,74,.10)', label: '장기', desc: '6개월+',  icon: '✓'  },
  }

  /* ── Ⅱ장: 진단 (총평 + 리스크 진단 + 위험 요소를 한 카드로) ── */
  if (part === 'diagnosis') {
    const items = [
      ...splitToSentences(data.expert_review || ''),
      ...splitToSentences(data.risk_diagnosis || ''),
    ]
    const risks = data.risk_factors || []
    if (items.length === 0 && risks.length === 0) return null
    return (
      <div>
        {computedAt > 0 && (
          <div style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--m-text-tertiary)',
            marginBottom: 6 }}>
            분석 기준 {_fmtKstDateTime(computedAt)}
          </div>
        )}
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title is-accent" style={{ marginBottom: 8 }}>
            종합 리스크 진단
          </div>
          {items.length > 0 && (
            <BulletList items={items}
              color="var(--m-text)" bulletColor="var(--m-text-tertiary)" tone="neutral" />
          )}

          {risks.length > 0 && (
            <div style={{ marginTop: items.length > 0 ? 12 : 0 }}>
              <SubLabel tone="negative">주요 위험 요소 {risks.length}</SubLabel>
              {risks.map((r, i) => {
                const sev = riskSeverity(r.title, r.detail)
                return (
                  <div key={i} className="mono-row">
                    <div className="mono-row-content">
                      <div className="mono-row-title ko-keep" style={{ display: 'flex',
                        alignItems: 'center', gap: 6 }}>
                        <span className={`sev-label is-${sev.level}`}>{sev.label}</span>
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
        </div>
      </div>
    )
  }

  /* ── Ⅲ장 ①: 5년 단위 자산배분 ── */
  if (part === 'alloc') {
    if (!(data.allocation_phases?.length > 0)) return null
    return (
      <div className="mono-card" style={{ marginBottom: 12 }}>
        <div className="mono-section-title is-accent" style={{ marginBottom: 10 }}>
          인생 타임라인 · 5년 단위 자산배분
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.allocation_phases.map((ph, i) => <AllocPhase key={i} phase={ph} idx={i} />)}
        </div>
      </div>
    )
  }

  /* ── Ⅲ장 ②: 배당 — 목표를 넣으면 필요한 배분을 돌려준다 ── */
  if (part === 'dividend') {
    const sim = data.dividend_simulation
    if (!sim || !(sim.rows?.length > 0 || sim.warning)) return null
    return (
      <div className="mono-card" style={{ marginBottom: 12 }}>
        <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>
          목표 배당 시뮬레이션
        </div>
        <div className="mono-section-sub ko-keep" style={{ marginBottom: 8 }}>
          비중·가정 배당수익률을 직접 조정하면 예상 월 현금흐름이 즉시 다시 계산됩니다.
        </div>
        {sim.rows?.length > 0 && (
          <DividendSimulator sim={sim}
            totalKrw={data.verified_facts?.total_krw || data._metrics_summary?.total_krw || 0} />
        )}
        {sim.warning && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--m-surface-variant)',
            border: '1px solid var(--m-outline-variant)', borderRadius: 4 }}>
            <SubLabel tone="negative">월가의 경고</SubLabel>
            <div className="ko-keep" style={{ fontSize: 12, color: 'var(--m-text)',
              lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {breakSentences(String(sim.warning).replace(/^\s*\[?월가의 경고\]?\s*[:·-]?\s*/, ''))}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Ⅲ장 ③: 결론 — 추천 액션 + 예외 메모 ── */
  if (!(data.rebalancing || data.actions?.length > 0
        || (data.edge_notes && String(data.edge_notes).trim()))) return null
  return (
    <div>
      {(data.rebalancing || data.actions?.length > 0) && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-header">
            <div className="mono-section-title is-accent">추천 액션</div>
            <span className="mono-section-sub" style={{ paddingLeft: 0, marginTop: 0 }}>
              우선순위 순
            </span>
          </div>

          {data.rebalancing && (
            <div style={{ marginBottom: data.actions?.length > 0 ? 12 : 0,
              background: 'var(--m-surface-variant)',
              border: '1px solid var(--m-outline-variant)',
              borderRadius: 4, padding: '8px 12px' }}>
              <SubLabel tone="positive">리밸런싱 · 비중 조정</SubLabel>
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
    </div>
  )
}

/* 섹션 안의 2단계 소제목(월가의 경고·리밸런싱 등).
   왜 컴포넌트인가: 같은 10.5px/800 라벨을 각자 인라인으로 적어두면 손댈 때마다
   조금씩 달라져 결국 머릿글이 뒤죽박죽이 된다(2026-08-18 오너 지적).
   1단계 = .mono-section-title, 2단계 = 이것. 그 밖의 제목 스타일을 새로 만들지 말 것.
   의미(위험/긍정)는 tone(글자색)으로만 — design.md R1(좌측 색띠 금지). */
function SubLabel({ children, tone = 'neutral' }) {
  const color = tone === 'negative' ? 'var(--m-negative)'
              : tone === 'positive' ? 'var(--m-positive)'
              : 'var(--m-text-secondary)'
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, color,
      letterSpacing: '.03em', marginBottom: 4 }}>{children}</div>
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

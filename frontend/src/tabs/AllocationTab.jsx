import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { getPortfolio, getPricesBatch, getPortfolioMetrics, getPortfolioMetricsCached, getPortfolioStrategy, getPortfolioStrategyCached } from '../api'
import { useStore } from '../store'
import LogoCircle from '../components/LogoCircle'
import BorderBeam from '../components/BorderBeam'
import BacktestSection from '../components/BacktestSection'
import NetWorthChart from '../components/NetWorthChart'
import HealthScoreCard from '../components/HealthScoreCard'
import AlertsCard from '../components/AlertsCard'
import DividendsCard from '../components/DividendsCard'
import PortfolioSummaryBanner from '../components/PortfolioSummaryBanner'
import ShimmerButton from '../components/ShimmerButton'
import { useAccounts } from '../utils/accounts'
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
    const cur = prices[h.ticker]?.current_price ?? h.avg_price
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
  const [strategyReport, setStrategyReport] = useState(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategyErr, setStrategyErr] = useState('')
  const [strategyAcc, setStrategyAcc] = useState('ALL')
  const [strategyComputedAt, setStrategyComputedAt] = useState(0)  // epoch seconds

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
      const result = await getPortfolioStrategy({
        holdings: targets.map(h => ({ ...h })),
        prices,
        scope: strategyAcc,
        force_refresh: forceRefresh,
      })
      setStrategyReport(result)
      setStrategyComputedAt(Math.floor(Date.now() / 1000))
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
  useEffect(() => {
    if (allHoldings.length === 0) return
    let aborted = false
    ;(async () => {
      try {
        const cached = await getPortfolioMetricsCached(metricsAcc)
        if (aborted) return
        if (cached?.cached) {
          setMetrics(cached)
          setMetricsStale(false)
          setMetricsErr('')
        } else {
          setMetrics(null)
          setMetricsStale(false)
        }
      } catch (e) {
        if (!aborted) { setMetrics(null); setMetricsStale(false) }
      }
    })()
    return () => { aborted = true }
  }, [metricsAcc, allHoldings.length])

  // 현재 보유 fingerprint가 저장된 결과와 다르면 stale 표시
  useEffect(() => {
    if (!metrics?.cached || !metrics?.fingerprint) { setMetricsStale(false); return }
    // 저장된 fingerprint는 서버에서 md5 해시, 프론트는 JSON 문자열 — 비교 대신 보유 구성 변경 시 stale로 처리
  }, [currentFingerprint, metrics?.fingerprint])

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

      {/* Net Worth 추이 — 항상 펼침 (시계열은 한번에 봐야 의미) */}
      <NetWorthChart />

      {/* 핵심 분석: 항상 펼침 — 가장 중요 */}
      {allHoldings.length > 0 && (
        <HealthScoreCard allHoldings={allHoldings} prices={prices} usdKrw={usdKrw} />
      )}

      {/* 룰 기반 경고 — 항상 펼침 (긴급도 ↑) */}
      {allHoldings.length > 0 && (
        <AlertsCard allHoldings={allHoldings} prices={prices} usdKrw={usdKrw} />
      )}

      {/* 배당금 이력 + 캘린더 */}
      {allHoldings.length > 0 && (
        <DividendsCard allHoldings={allHoldings} usdKrw={usdKrw} />
      )}


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
          <div style={{ background: 'var(--clr-surface)', borderRadius: 16,
            padding: '20px 0 12px', marginBottom: 12,
            boxShadow: '0 4px 14px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)',
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
                    borderRadius: 10,
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
          <div style={{ background: 'var(--clr-surface)', borderRadius: 16, padding: '4px 16px 8px',
            boxShadow: '0 1px 3px rgba(0,0,0,.05)', marginBottom: 16 }}>
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

      {/* 성과 분석 (MDD · Sharpe · 수익률) */}
      {allHoldings.length > 0 && (
        <div className="mono-card" style={{ marginBottom: 16 }}>
          <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>
            성과 분석
          </div>
          <div className="mono-section-sub ko-keep" style={{ marginBottom: 12 }}>
            종목별 수익률 · MDD(최대낙폭) · 샤프지수를 계산합니다 · 1년 과거 데이터 기준 · 무위험수익률 4%
          </div>

          <div style={{ marginBottom: 10 }}>
            <div className="seg-ctrl">
              {['ALL', ...ACCOUNTS].map(acc => (
                <button key={acc}
                  className={`seg-btn ${metricsAcc === acc ? 'active' : ''}`}
                  onClick={() => setMetricsAcc(acc)}
                  style={{ fontSize: 12 }}>
                  {acc === 'ALL' ? '전체' : ACC_LABELS[acc]}
                </button>
              ))}
            </div>
          </div>

          {/* 저장된 분석이 있으면 cut-off 날짜 + 2-버튼, 없으면 단일 실행 버튼 */}
          {metrics?.computed_at ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 2, marginBottom: 10,
                border: '1px solid var(--m-outline-variant)' }}>
                <div style={{ fontSize: 11, color: 'var(--m-text-secondary)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: 'var(--m-text)' }}>마지막 분석: </span>
                  {formatTimestamp(metrics.computed_at)}
                </div>
                <span className="mono-pill" style={{
                  color: metrics.cached ? 'var(--m-text-secondary)' : 'var(--m-positive)' }}>
                  {metrics.cached ? '저장된 결과' : '방금 분석'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <button className="btn-primary"
                  disabled={metricsLoading}
                  onClick={() => runMetrics(false)}
                  style={{ width: '100%', opacity: metricsLoading ? 0.6 : 1 }}>
                  {metricsLoading ? '계산 중...' : '저장된 결과 보기'}
                </button>
                <button
                  disabled={metricsLoading}
                  onClick={() => runMetrics(true)}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid #0EA5E9',
                    background: 'var(--clr-surface)', color: 'var(--clr-info-dark)', fontWeight: 700, fontSize: 13,
                    cursor: metricsLoading ? 'not-allowed' : 'pointer',
                    opacity: metricsLoading ? 0.6 : 1, fontFamily: 'inherit',
                  }}>
                  🔄 새로 분석
                </button>
              </div>
            </>
          ) : (
            <button className="btn-primary"
              disabled={metricsLoading}
              onClick={() => runMetrics(false)}
              style={{ width: '100%', marginBottom: 10 }}>
              {metricsLoading ? '계산 중... (종목당 2~3초)' : '성과 분석 실행'}
            </button>
          )}

          {metricsErr && (
            <div style={{ padding: 10, borderRadius: 2, border: '1px solid var(--m-negative)',
              color: 'var(--m-negative)', fontSize: 12, marginBottom: 8 }}>{metricsErr}</div>
          )}

          {metrics && <MetricsResult data={metrics} holdings={allHoldings} />}
        </div>
      )}


      {/* 백테스트 시뮬레이션 */}
      {allHoldings.length > 0 && (
        <BacktestSection allHoldings={allHoldings} />
      )}

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
              <div className="tt-ai-badge">AI POWERED</div>
              <div className="tt-ai-title">Portfolio Strategy Report</div>
              <div className="tt-ai-desc">
                종목별 MDD·샤프지수를 계산한 뒤 AI가 포트폴리오 전략 리포트를 생성합니다.
                전체 소요 시간: 약 1~3분 (종목 수에 따라 다름)
              </div>

              {/* 분석 대상 선택 (다크 테마) */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: 'rgba(248,250,252,.55)', fontWeight: 700,
                  letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>분석 대상</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {['ALL', ...ACCOUNTS].map(acc => {
                    const active = strategyAcc === acc
                    return (
                      <button key={acc}
                        onClick={() => setStrategyAcc(acc)}
                        style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                          fontFamily: 'inherit', cursor: 'pointer',
                          border: '1px solid',
                          borderColor: active ? 'rgba(99,102,241,.6)' : 'rgba(148,163,184,.3)',
                          background: active ? 'rgba(99,102,241,.25)' : 'transparent',
                          color: active ? '#fff' : 'rgba(248,250,252,.7)',
                        }}>
                        {acc === 'ALL' ? '전체' : ACC_LABELS[acc]}
                        {acc !== 'ALL' && (
                          <span style={{ fontSize: 10, marginLeft: 3, opacity: .6 }}>
                            ({allHoldings.filter(h => h.account === acc).length})
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 저장된 분석 미리보기 안내 */}
              {strategyReport && !strategyLoading && strategyComputedAt > 0 && (
                <div style={{
                  marginTop: 12, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(99,102,241,.18)',
                  border: '1px solid rgba(99,102,241,.35)',
                  fontSize: 11, color: 'rgba(248,250,252,.85)', lineHeight: 1.5,
                }}>
                  <span style={{ fontWeight: 700, color: '#C7D2FE' }}>📋 저장된 분석 미리보기</span>
                  <span style={{ marginLeft: 6, opacity: 0.85 }}>
                    · {formatRelativeKo(strategyComputedAt)}
                  </span>
                </div>
              )}

              <ShimmerButton
                variant="ai"
                disabled={strategyLoading || !hasAnthropicKey || !aiEnabled}
                onClick={() => runStrategy(!!strategyReport)}
                style={{ marginTop: 10, width: 'fit-content' }}>
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
              <DaonAIReport data={strategyReport} />
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
        <div style={{ background: 'var(--clr-bg)', borderRadius: 12, padding: '12px 14px', marginBottom: 14,
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

/* 텍스트 내 숫자·퍼센트·금액을 글자색만 강조 (음영 X, 직사각형 X) */
function HighlightedText({ text, tone = 'neutral' }) {
  if (!text) return null
  const re = /(\+?\-?\d+(?:,\d{3})*(?:\.\d+)?%?|₩\s*[\d,]+|\$\s*[\d,]+(?:\.\d+)?)/g
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) => {
        if (re.test(p)) {
          const isNeg = /^-/.test(p)
          const isPos = /^\+/.test(p)
          const klass = isNeg ? 'num-neg' : isPos ? 'num-pos' : 'num-neutral'
          return (
            <span key={i} className={klass} style={{
              whiteSpace: 'nowrap',
            }}>{p}</span>
          )
        }
        return <React.Fragment key={i}>{p}</React.Fragment>
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

function DaonAIReport({ data }) {
  const summary = data._metrics_summary || {}
  const priorityMeta = {
    HIGH: { color: '#DC2626', bg: 'rgba(220,38,38,.10)', label: '즉시', desc: '1주일 내', icon: '⚡' },
    MED:  { color: '#D97706', bg: 'rgba(217,119,6,.10)', label: '중기', desc: '1-3개월',  icon: '◆'  },
    LOW:  { color: '#16A34A', bg: 'rgba(22,163,74,.10)', label: '장기', desc: '6개월+',  icon: '✓'  },
  }

  // 평균 수익률을 게이지로 시각화 — -30% ~ +50% 범위
  const returnPct = Math.max(-30, Math.min(50, summary.avg_return || 0))
  const returnGaugePos = ((returnPct + 30) / 80) * 100  // 0~100%
  // MDD 게이지 — 0~50%
  const mddPct = Math.min(50, Math.abs(summary.avg_mdd || 0))
  const mddGaugePos = (mddPct / 50) * 100
  // 샤프 게이지 — -1 ~ 3 범위
  const sharpe = Math.max(-1, Math.min(3, summary.avg_sharpe || 0))
  const sharpeGaugePos = ((sharpe + 1) / 4) * 100

  return (
    <div>
      {/* 분석 메타 — 게이지 시각화로 강화 */}
      {summary.stock_count > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span className="emoji-mute" style={{ fontSize: 14 }}>📊</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--clr-text-strong)' }}>
              포트폴리오 건강도
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--clr-text-muted)' }}>
              총 {summary.stock_count}종 분석
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <GaugeTile label="평균 수익률"
              value={`${summary.avg_return >= 0 ? '+' : ''}${summary.avg_return}%`}
              pos={returnGaugePos}
              color={summary.avg_return >= 0 ? '#16A34A' : '#DC2626'}
              caption={summary.avg_return >= 0 ? '플러스 수익' : '손실 구간'} />
            <GaugeTile label="평균 MDD"
              value={`-${summary.avg_mdd}%`}
              pos={mddGaugePos}
              color={summary.avg_mdd <= 15 ? '#16A34A' : summary.avg_mdd <= 25 ? '#D97706' : '#DC2626'}
              caption={summary.avg_mdd <= 15 ? '안정적' : summary.avg_mdd <= 25 ? '보통' : '높은 변동'} />
            <GaugeTile label="평균 샤프"
              value={`${summary.avg_sharpe}`}
              pos={sharpeGaugePos}
              color={summary.avg_sharpe >= 1 ? '#16A34A' : summary.avg_sharpe >= 0 ? '#D97706' : '#DC2626'}
              caption={summary.avg_sharpe >= 1 ? '우수' : summary.avg_sharpe >= 0 ? '보통' : '비효율'} />
          </div>
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

      {/* 매크로 뷰 */}
      {data.macro_view && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title" style={{ marginBottom: 8 }}>
            글로벌 매크로 포지셔닝
          </div>
          <BulletList items={splitToSentences(data.macro_view)}
            color="var(--m-text-secondary)" bulletColor="var(--m-text-tertiary)" tone="neutral" />
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
                  <div className="mono-row-title ko-keep">
                    <span style={{ color: 'var(--m-text)' }}>{r.title}</span>
                    <span className={`sev-label ${sevClass}`}
                      style={{ marginLeft: 'auto' }}>{sev.label}</span>
                  </div>
                  <div className="mono-row-body ko-keep">
                    <BulletList items={splitToSentences(r.detail)}
                      color="var(--m-text-secondary)"
                      bulletColor="var(--m-text-tertiary)" tone="neutral" small />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 리밸런싱 제안 */}
      {data.rebalancing && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-title is-positive" style={{ marginBottom: 8 }}>
            리밸런싱 제안
          </div>
          <BulletList items={splitToSentences(data.rebalancing)}
            color="var(--m-text)" bulletColor="var(--m-text-tertiary)" tone="neutral" />
        </div>
      )}

      {/* 추천 액션 — 무채색 timeline (sev-dot 제거, 우선순위 chip만) */}
      {data.actions?.length > 0 && (
        <div className="mono-card" style={{ marginBottom: 12 }}>
          <div className="mono-section-header">
            <div className="mono-section-title is-accent">추천 액션</div>
            <span className="mono-section-sub" style={{ paddingLeft: 0, marginTop: 0 }}>
              우선순위 순
            </span>
          </div>
          {data.actions.map((a, i) => {
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

      <div style={{ fontSize: 10, color: 'var(--clr-border-strong)', textAlign: 'right', marginTop: 4 }}>
        생성 시각: {new Date().toLocaleString('ko-KR',
          { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · Claude Haiku 4.5
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/* ─── 시각화 helper: BulletList ─────────────────────────────────────────
   긴 문장 텍스트를 가독성 좋은 bullet 목록으로 렌더링.
   - tone: 'pos' | 'neg' | 'neutral' — 숫자 강조 색상 결정
   - small: 더 작은 폰트 사용 */
function BulletList({ items = [], color, bulletColor, tone = 'neutral', small = false }) {
  if (!items || items.length === 0) return null
  // 1문장이면 bullet 없이 그대로 — 어색한 단일 bullet 방지
  if (items.length === 1) {
    return (
      <div className="ko-keep" style={{ fontSize: small ? 12 : 13, color,
        lineHeight: 1.75 }}>
        <HighlightedText text={items[0]} tone={tone} />
      </div>
    )
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((s, i) => (
        <li key={i} className="ko-keep" style={{
          position: 'relative', paddingLeft: 16,
          marginBottom: i < items.length - 1 ? 6 : 0,
          fontSize: small ? 12 : 13, color, lineHeight: 1.7,
        }}>
          <span style={{
            position: 'absolute', left: 0, top: '0.55em',
            width: 6, height: 6, borderRadius: '50%',
            background: bulletColor || color, opacity: 0.85,
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

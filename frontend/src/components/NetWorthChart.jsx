import React, { useState, useMemo } from 'react'
import { usePrivacy } from '../utils/privacy'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, ReferenceLine,
} from 'recharts'
import { getNetWorthSnapshots } from '../api'
import NumberTicker from './NumberTicker'
import { useStore } from '../store'
import { cashToKrw } from './AccountCashCard'

/**
 * Net Worth 일별 추이 차트 — 매일 자동 저장되는 평가액의 시계열.
 * Allocation 탭 최상단에 임베드.
 */
/* ⚠ 이 카드는 '총자산 추이'가 아니다.
   일별 스냅샷(net_worth_snapshots)은 2026-09-14 까지 **예수금을 저장하지 않았다**.
   그래서 여기 숫자는 주식 평가액이고, 포트폴리오 탭의 총자산(주식+예수금)보다
   항상 예수금만큼 작다. 오너가 "탭별 수치가 안 맞는다"고 지적한 지점이 이것이다.

   과거 스냅샷에 오늘의 현금을 소급해 넣으면 없던 사실을 지어내는 것이므로
   하지 않는다. 대신 ① 이름을 사실대로 바꾸고 ② 현재 예수금과 총자산을 같이 적어
   두 탭의 숫자가 어떻게 이어지는지 화면에서 바로 보이게 한다. */
export default function NetWorthChart() {
  const priv = usePrivacy()          // 가림 모드 — 축 라벨·툴팁까지 전부 가린다
  const accountsList = useStore(s => s.accounts)
  const usdKrw = useStore(s => s.usdKrw) || 1380
  // 지금 이 순간의 예수금 — 포트폴리오 탭과 같은 계산식을 쓴다.
  const cashNow = useMemo(() => (accountsList || []).reduce(
    (sum, a) => sum + (cashToKrw(a.cash, a.currency, usdKrw) || 0), 0), [accountsList, usdKrw])
  const [range, setRange] = useState('1Y')  // '1M' | '3M' | '6M' | '1Y' | 'ALL'

  const daysMap = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 0 }
  const days = daysMap[range]

  const { data, isLoading } = useQuery({
    queryKey: ['nw-snapshots', days],
    queryFn: () => getNetWorthSnapshots(days),
    staleTime: 60_000,
  })

  const snapshots = data?.snapshots || []
  const summary = data?.summary || {}

  const chartData = useMemo(() =>
    snapshots.map(s => ({
      date: s.date,
      shortDate: s.date.slice(5).replace('-', '/'),  // MM/DD
      total: s.total_krw,
      holdings: s.holdings_count,
    })),
  [snapshots])

  const isPositive = (summary.change_pct ?? 0) >= 0
  const accent = isPositive ? '#16A34A' : '#DC2626'

  // 빈 상태 (스냅샷이 0~1개)
  if (!isLoading && snapshots.length < 2) {
    return (
      <div style={{ background: 'var(--clr-surface)', borderRadius: 4,
        padding: 18, marginBottom: 12,
        boxShadow: '0 1px 3px rgba(15,23,42,.05)',
        border: '1px dashed var(--clr-border-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span className="emoji-mute" style={{ fontSize: 14 }}>📈</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--clr-text-strong)' }}>
            자산 추이 (Net Worth)
          </span>
        </div>
        <div className="ko-keep" style={{ fontSize: 12, color: 'var(--clr-text-muted)',
          lineHeight: 1.7 }}>
          매일 한 번 평가액이 자동 저장되며, 2일 이상 누적되면 추이 차트가 표시됩니다.
          오늘 처음이라면 보유 종목과 가격이 로드된 직후 첫 스냅샷이 기록되었습니다.
          <br/>
          <span style={{ fontSize: 10.5, color: 'var(--clr-text-muted)', opacity: 0.85 }}>
            현재 누적 데이터: {snapshots.length}일
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header">
        <div>
          <div className="mono-section-title">주식 평가액 추이</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--m-text)',
            letterSpacing: '-.02em', lineHeight: 1.1, marginTop: 6,
            fontVariantNumeric: 'tabular-nums' }}>
            <NumberTicker value={summary.end_value || 0}
              format={v => priv.won(v)} duration={0.7} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2,
            fontVariantNumeric: 'tabular-nums' }}>
            <span className={isPositive ? 'num-pos' : 'num-neg'}>
              {priv.on ? '' : (isPositive ? '+' : '')}{priv.won(Math.abs(summary.change || 0))}
              <span style={{ marginLeft: 4 }}>({isPositive ? '+' : ''}{summary.change_pct}%)</span>
            </span>
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--m-text-tertiary)',
              fontWeight: 500 }}>{range}</span>
          </div>
          {/* 포트폴리오 탭의 총자산과 이 숫자가 어떻게 이어지는지 한 줄로 못박는다.
              둘이 다른 이유를 화면에서 설명하지 않으면 "수치가 안 맞는다"가 된다. */}
          {cashNow > 0 && (
            <div className="ko-keep" style={{ fontSize: 10.5, marginTop: 5,
              color: 'var(--m-text-tertiary)', fontWeight: 600,
              fontVariantNumeric: 'tabular-nums' }}>
              + 예수금 {priv.won(cashNow)} = 총자산 {priv.won((summary.end_value || 0) + cashNow)}
            </div>
          )}
        </div>
        {/* 기간 토글 */}
        <div className="seg-ctrl" style={{ flex: 'none' }}>
          {['1M','3M','6M','1Y','ALL'].map(r => (
            <button key={r}
              className={`seg-btn ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
              style={{ fontSize: 10, minWidth: 30 }}>{r}</button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={range}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={chartData}
              margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="nw-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <XAxis dataKey="shortDate" tick={{ fontSize: 9, fill: '#94A3B8' }}
                interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} width={56}
                tickFormatter={v => priv.on ? '••' : v >= 1e8 ? `${(v/1e8).toFixed(1)}억`
                                  : v >= 1e4 ? `${(v/1e4).toFixed(0)}만`
                                  : v.toLocaleString()}
                domain={['auto', 'auto']} />
              <Tooltip
                formatter={(v) => priv.won(v)}
                labelFormatter={l => `${l}`}
                contentStyle={{ borderRadius: 8, fontSize: 11,
                  border: '1px solid var(--clr-border-md)',
                  background: 'var(--clr-surface)' }} />
              {summary.start_value > 0 && (
                <ReferenceLine y={summary.start_value} stroke="#94A3B8"
                  strokeDasharray="4 3" strokeWidth={1}
                  label={{ value: '시작', position: 'insideTopLeft',
                    fontSize: 9, fill: '#64748B' }} />
              )}
              <Area type="monotone" dataKey="total"
                stroke={accent} strokeWidth={2}
                fill="url(#nw-area)" isAnimationActive={true}
                animationDuration={600} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>

      <div style={{ display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 6,
        fontVariantNumeric: 'tabular-nums' }}>
        <span>{summary.first_date} ~ {summary.last_date}</span>
        <span>최고 {priv.won(summary.max_value || 0)} · 최저 {priv.won(summary.min_value || 0)}</span>
      </div>
    </div>
  )
}

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { listGoals, upsertGoal, deleteGoal, projectGoal } from '../api'

/* 목표 기반 포트폴리오 — 분석 탭 카드.
   현재 자산 + 월납입 + 기대수익률/변동성으로 목표 시점 달성 궤적(중앙값+80% 밴드)·
   달성확률 추정·상태(순항/주의/미달)·권고를 보여준다. 결정론 MVP. ⚠️ 추정치·투자자문 아님. */

const STATUS = {
  on_track:  { label: '순항 중',   color: 'var(--m-positive)' },
  at_risk:   { label: '주의',      color: '#D97706' },
  off_track: { label: '미달 위험', color: 'var(--m-negative)' },
}

function fmtKRW(v) {
  if (v == null) return '—'
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e8) return `${s}₩${(a / 1e8).toFixed(2)}억`
  if (a >= 1e4) return `${s}₩${Math.round(a / 1e4).toLocaleString()}만`
  return `${s}₩${Math.round(a).toLocaleString()}`
}

// 기본 목표 시점: 10년 후 (YYYY-MM-DD) — Date.now 미사용 회피 불필요(브라우저 런타임)
function defaultTargetDate() {
  const d = new Date(); d.setFullYear(d.getFullYear() + 10)
  return d.toISOString().slice(0, 10)
}

export default function GoalsCard() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    id: null, name: '내 목표',
    target_eok: 3,          // 억 단위 입력
    target_date: defaultTargetDate(),
    monthly_man: 100,       // 만원 단위 입력
    return_pct: 6, vol_pct: 15,
  })
  const [proj, setProj] = useState(null)
  const [currentValue, setCurrentValue] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const { data } = useQuery({ queryKey: ['goals'], queryFn: listGoals, staleTime: 60_000 })

  // 저장된 목표가 있으면 폼·결과 채움 (1개 MVP)
  useEffect(() => {
    if (!data || loadedOnce) return
    setLoadedOnce(true)
    if (data.current_value != null) setCurrentValue(data.current_value)
    const g = data.goals?.[0]
    if (g) {
      setForm({
        id: g.id, name: g.name,
        target_eok: +(g.target_amount / 1e8).toFixed(2),
        target_date: g.target_date,
        monthly_man: Math.round(g.monthly_contribution / 1e4),
        return_pct: +(g.expected_return * 100).toFixed(1),
        vol_pct: +(g.volatility * 100).toFixed(1),
      })
      if (g.projection) setProj(g.projection)
    }
  }, [data, loadedOnce])

  function toBody() {
    return {
      id: form.id, name: form.name || '내 목표',
      target_amount: Math.max(0, form.target_eok) * 1e8,
      target_date: form.target_date,
      monthly_contribution: Math.max(0, form.monthly_man) * 1e4,
      expected_return: form.return_pct / 100,
      volatility: form.vol_pct / 100,
    }
  }

  async function onPreview() {
    if (busy) return
    setBusy(true)
    try {
      const { target_amount, target_date, monthly_contribution, expected_return, volatility } = toBody()
      const r = await projectGoal({ target_amount, target_date, monthly_contribution, expected_return, volatility })
      setProj(r.projection); setCurrentValue(r.current_value)
    } catch {} finally { setBusy(false) }
  }
  async function onSave() {
    if (busy) return
    setBusy(true)
    try {
      const r = await upsertGoal(toBody())
      if (r.id) setForm(f => ({ ...f, id: r.id }))
      qc.invalidateQueries({ queryKey: ['goals'] })
      await onPreview()
    } catch {} finally { setBusy(false) }
  }
  async function onDelete() {
    if (!form.id || busy) return
    setBusy(true)
    try {
      await deleteGoal(form.id)
      setForm(f => ({ ...f, id: null }))
      setProj(null)
      qc.invalidateQueries({ queryKey: ['goals'] })
    } catch {} finally { setBusy(false) }
  }

  const chartData = useMemo(() => {
    if (!proj?.path) return []
    return proj.path.map(p => ({
      yr: +(p.month / 12).toFixed(2),
      low: p.low, band: Math.max(0, p.high - p.low), median: p.median,
    }))
  }, [proj])

  const st = proj ? (STATUS[proj.status] || STATUS.at_risk) : null
  const shortfall = proj?.shortfall ?? 0

  const field = (label, key, opts = {}) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
      <span className="m3-label">{label}</span>
      <input
        type={opts.type || 'number'} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: opts.type === 'date' || opts.text ? e.target.value : +e.target.value }))}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 2,
          border: '1px solid var(--m-outline-variant)', background: 'var(--m-surface)',
          color: 'var(--m-text)', fontSize: 12, fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums' }} />
    </label>
  )

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-title is-accent" style={{ marginBottom: 4 }}>목표 기반 포트폴리오</div>
      <div className="mono-section-sub ko-keep" style={{ marginBottom: 12 }}>
        현재 자산에 매달 더 넣으면 목표 시점에 얼마가 될지 추정합니다.
      </div>

      {/* 입력 폼 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {field('목표명', 'name', { text: true, type: 'text' })}
        {field('목표 금액(억)', 'target_eok')}
        {field('목표 시점', 'target_date', { type: 'date' })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {field('월 납입(만원)', 'monthly_man')}
        {field('기대수익률(%)', 'return_pct')}
        {field('변동성(%)', 'vol_pct')}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button onClick={onPreview} disabled={busy} style={{
          flex: 1, padding: '7px 12px', borderRadius: 2,
          background: 'var(--m-text)', border: '1px solid var(--m-text)',
          color: 'var(--m-surface)', fontSize: 12, fontWeight: 800,
          cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, fontFamily: 'inherit',
        }}>{busy ? '계산 중…' : '계산'}</button>
        <button onClick={onSave} disabled={busy} style={{
          flex: 1, padding: '7px 12px', borderRadius: 2, background: 'transparent',
          border: '1px solid var(--m-outline-variant)', color: 'var(--m-text-secondary)',
          fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.5 : 1, fontFamily: 'inherit' }}>저장</button>
        {form.id && (
          <button onClick={onDelete} disabled={busy} style={{
            padding: '7px 12px', borderRadius: 2, background: 'transparent',
            border: '1px solid var(--m-outline-variant)', color: 'var(--m-text-tertiary)',
            fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit' }}>삭제</button>
        )}
      </div>

      {/* 결과 */}
      {proj && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
            marginBottom: 8 }}>
            <span className="sev-label" style={{ color: st.color, borderColor: st.color }}>
              {st.label}
            </span>
            {proj.probability != null && (
              <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--m-text)',
                fontVariantNumeric: 'tabular-nums' }}>
                달성확률 {(proj.probability * 100).toFixed(0)}%
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6,
            marginBottom: 10 }}>
            {[
              ['현재 자산', fmtKRW(currentValue ?? proj.current_value)],
              ['예상(중앙값)', fmtKRW(proj.median_final)],
              [shortfall > 0 ? '부족분' : '초과분', fmtKRW(Math.abs(shortfall))],
            ].map(([k, v]) => (
              <div key={k} style={{ border: '1px solid var(--m-outline-variant)', borderRadius: 2,
                padding: '7px 8px', textAlign: 'center' }}>
                <div className="m3-label" style={{ marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-text)',
                  fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* 예상 궤적 — 중앙값 + 80% 밴드 */}
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <XAxis dataKey="yr" tick={{ fontSize: 9, fill: '#94A3B8' }}
                tickFormatter={v => `${Math.round(v)}년`} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} width={52}
                tickFormatter={v => v >= 1e8 ? `${(v / 1e8).toFixed(1)}억`
                                  : v >= 1e4 ? `${(v / 1e4).toFixed(0)}만` : v}
                domain={['auto', 'auto']} />
              <Tooltip
                formatter={(v, n) => [fmtKRW(v), n === 'median' ? '중앙값' : n === 'band' ? '80% 범위' : '하단']}
                labelFormatter={l => `${l}년 차`}
                contentStyle={{ borderRadius: 4, fontSize: 11,
                  border: '1px solid var(--m-outline-variant)', background: 'var(--m-surface)' }} />
              {/* 밴드: low(투명) + band(채움) 스택 */}
              <Area dataKey="low" stackId="b" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area dataKey="band" stackId="b" stroke="none" fill={st.color} fillOpacity={0.15}
                isAnimationActive={false} />
              <Line dataKey="median" stroke={st.color} strokeWidth={2} dot={false}
                isAnimationActive={true} animationDuration={500} />
              <ReferenceLine y={proj.target} stroke="var(--m-text-tertiary)" strokeDasharray="4 3"
                label={{ value: '목표', position: 'insideTopRight', fontSize: 9, fill: 'var(--m-text-secondary)' }} />
            </ComposedChart>
          </ResponsiveContainer>

          {/* 권고 */}
          <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text-secondary)',
            lineHeight: 1.6, marginTop: 8,
            background: 'var(--m-surface-variant)', border: '1px solid var(--m-outline-variant)',
            borderRadius: 4, padding: '8px 10px' }}>
            {proj.status === 'on_track'
              ? '현재 계획대로면 목표 시점에 목표 금액을 넘어설 것으로 추정됩니다.'
              : `목표에 ${fmtKRW(Math.abs(shortfall))} 부족할 것으로 추정됩니다. 월 납입을 늘리거나 목표 시점을 늦추면 달성 확률이 올라갑니다.`}
          </div>
        </>
      )}

      {/* 고지 (필수) */}
      <div className="ko-keep" style={{ fontSize: 10, color: 'var(--m-text-tertiary)',
        lineHeight: 1.6, marginTop: 10 }}>
        ※ 기대수익률·변동성 가정에 기반한 <strong>추정치</strong>이며 미래 수익을 보장하지 않습니다.
        결정론 모델(중앙값 + 80% 범위) 기반이며 <strong>투자 자문이 아닙니다</strong>.
      </div>
    </div>
  )
}

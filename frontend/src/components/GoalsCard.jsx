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
  const [showMethod, setShowMethod] = useState(false)

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

  // 은퇴까지 기간(년)·월 납입(₩)을 Strategy Report와 공유 — 목표기반 카드가 단일 입력처.
  useEffect(() => {
    const td = new Date(form.target_date)
    const yrs = Math.round((td - new Date()) / (365.25 * 86400000))
    if (Number.isFinite(yrs) && yrs >= 1) localStorage.setItem('daon_retire_years', String(yrs))
    localStorage.setItem('daon_monthly_inflow', String(Math.max(0, form.monthly_man) * 1e4))
  }, [form.target_date, form.monthly_man])

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
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--m-text-tertiary)',
                  marginLeft: 5 }}>P(만기값 ≥ 목표)</span>
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

          {/* 낙관·비관 범위 — best case는 '상위 10% 낙관'이지 기대값이 아님을 명확히 */}
          {proj.optimistic_final != null && (
            <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-secondary)',
              lineHeight: 1.6, marginBottom: 10 }}>
              <strong style={{ color: 'var(--m-text)' }}>80% 신뢰구간</strong>{' '}
              {fmtKRW(proj.pessimistic_final)}
              <span style={{ color: 'var(--m-text-tertiary)' }}> (비관·하위10%)</span>
              {' ~ '}{fmtKRW(proj.optimistic_final)}
              <span style={{ color: 'var(--m-text-tertiary)' }}> (낙관·상위10%)</span>
            </div>
          )}

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
                formatter={(v, n) => [fmtKRW(v), n === 'median' ? '중앙값' : n === 'band' ? '80% 신뢰구간(10~90%)' : '하단']}
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

          {/* 조언 — '그래서 무엇을 할까' 한두 문장 */}
          <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text-secondary)',
            lineHeight: 1.65, marginTop: 8,
            background: 'var(--m-surface-variant)', border: '1px solid var(--m-outline-variant)',
            borderRadius: 4, padding: '8px 10px' }}>
            <strong style={{ color: 'var(--m-text)', marginRight: 4 }}>조언</strong>
            {proj.status === 'on_track'
              ? '지금처럼 매달 꾸준히 납입을 이어가면 목표를 넘어설 것으로 보입니다. 변동성 큰 자산을 무리하게 늘릴 필요는 없습니다.'
              : `목표에 ${fmtKRW(Math.abs(shortfall))} 부족할 것으로 추정됩니다. 달성 확률을 높이려면 ① 월 납입 늘리기 ② 목표 시점 미루기 ③ 목표 금액 낮추기 중 하나가 필요하며, 가장 손쉬운 건 월 납입을 조금씩 올리는 것입니다.`}
          </div>

          {/* 산정 근거 · 방법론 (신뢰 확보 — 학술/업계 표준 + 레퍼런스) */}
          {proj.methodology && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowMethod(s => !s)} style={{
                background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer',
                color: 'var(--m-primary)', fontSize: 11, fontWeight: 800, fontFamily: 'inherit' }}>
                산정 근거 · 방법론 {showMethod ? '▴ 닫기' : '▾ 보기'}
              </button>
              {showMethod && (
                <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-secondary)',
                  lineHeight: 1.7, marginTop: 6, background: 'var(--m-surface-variant)',
                  border: '1px solid var(--m-outline-variant)', borderRadius: 4, padding: '9px 11px' }}>
                  <div style={{ marginBottom: 8, padding: '7px 9px', borderRadius: 3,
                    background: 'var(--m-surface)', border: '1px solid var(--m-outline-variant)' }}>
                    <strong style={{ color: 'var(--m-text)' }}>쉽게 말하면</strong> — ① 매달 넣는 돈에
                    <strong style={{ color: 'var(--m-text)' }}> 이자가 이자를 낳는 복리</strong>가 붙어 나중에 얼마가 될지
                    가운데값을 그리고(중앙값), ② 주가는 오르락내리락하니 <strong style={{ color: 'var(--m-text)' }}>잘 풀릴 때와
                    안 풀릴 때의 범위</strong>를 함께 그린 뒤(80% 밴드), ③ 그 범위에서
                    <strong style={{ color: 'var(--m-text)' }}> 목표 금액을 넘을 가능성</strong>이 몇 %인지 센 것이
                    달성확률입니다. 기간이 길수록 미래는 더 불확실해서 범위가 넓어집니다.
                  </div>
                  <div style={{ marginBottom: 5 }}>
                    <strong style={{ color: 'var(--m-text)' }}>① 중앙값 경로</strong> — 월 복리 적립식
                    미래가치: <code>PV·(1+r)<sup>t</sup> + 월납입·[((1+r)<sup>t</sup>−1)/r]</code>
                    (r = 연수익률의 월환산).
                  </div>
                  <div style={{ marginBottom: 5 }}>
                    <strong style={{ color: 'var(--m-text)' }}>② 달성확률</strong> — 자산가치를
                    로그정규(기하 브라운 운동)로 보고{' '}
                    <code>P(만기값 ≥ 목표) = Φ((ln·중앙값 − ln·목표) / (σ√T))</code>.
                    중앙값이 목표와 같으면 정확히 50%입니다.
                  </div>
                  <div style={{ marginBottom: 5 }}>
                    <strong style={{ color: 'var(--m-text)' }}>③ 80% 밴드</strong> — 상위10%~하위10%
                    신뢰구간 = <code>중앙값 × exp(±1.2816·σ·√t)</code>. 연 변동성
                    σ={(proj.methodology.annual_vol * 100).toFixed(0)}% 가정에서 현재 낙관 상단은
                    중앙값의 약 <strong style={{ color: 'var(--m-text)' }}>{proj.methodology.band_multiple}배</strong>.
                    변동성이 시간에 누적돼 기간이 길수록 넓어집니다(GBM의 본질). <strong style={{ color: 'var(--m-text)' }}>상단은
                    낙관 시나리오이지 기대값이 아닙니다.</strong>
                  </div>
                  <div style={{ color: 'var(--m-text-tertiary)', fontSize: 10 }}>
                    방식: Betterment 10/90 projection · 로그정규 종가분포(Hull,
                    <i> Options, Futures…</i>; Luenberger, <i>Investment Science</i>) ·
                    결정론≈몬테카를로 동등성(Kasten &amp; Kasten, <i>J. Financial Planning</i>, 2013).
                    적립금 시점분산·리밸런싱 미반영 결정론 추정.
                  </div>
                </div>
              )}
            </div>
          )}
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

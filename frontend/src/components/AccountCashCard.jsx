import React, { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAccounts, updateAccountCash } from '../api'
import { useStore } from '../store'

/* ────────────────────────────────────────────────────────────────────────────
 * 계좌별 예수금 입력
 *
 * - 금액은 **그 계좌의 통화 기준**으로 넣는다(미국 계좌면 달러). 서버도 그대로 저장하고,
 *   원화 환산은 표시 시점 환율로만 한다 — 저장할 때 환산해 버리면 환율이 바뀔 때마다
 *   과거에 넣은 값이 슬금슬금 달라진다.
 * - 바뀐 행만 저장한다. 계좌가 여러 개일 때 안 건드린 행까지 쓰면 cash_updated_at 이
 *   전부 갱신돼 '언제 넣은 값인지'가 무의미해진다.
 * ──────────────────────────────────────────────────────────────────────────── */

const SYMBOL = { KRW: '₩', USD: '$', EUR: '€', JPY: '¥', GBP: '£', CNY: '¥', HKD: 'HK$', BRL: 'R$', INR: '₹' }
export const currencySymbol = (c) => SYMBOL[c] || (c ? c + ' ' : '')

/* 계좌 통화 금액 → 원화. USD 만 환율 적용하고 나머지 외화는 1:1 (앱 전체가 쓰는 기존 규칙). */
export function cashToKrw(amount, currency, usdKrw) {
  const v = Number(amount) || 0
  return currency === 'USD' ? v * (Number(usdKrw) || 0) : v
}

/* 계좌 목록의 예수금 합계(원화) */
export function totalCashKrw(accounts, usdKrw) {
  return (accounts || []).reduce((s, a) => s + cashToKrw(a.cash, a.currency, usdKrw), 0)
}

export default function AccountCashCard() {
  const qc          = useQueryClient()
  const accounts    = useStore(s => s.accounts)
  const setAccounts = useStore(s => s.setAccounts)
  const usdKrw      = useStore(s => s.usdKrw)

  // 입력 중인 값(문자열). 저장 전까지는 스토어를 건드리지 않는다.
  const [draft, setDraft] = useState({})
  const [busy, setBusy]   = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr]     = useState('')

  const valueOf = (a) => (draft[a.key] !== undefined ? draft[a.key] : String(a.cash ?? 0))

  const changed = useMemo(() => accounts.filter(a => {
    if (draft[a.key] === undefined) return false
    const next = Number(draft[a.key])
    if (!Number.isFinite(next)) return false
    return next !== (Number(a.cash) || 0)
  }), [accounts, draft])

  // 미리보기 합계 — 입력 중인 값을 반영해 계산한다(저장 전에도 총액이 어떻게 되는지 보인다)
  const previewTotal = useMemo(() => accounts.reduce((s, a) => {
    const raw = draft[a.key] !== undefined ? Number(draft[a.key]) : Number(a.cash)
    return s + cashToKrw(Number.isFinite(raw) ? raw : 0, a.currency, usdKrw)
  }, 0), [accounts, draft, usdKrw])

  async function save() {
    if (!changed.length) return
    setBusy(true); setErr(''); setSaved(false)
    try {
      for (const a of changed) await updateAccountCash(a.key, Number(draft[a.key]))
      const r = await getAccounts()
      if (r?.accounts) setAccounts(r.accounts)
      setDraft({})
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      // 총자산·현금비중을 쓰는 화면들 갱신
      qc.invalidateQueries({ queryKey: ['portfolio'] })
    } catch (e) {
      setErr(e.response?.data?.detail || '저장에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 4 }}>
        ◆ 계좌별 예수금
      </div>
      {/* R6 — 문장마다 줄바꿈 */}
      <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)',
        marginBottom: 12, lineHeight: 1.6 }}>
        <div>아직 주식을 사지 않고 계좌에 남아 있는 현금입니다.</div>
        <div>넣어두면 포트폴리오 상단 총자산과 분석 탭 현금 비중에 함께 반영됩니다.</div>
        <div>금액은 그 계좌의 통화로 넣으세요 (미국 계좌면 달러).</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {accounts.map(a => {
          const raw  = Number(valueOf(a))
          const krw  = cashToKrw(Number.isFinite(raw) ? raw : 0, a.currency, usdKrw)
          const isKr = a.currency !== 'USD'
          return (
            <div key={a.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '8px 10px', background: 'var(--clr-bg)',
              border: '1px solid var(--clr-border-md)', borderRadius: 4,
            }}>
              <div style={{ flex: '1 1 92px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>{a.currency}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)' }}>
                  {currencySymbol(a.currency)}
                </span>
                <input className="input" type="number" step="any" inputMode="decimal"
                  aria-label={`${a.label} 예수금`}
                  value={valueOf(a)}
                  onChange={e => setDraft(p => ({ ...p, [a.key]: e.target.value }))}
                  placeholder="0"
                  style={{ width: 120, fontSize: 13, textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums' }} />
              </div>

              {/* 자릿수 확인용 — number 입력칸은 천 단위 구분자를 못 넣어서
                  '1250000' 이 125만인지 1250만인지 한눈에 안 들어온다. 아래에 찍어준다. */}
              <div style={{ flex: '1 0 100%', fontSize: 11, color: 'var(--clr-text-muted)',
                fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}
                title={isKr ? undefined : `적용 환율 ₩${Math.round(usdKrw).toLocaleString()}`}>
                {currencySymbol(a.currency)}{Math.round(Number.isFinite(raw) ? raw : 0).toLocaleString()}
                {!isKr && <> · ≈ ₩{Math.round(krw).toLocaleString()}</>}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--clr-border)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>예수금 합계 (원화 환산)</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--clr-text-strong)',
            letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
            ₩{Math.round(previewTotal).toLocaleString()}
          </div>
        </div>
        <button className="btn-primary" onClick={save} disabled={busy || !changed.length}
          style={{ padding: '9px 18px', fontSize: 13, width: 'auto', flexShrink: 0,
            opacity: (busy || !changed.length) ? 0.5 : 1 }}>
          {busy ? '저장 중…' : changed.length ? `저장 (${changed.length})` : '저장'}
        </button>
      </div>

      {saved && <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginTop: 8 }}>✓ 예수금이 저장되었습니다</div>}
      {err   && <div style={{ fontSize: 11, color: 'var(--clr-neg)', marginTop: 8 }}>{err}</div>}
    </div>
  )
}

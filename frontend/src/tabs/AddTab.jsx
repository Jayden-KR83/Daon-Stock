import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addHolding } from '../api'
import { useAccounts } from '../utils/accounts'

export default function AddTab() {
  const qc = useQueryClient()
  const { accounts, accountKeys: ACCOUNTS, accLabels: ACC_LABELS } = useAccounts()
  const [form, setForm] = useState({
    account: accounts[0]?.key || 'US', ticker: '', name: '', quantity: '', avg_price: '', sector: ''
  })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.ticker || !form.quantity || !form.avg_price) {
      setMsg('티커, 수량, 평균 단가는 필수입니다'); return
    }
    setLoading(true); setMsg('')
    try {
      await addHolding(form.account, {
        ticker: form.ticker.trim().toUpperCase(),
        name: form.name.trim() || form.ticker.trim().toUpperCase(),
        quantity: parseFloat(form.quantity),
        avg_price: parseFloat(form.avg_price),
        sector: form.sector.trim(),
      })
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      setMsg(`✅ ${form.ticker.toUpperCase()} 추가 완료!`)
      setForm(p => ({ ...p, ticker: '', name: '', quantity: '', avg_price: '', sector: '' }))
    } catch (err) {
      setMsg(`❌ 오류: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="section-title">종목 추가</div>
      <form onSubmit={handleSubmit}>
        {/* Account */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--clr-text-sub)', fontWeight: 500, display: 'block', marginBottom: 6 }}>계좌</label>
          <div className="seg-ctrl" style={{ flexWrap: 'wrap' }}>
            {ACCOUNTS.map(acc => (
              <button type="button" key={acc} className={`seg-btn ${form.account === acc ? 'active' : ''}`}
                onClick={() => setField('account', acc)}>
                {ACC_LABELS[acc]}
              </button>
            ))}
          </div>
        </div>

        {[
          { label: '티커 (필수)', key: 'ticker', placeholder: 'AAPL, 005930', type: 'text' },
          { label: '종목명', key: 'name', placeholder: '애플', type: 'text' },
          { label: '수량 (필수)', key: 'quantity', placeholder: '10', type: 'number' },
          { label: '평균 단가 (필수)', key: 'avg_price', placeholder: '150.00', type: 'number' },
          { label: '섹터', key: 'sector', placeholder: 'AI & 빅테크', type: 'text' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--clr-text-sub)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              {f.label}
            </label>
            <input
              className="input"
              type={f.type}
              step={f.type === 'number' ? 'any' : undefined}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={e => setField(f.key, e.target.value)}
            />
          </div>
        ))}

        {msg && (
          <div style={{ padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 13,
            background: msg.startsWith('✅') ? 'var(--clr-pos-bg-soft)' : 'var(--clr-neg-bg-soft)',
            color: msg.startsWith('✅') ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)' }}>
            {msg}
          </div>
        )}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? '추가 중...' : '종목 추가'}
        </button>
      </form>
    </div>
  )
}

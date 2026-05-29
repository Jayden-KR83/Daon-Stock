import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useStore } from '../store'
import { useAccounts } from '../utils/accounts'
import { listTransactions, addTransaction, deleteTransaction } from '../api'

/**
 * 종목별 거래내역 — BUY/SELL 기록 + FIFO 실현손익/평균단가 계산.
 * - ChartTab 우측·하단 또는 ManageTab에 임베드 가능
 * - props.ticker 가 있으면 단일 종목 모드, 없으면 전체 거래내역 (리스트 + 종목별 필터)
 */
export default function TransactionsSection({ ticker = '', name = '', isUs = true }) {
  const { accountKeys, accLabels } = useAccounts()
  const [txs, setTxs] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    side: 'BUY', account: accountKeys[0] || 'US',
    quantity: '', price: '', fee: '', tax: '', memo: '',
    traded_at: new Date().toISOString().slice(0, 10),
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function reload() {
    setLoading(true)
    try {
      const r = await listTransactions(ticker)
      setTxs(r.transactions || [])
      setSummary(r.summary || null)
    } catch (e) {
      // 신규 사용자: 빈 상태
      setTxs([]); setSummary(null)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, [ticker])

  async function handleAdd(e) {
    e.preventDefault()
    setErr('')
    const qty = parseFloat(form.quantity)
    const pr  = parseFloat(form.price)
    if (!qty || qty <= 0 || !pr || pr <= 0) { setErr('수량/가격을 입력하세요'); return }
    setBusy(true)
    try {
      await addTransaction({
        account:   form.account,
        ticker:    ticker.toUpperCase(),
        name:      name || ticker,
        side:      form.side,
        quantity:  qty,
        price:     pr,
        fee:       parseFloat(form.fee) || 0,
        tax:       parseFloat(form.tax) || 0,
        traded_at: form.traded_at ? new Date(form.traded_at).getTime() / 1000 : null,
        memo:      form.memo.trim(),
      })
      setForm(p => ({ ...p, quantity: '', price: '', fee: '', tax: '', memo: '' }))
      setShowForm(false)
      await reload()
    } catch (e) {
      setErr(e.response?.data?.detail || '추가 실패')
    } finally {
      setBusy(false)
    }
  }
  async function handleDelete(id) {
    if (!window.confirm('이 거래내역을 삭제합니다. 실현손익 계산이 다시 됩니다.')) return
    await deleteTransaction(id)
    await reload()
  }

  const curSym = isUs ? '$' : '₩'
  const fmtCur = (v) => v == null ? '—' :
    (isUs ? `$${Number(v).toFixed(2)}` : `₩${Math.round(Number(v)).toLocaleString()}`)

  return (
    <div className="chart-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
          <span className="emoji-mute" style={{ marginRight: 6 }}>📒</span>
          거래내역 {ticker && `(${ticker})`}
        </div>
        <button onClick={() => setShowForm(s => !s)}
          style={{ padding: '5px 10px', borderRadius: 6,
            border: '1px solid var(--clr-info)',
            background: showForm ? 'var(--clr-info-bg)' : 'var(--clr-surface)',
            color: 'var(--clr-info-dark)', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit' }}>
          {showForm ? '닫기' : '+ 거래 추가'}
        </button>
      </div>

      {/* 요약 (단일 종목 모드일 때만) */}
      {ticker && summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 6, marginBottom: 10 }}>
          <SummaryTile label="현재 보유" value={`${summary.current_quantity}주`} color="var(--clr-text-strong)" />
          <SummaryTile label="평균단가" value={fmtCur(summary.avg_cost)} color="var(--clr-info-dark)" />
          <SummaryTile label="실현손익"
            value={`${summary.realized_pnl >= 0 ? '+' : ''}${fmtCur(summary.realized_pnl)}`}
            color={summary.realized_pnl >= 0 ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)'} />
          <SummaryTile label="누적비용" value={fmtCur(summary.total_fee)} color="var(--clr-text-muted)" />
        </div>
      )}

      {/* 입력 폼 */}
      <AnimatePresence>
        {showForm && (
          <motion.form onSubmit={handleAdd}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', background: 'var(--clr-bg)',
              borderRadius: 10, padding: 12, marginBottom: 10,
              border: '1px solid var(--clr-border-md)' }}
          >
            <div style={{ display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              {/* BUY/SELL */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lblStyle}>거래 유형</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['BUY','SELL'].map(s => (
                    <button key={s} type="button" onClick={() => setForm(p => ({ ...p, side: s }))}
                      style={{
                        flex: 1, padding: '6px', borderRadius: 6, border: '1.5px solid',
                        borderColor: form.side === s
                          ? (s === 'BUY' ? 'var(--clr-pos)' : 'var(--clr-neg)')
                          : 'var(--clr-border-md)',
                        background: form.side === s
                          ? (s === 'BUY' ? 'var(--clr-pos)' : 'var(--clr-neg)')
                          : 'var(--clr-surface)',
                        color: form.side === s ? '#fff' : 'var(--clr-text-sub)',
                        fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {s === 'BUY' ? '매수' : '매도'}
                    </button>
                  ))}
                </div>
              </div>
              {/* 계좌 */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lblStyle}>계좌</label>
                <select value={form.account}
                  onChange={e => setForm(p => ({ ...p, account: e.target.value }))}
                  className="input" style={{ fontFamily: 'inherit' }}>
                  {accountKeys.map(k => (
                    <option key={k} value={k}>{accLabels[k] || k}</option>
                  ))}
                </select>
              </div>
              {/* 수량 / 가격 */}
              <div>
                <label style={lblStyle}>수량</label>
                <input type="number" step="any" value={form.quantity}
                  onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                  className="input" placeholder="0" />
              </div>
              <div>
                <label style={lblStyle}>단가 ({curSym})</label>
                <input type="number" step="any" value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                  className="input" placeholder="0" />
              </div>
              {/* 수수료 / 세금 */}
              <div>
                <label style={lblStyle}>수수료</label>
                <input type="number" step="any" value={form.fee}
                  onChange={e => setForm(p => ({ ...p, fee: e.target.value }))}
                  className="input" placeholder="0" />
              </div>
              <div>
                <label style={lblStyle}>세금</label>
                <input type="number" step="any" value={form.tax}
                  onChange={e => setForm(p => ({ ...p, tax: e.target.value }))}
                  className="input" placeholder="0" />
              </div>
              {/* 거래일 */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lblStyle}>거래일</label>
                <input type="date" value={form.traded_at}
                  onChange={e => setForm(p => ({ ...p, traded_at: e.target.value }))}
                  className="input" />
              </div>
              {/* 메모 */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lblStyle}>메모 (선택)</label>
                <input type="text" value={form.memo}
                  onChange={e => setForm(p => ({ ...p, memo: e.target.value }))}
                  className="input" placeholder="예: 분할매수 1차" maxLength={200} />
              </div>
            </div>
            {err && (
              <div style={{ fontSize: 11, color: 'var(--clr-neg-dark)', marginBottom: 6 }}>{err}</div>
            )}
            <button type="submit" disabled={busy} className="btn-primary"
              style={{ width: '100%' }}>
              {busy ? '저장 중…' : '거래 기록 저장'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 거래내역 리스트 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20,
          color: 'var(--clr-text-muted)', fontSize: 12 }}>로딩 중…</div>
      ) : txs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, fontSize: 12,
          color: 'var(--clr-text-muted)' }}>
          아직 거래내역이 없습니다.<br/>
          <span style={{ fontSize: 10.5 }}>매수·매도 기록을 추가하면 평균단가·실현손익이 자동 계산됩니다.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {txs.slice(0, 50).map(tx => {
            const isBuy = tx.side === 'BUY'
            const d = new Date(tx.traded_at * 1000)
            const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
            return (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', background: 'var(--clr-bg)',
                borderRadius: 8, borderLeft: `3px solid ${isBuy ? 'var(--clr-pos)' : 'var(--clr-neg)'}`,
              }}>
                <span style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 800,
                  background: isBuy ? 'var(--clr-pos)' : 'var(--clr-neg)', color: '#fff',
                  letterSpacing: '.04em',
                }}>{isBuy ? '매수' : '매도'}</span>
                <span style={{ fontSize: 11, color: 'var(--clr-text-muted)',
                  fontVariantNumeric: 'tabular-nums', minWidth: 84 }}>{dateStr}</span>
                {!ticker && (
                  <span style={{ fontSize: 12, fontWeight: 700,
                    color: 'var(--clr-info-dark)', minWidth: 60 }}>{tx.ticker}</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--clr-text-sub)',
                  flex: 1, minWidth: 0, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  fontVariantNumeric: 'tabular-nums' }}>
                  {tx.quantity}주 × {fmtCur(tx.price)}
                  {tx.memo && <span style={{ marginLeft: 6, color: 'var(--clr-text-muted)',
                    fontSize: 10 }}>· {tx.memo}</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800,
                  color: 'var(--clr-text-strong)',
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fmtCur(tx.quantity * tx.price)}
                </span>
                <button onClick={() => handleDelete(tx.id)} title="삭제"
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--clr-text-muted)', fontSize: 14, padding: 0,
                    lineHeight: 1 }}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryTile({ label, value, color }) {
  return (
    <div style={{ background: 'var(--clr-bg)', border: '1px solid var(--clr-border-md)',
      borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--clr-text-muted)',
        letterSpacing: '.05em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 900, color,
        marginTop: 2, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
    </div>
  )
}

const lblStyle = { display: 'block', fontSize: 10, fontWeight: 700,
  color: 'var(--clr-text-sub)', letterSpacing: '.04em',
  textTransform: 'uppercase', marginBottom: 4 }

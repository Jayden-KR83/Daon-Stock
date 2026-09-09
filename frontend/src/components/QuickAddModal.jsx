import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, addHolding, resolveTicker, resolveByName } from '../api'
import { useAccounts } from '../utils/accounts'

/* ══════════════════════════════════════════════════════════════════════
   빠른 등록 — 보던 화면을 떠나지 않고 한 종목만 넣는다
   ══════════════════════════════════════════════════════════════════════
   등록 탭은 여러 종목을 한꺼번에 다루는 표다. 한 종목 넣자고 탭을 옮기면
   보고 있던 포트폴리오 화면이 사라지고, 넣은 뒤 다시 돌아와야 한다.
   한 건짜리 일에 화면 전환 두 번은 과하다.

   ⚠ 저장은 addHolding(POST /portfolio/{account}/add) 한 건만 쓴다.
     등록 탭의 savePortfolio 는 **전체 교체**라, 여기서 그걸 쓰면 관심목록처럼
     내가 안 건드린 것까지 같이 덮어써야 한다 — 한 건 넣자고 질 위험이 아니다.
     서버가 티커 정규화(BTC → BTC-USD)와 검증도 이미 해 준다.
   ⚠ 같은 계좌에 같은 티커가 이미 있으면 서버는 조용히 덮어쓴다. 그래서
     보내기 전에 여기서 막고 알린다 — 수량을 합칠지 고칠지는 사람이 정할 일이다.
   ══════════════════════════════════════════════════════════════════════ */

export default function QuickAddModal({ open, onClose, onGoToAddTab }) {
  const qc = useQueryClient()
  const { accounts } = useAccounts()
  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })

  const [account, setAccount] = useState('')
  const [ticker, setTicker]   = useState('')
  const [name, setName]       = useState('')
  const [sector, setSector]   = useState('')
  const [qty, setQty]         = useState('')
  const [avg, setAvg]         = useState('')
  const [busy, setBusy]       = useState(false)
  const [looking, setLooking] = useState(false)
  const [err, setErr]         = useState('')
  const firstRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setErr('')
    setAccount(a => a || accounts[0]?.key || '')
    // 열리면 바로 타이핑할 수 있어야 한다
    requestAnimationFrame(() => firstRef.current?.focus())
  }, [open, accounts])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function lookupByTicker() {
    const t = ticker.trim()
    if (!t) return
    setLooking(true)
    try {
      const d = await resolveTicker(t)
      if (d.ticker) setTicker(d.ticker)
      if (d.name && !name.trim()) setName(d.name)
      if (d.sector && !sector.trim()) setSector(d.sector)
    } catch { /* 못 찾으면 손으로 적는다 */ }
    finally { setLooking(false) }
  }

  async function lookupByName() {
    const nm = name.trim()
    if (!nm || ticker.trim()) return
    setLooking(true)
    try {
      const d = await resolveByName(nm)
      if (d.ticker) setTicker(d.ticker)
      if (d.sector && !sector.trim()) setSector(d.sector)
    } catch { /* 확실하지 않으면 서버가 답을 주지 않는다 */ }
    finally { setLooking(false) }
  }

  async function submit(e) {
    e?.preventDefault?.()
    setErr('')
    const t = ticker.trim().toUpperCase()
    const q = parseFloat(String(qty).replace(/,/g, ''))
    const a = parseFloat(String(avg).replace(/,/g, ''))
    if (!t) return setErr('티커 또는 종목명을 넣어 주세요.')
    if (!account) return setErr('계좌를 골라 주세요.')
    if (!(q > 0)) return setErr('수량을 넣어 주세요.')
    if (!(a > 0)) return setErr('평균단가를 넣어 주세요.')

    const list = portfolio?.portfolios?.[account] || []
    if (list.some(h => String(h.ticker).toUpperCase() === t)) {
      return setErr(`${t} 는 이 계좌에 이미 있습니다. 등록 탭에서 수정하세요.`)
    }

    setBusy(true)
    try {
      await addHolding(account, {
        ticker: t, name: name.trim() || t,
        quantity: q, avg_price: a, sector: sector.trim(),
      })
      await qc.invalidateQueries({ queryKey: ['portfolio'] })
      setTicker(''); setName(''); setSector(''); setQty(''); setAvg('')
      onClose()
    } catch (e2) {
      setErr(e2?.response?.data?.detail || '저장하지 못했습니다.')
    } finally { setBusy(false) }
  }

  return (
    <div className="qa-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="qa-modal" role="dialog" aria-modal="true" aria-label="종목 빠른 추가">
        <div className="qa-head">
          <div className="qa-title">종목 추가</div>
          <button className="qa-x" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <form onSubmit={submit} className="qa-body">
          <label className="qa-field">
            <span>계좌</span>
            <select value={account} onChange={e => setAccount(e.target.value)}>
              {accounts.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>

          <div className="qa-two">
            <label className="qa-field">
              <span>티커</span>
              <input ref={firstRef} value={ticker} placeholder="AAPL · 005930 · BTC"
                onChange={e => setTicker(e.target.value)}
                onBlur={lookupByTicker}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
            </label>
            <label className="qa-field">
              <span>종목명</span>
              <input value={name} placeholder={looking ? '조회 중…' : '자동으로 채워집니다'}
                onChange={e => setName(e.target.value)}
                onBlur={lookupByName}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
            </label>
          </div>

          <div className="qa-two">
            <label className="qa-field">
              <span>수량</span>
              <input inputMode="decimal" value={qty} placeholder="10"
                onChange={e => setQty(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
            <label className="qa-field">
              <span>평균단가</span>
              <input inputMode="decimal" value={avg} placeholder="180.5"
                onChange={e => setAvg(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
          </div>

          {err && <div className="qa-err ko-keep">{err}</div>}

          <div className="qa-foot">
            {/* 여러 건이면 표가 낫다. 길을 막지 않고 옆에 둔다. */}
            <button type="button" className="qa-alt"
              onClick={() => { onClose(); onGoToAddTab?.() }}>
              여러 개 등록하기
            </button>
            <button type="submit" className="btn-primary" disabled={busy}
              style={{ width: 'auto', padding: '9px 20px' }}>
              {busy ? '저장 중…' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

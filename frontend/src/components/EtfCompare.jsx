import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { searchStocks, getEtfCompare, getEtfCompareAi } from '../api'
import { useStore } from '../store'
import LogoCircle from './LogoCircle'

/**
 * 한·미 ETF 비교 도구 — TrendsTab에 임베드되는 섹션 컴포넌트.
 * - ETF 2~4개 선택 → 비교표 + AI 시사점.
 * - 한국 ETF (6자리 코드, A 접두사) + 미국 ETF 모두 지원.
 */
export default function EtfCompare() {
  const hasAnthropicKey = useStore(s => s.hasAnthropicKey)
  const currentUser     = useStore(s => s.currentUser)
  const aiEnabled       = !!currentUser?.ai_enabled || !!currentUser?.is_admin
  const [selected, setSelected] = useState([])  // {ticker, name, exchange}
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [compareData, setCompareData] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareErr, setCompareErr] = useState('')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState('')
  const inputRef = useRef(null)
  const dropRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const h = (e) => {
      if (!dropRef.current || !inputRef.current) return
      if (!dropRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    if (debouncedQ.length < 1) { setSearchResults([]); return }
    let aborted = false
    setSearching(true)
    searchStocks(debouncedQ)
      .then(r => { if (!aborted) setSearchResults(r || []) })
      .catch(() => { if (!aborted) setSearchResults([]) })
      .finally(() => { if (!aborted) setSearching(false) })
    return () => { aborted = true }
  }, [debouncedQ])

  // ETF 추정 (Yahoo quoteType=ETF) — 사실상 모든 결과 허용 (사용자가 직접 선택)
  const filteredResults = searchResults.slice(0, 8)

  function addEtf(item) {
    if (selected.length >= 4) return
    if (selected.find(s => s.ticker === item.symbol)) return
    setSelected([...selected, {
      ticker: item.symbol,
      name: item.shortname || item.symbol,
      exchange: item.exchange || '',
      qtype: item.quoteType || '',
    }])
    setQ('')
    setShowDrop(false)
    setCompareData(null)
    setAiInsight(null)
  }
  function removeEtf(ticker) {
    setSelected(selected.filter(s => s.ticker !== ticker))
    setCompareData(null)
    setAiInsight(null)
  }

  async function runCompare() {
    if (selected.length < 2) { setCompareErr('비교를 위해 2개 이상의 ETF를 선택하세요'); return }
    setCompareLoading(true); setCompareErr(''); setAiInsight(null); setAiErr('')
    try {
      const r = await getEtfCompare(selected.map(s => s.ticker))
      setCompareData(r)
    } catch (e) {
      setCompareErr(e.response?.data?.detail || e.message || '비교 실패')
    } finally {
      setCompareLoading(false)
    }
  }
  async function runAiInsight() {
    if (!compareData?.etfs) return
    setAiLoading(true); setAiErr('')
    try {
      const r = await getEtfCompareAi(compareData.etfs)
      setAiInsight(r)
    } catch (e) {
      setAiErr(e.response?.data?.detail || e.message || 'AI 분석 실패')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="tt-card" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="tt-card-header">
        <div>
          <div className="tt-card-title">한·미 ETF 비교</div>
          <div className="tt-card-sub">최대 4개의 ETF를 선택해 보수율·AUM·거래량·보유종목을 비교</div>
        </div>
      </div>

      {/* 선택된 ETF 칩 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 0 10px' }}>
        {selected.map(s => (
          <motion.div
            key={s.ticker}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 9px', borderRadius: 18,
              background: 'var(--clr-info-bg)',
              border: '1px solid var(--clr-info-border)',
              fontSize: 11, fontWeight: 700, color: 'var(--clr-info-dark)',
            }}>
            <LogoCircle ticker={s.ticker} size={16} />
            <span>{s.ticker}</span>
            <button
              onClick={() => removeEtf(s.ticker)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--clr-info-dark)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </motion.div>
        ))}
        {selected.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
            아래 검색창에서 ETF 추가 (예: KODEX 200, SPY, TIGER 미국나스닥100, IBIT)
          </div>
        )}
      </div>

      {/* ETF 검색 */}
      {selected.length < 4 && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            ref={inputRef}
            className="input"
            placeholder="ETF 검색 (KODEX·TIGER·SPY·QQQ 등)"
            value={q}
            onChange={e => { setQ(e.target.value); setShowDrop(e.target.value.length >= 1) }}
            onFocus={() => q.length >= 1 && setShowDrop(true)}
            autoComplete="off"
          />
          {searching && (
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 10, color: 'var(--clr-text-muted)' }}>검색 중...</div>
          )}
          {showDrop && filteredResults.length > 0 && (
            <div ref={dropRef} style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: 'var(--clr-surface)', border: '1px solid var(--clr-border-md)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(15,23,42,.12)', zIndex: 50, maxHeight: 280, overflowY: 'auto',
            }}>
              {filteredResults.map(r => {
                const isEtf = (r.quoteType || '').toUpperCase() === 'ETF'
                return (
                  <div key={r.symbol}
                    onMouseDown={e => { e.preventDefault(); addEtf(r) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                      borderBottom: '1px solid var(--clr-border)', cursor: 'pointer' }}>
                    <LogoCircle ticker={r.symbol} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--clr-text-strong)', fontSize: 12 }}>
                        {r.symbol}
                        {isEtf && <span style={{ marginLeft: 6, padding: '1px 6px',
                          background: 'var(--clr-info-bg)', borderRadius: 4,
                          color: 'var(--clr-info-dark)', fontSize: 9, fontWeight: 800 }}>ETF</span>}
                      </div>
                      <div style={{ color: 'var(--clr-text-muted)', fontSize: 11,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.shortname}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 비교 버튼 */}
      <button
        onClick={runCompare}
        disabled={compareLoading || selected.length < 2}
        style={{
          width: '100%', padding: '10px 16px', borderRadius: 10,
          background: 'linear-gradient(135deg, var(--clr-info) 0%, var(--clr-ai) 100%)',
          color: '#fff', border: 'none', fontSize: 13, fontWeight: 800,
          cursor: (compareLoading || selected.length < 2) ? 'not-allowed' : 'pointer',
          opacity: (compareLoading || selected.length < 2) ? 0.5 : 1,
          fontFamily: 'inherit', letterSpacing: '-.01em',
        }}>
        {compareLoading
          ? '데이터 수집 중...'
          : `${selected.length || ''} ETF 비교하기`}
      </button>

      {compareErr && (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: 'var(--clr-neg-bg-soft)', color: 'var(--clr-neg-dark)',
          fontSize: 12 }}>{compareErr}</div>
      )}

      {/* 비교 결과 */}
      <AnimatePresence>
        {compareData?.etfs && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
            style={{ marginTop: 14 }}
          >
            <CompareTable etfs={compareData.etfs} />

            {/* AI 시사점 트리거 */}
            <button
              onClick={runAiInsight}
              disabled={aiLoading || !hasAnthropicKey || !aiEnabled}
              style={{
                marginTop: 12, width: '100%', padding: '9px 14px', borderRadius: 8,
                background: (hasAnthropicKey && aiEnabled) ? 'var(--clr-bg)' : 'transparent',
                color: 'var(--clr-ai)',
                border: '1.5px solid var(--clr-ai)', fontSize: 12, fontWeight: 800,
                cursor: (aiLoading || !hasAnthropicKey || !aiEnabled) ? 'not-allowed' : 'pointer',
                opacity: (aiLoading || !hasAnthropicKey || !aiEnabled) ? 0.55 : 1,
                fontFamily: 'inherit',
              }}>
              {aiLoading
                ? 'AI 분석 중... (15~30초)'
                : !hasAnthropicKey
                  ? '⚙ API Key 필요 (관리 탭)'
                  : !aiEnabled
                    ? '🔒 AI 분석 권한 필요 (관리자 승인)'
                    : '◆ AI 투자 시사점 분석'}
            </button>

            {aiErr && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
                background: 'var(--clr-neg-bg-soft)', color: 'var(--clr-neg-dark)',
                fontSize: 12 }}>{aiErr}</div>
            )}

            {aiInsight && <AiInsightCard data={aiInsight} etfs={compareData.etfs} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CompareTable({ etfs }) {
  const formatAum = (e) => {
    const v = e.aum_usd ?? e.aum_krw
    if (!v) return '—'
    if (e.market === 'US') {
      if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
      if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
      return `$${v.toLocaleString()}`
    }
    if (v >= 1e12) return `₩${(v / 1e12).toFixed(2)}조`
    if (v >= 1e8)  return `₩${(v / 1e8).toFixed(0)}억`
    return `₩${v.toLocaleString()}`
  }
  const formatVol = (v) => {
    if (!v) return '—'
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
    return v.toLocaleString()
  }
  const formatErr = (e) => {
    if (e.expense_ratio == null) return '—'
    return `${(e.expense_ratio * 100).toFixed(2)}%`
  }
  const formatPrice = (e) => {
    if (e.current_price == null) return '—'
    if (e.market === 'US') return `$${e.current_price.toFixed(2)}`
    return `₩${Math.round(e.current_price).toLocaleString()}`
  }

  const rows = [
    { label: '시장',     fn: e => e.market === 'US' ? '🇺🇸 미국' : '🇰🇷 한국' },
    { label: '현재가',   fn: e => formatPrice(e) },
    { label: '일간 변동률', fn: e => {
        if (e.change_pct == null) return '—'
        const up = e.change_pct >= 0
        return <span style={{ color: up ? 'var(--clr-pos)' : 'var(--clr-neg)', fontWeight: 700 }}>
          {up ? '+' : ''}{e.change_pct.toFixed(2)}%
        </span>
      } },
    { label: '시가총액 (AUM)', fn: e => formatAum(e) },
    { label: '거래량',   fn: e => formatVol(e.avg_volume) },
    { label: '보수율',   fn: e => formatErr(e) },
    { label: '섹터/분류', fn: e => e.sector_focus || e.category || '—' },
  ]

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--clr-border-md)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12,
        fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ background: 'var(--clr-bg)' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10,
              color: 'var(--clr-text-muted)', fontWeight: 700, letterSpacing: '.04em',
              textTransform: 'uppercase', whiteSpace: 'nowrap' }}>지표</th>
            {etfs.map(e => (
              <th key={e.ticker} style={{ padding: '8px 10px', textAlign: 'right',
                fontSize: 11, color: 'var(--clr-text-strong)', fontWeight: 800,
                borderLeft: '1px solid var(--clr-border)' }}>
                <div className="emoji-mute" style={{ display: 'inline-block', marginRight: 4 }}>
                  {e.market === 'US' ? '🇺🇸' : '🇰🇷'}
                </div>
                {e.ticker}
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--clr-text-muted)',
                  marginTop: 1, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>
                  {e.name}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} style={{ borderTop: '1px solid var(--clr-border)' }}>
              <td className="ko-keep" style={{ padding: '8px 10px',
                fontSize: 11, color: 'var(--clr-text-sub)', fontWeight: 600 }}>
                {row.label}
              </td>
              {etfs.map(e => (
                <td key={e.ticker} style={{ padding: '8px 10px', textAlign: 'right',
                  fontSize: 12, color: 'var(--clr-text)', fontWeight: 600,
                  borderLeft: '1px solid var(--clr-border)' }}>
                  {e.error ? <span style={{ color: 'var(--clr-neg)' }}>오류</span> : row.fn(e)}
                </td>
              ))}
            </tr>
          ))}
          {/* Top holdings (미국만 유효한 경우 많음) */}
          <tr style={{ borderTop: '1px solid var(--clr-border)' }}>
            <td className="ko-keep" style={{ padding: '8px 10px',
              fontSize: 11, color: 'var(--clr-text-sub)', fontWeight: 600, verticalAlign: 'top' }}>
              상위 보유 종목
            </td>
            {etfs.map(e => (
              <td key={e.ticker} style={{ padding: '8px 10px', textAlign: 'left',
                fontSize: 10.5, color: 'var(--clr-text)', fontWeight: 500,
                borderLeft: '1px solid var(--clr-border)', lineHeight: 1.55 }}>
                {(e.top_holdings && e.top_holdings.length > 0)
                  ? e.top_holdings.slice(0, 5).map((h, i) => (
                      <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis' }}>
                        <span style={{ fontWeight: 700, color: 'var(--clr-info-dark)' }}>
                          {h.symbol || h.name}
                        </span>
                        {(h.weight ?? 0) > 0 && (
                          <span style={{ color: 'var(--clr-text-muted)', marginLeft: 4 }}>
                            {(h.weight * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))
                  : <span style={{ color: 'var(--clr-text-muted)' }}>—</span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function AiInsightCard({ data, etfs }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ marginTop: 14, padding: 14, borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(99,102,241,.08), rgba(14,165,233,.06))',
        border: '1px solid rgba(99,102,241,.25)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span className="emoji-mute" style={{ fontSize: 14 }}>💡</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--clr-ai)',
          letterSpacing: '-.01em' }}>AI 투자 시사점</span>
      </div>

      {data.thesis && (
        <div className="ko-keep" style={{ fontSize: 13, color: 'var(--clr-text)',
          lineHeight: 1.75, marginBottom: 10 }}>
          {data.thesis}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {data.similarities && (
          <div style={{ padding: '8px 10px', background: 'var(--clr-surface)',
            borderRadius: 8, border: '1px solid var(--clr-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--clr-pos-dark)',
              marginBottom: 4 }}>공통점</div>
            <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--clr-text)',
              lineHeight: 1.65 }}>{data.similarities}</div>
          </div>
        )}
        {data.differences && (
          <div style={{ padding: '8px 10px', background: 'var(--clr-surface)',
            borderRadius: 8, border: '1px solid var(--clr-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--clr-warn-dark)',
              marginBottom: 4 }}>차이점</div>
            <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--clr-text)',
              lineHeight: 1.65 }}>{data.differences}</div>
          </div>
        )}
      </div>

      {Array.isArray(data.verdict) && data.verdict.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--clr-text-strong)',
            marginBottom: 6 }}>각 ETF별 추천 시나리오</div>
          {data.verdict.map((v, i) => {
            const matched = etfs.find(e => e.ticker === v.ticker)
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '8px 10px', background: 'var(--clr-surface)',
                borderRadius: 8, marginBottom: 6, border: '1px solid var(--clr-border)' }}>
                <span style={{ flexShrink: 0, padding: '2px 6px', borderRadius: 5,
                  fontSize: 9, fontWeight: 800, background: 'var(--clr-info-bg)',
                  color: 'var(--clr-info-dark)' }}>{v.ticker}</span>
                <span className="ko-keep" style={{ fontSize: 11.5, color: 'var(--clr-text)',
                  lineHeight: 1.55 }}>{v.best_for}</span>
              </div>
            )
          })}
        </div>
      )}

      {data.risk_note && (
        <div style={{ padding: '8px 10px', background: 'var(--clr-neg-bg-soft)',
          borderLeft: '3px solid var(--clr-neg)', borderRadius: 6,
          fontSize: 11.5, color: 'var(--clr-neg-dark)', lineHeight: 1.65 }}>
          <span className="emoji-mute" style={{ marginRight: 4 }}>⚠</span>
          <span className="ko-keep">{data.risk_note}</span>
        </div>
      )}
    </motion.div>
  )
}

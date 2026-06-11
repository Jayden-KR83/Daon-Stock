import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { getPortfolio, getPricesBatch, deleteHolding, addHolding } from '../api'
import { useStore } from '../store'
import LogoCircle from '../components/LogoCircle'
import Sparkline from '../components/Sparkline'
import NumberTicker from '../components/NumberTicker'
import NoteSheet from '../components/NoteSheet'
import TransactionsSection from '../components/TransactionsSection'
import Sparkles from '../components/Sparkles'
import { SkeletonRow } from '../components/Skeleton'
import { usePriceFlash } from '../hooks/usePriceFlash'
import { isKrTicker } from '../utils/displayName'
import { useAccounts } from '../utils/accounts'
import { listNotes } from '../api'
import './HoldingsTab.css'

/* 가격 숫자 변경 시 플래시 효과 */
function FlashPrice({ value, fmt, className }) {
  const flash = usePriceFlash(value)
  return <div className={`${className} ${flash}`}>{fmt(value)}</div>
}

export default function HoldingsTab() {
  const qc = useQueryClient()
  // 동적 계좌
  const { accountKeys: ACCOUNTS, accLabels: ACC_LABELS } = useAccounts()
  const usdKrw        = useStore(s => s.usdKrw)
  const setChartTicker = useStore(s => s.setChartTicker)
  const setActiveTab  = useStore(s => s.setActiveTab)
  const currentUser   = useStore(s => s.currentUser)
  const privacyMode   = useStore(s => s.privacyMode)
  const togglePrivacy = useStore(s => s.togglePrivacy)

  const [accFilter,    setAccFilter]    = useState('전체')
  const [viewMode,     setViewMode]     = useState('평가액')   // '평가액' | '시세'
  const [sortOrder,    setSortOrder]    = useState('높은순')   // '높은순' | '낮은순'
  const [currencyMode, setCurrencyMode] = useState('KRW')      // 'KRW' | 'USD'
  const [editTicker,   setEditTicker]   = useState(null)
  const [noteTicker,   setNoteTicker]   = useState(null)       // {ticker, name, isUs} | null

  // 사용자의 메모 일괄 조회 — 종목 카드의 메모 아이콘 강조용
  const { data: notesData, refetch: refetchNotes } = useQuery({
    queryKey: ['notes'],
    queryFn: listNotes,
    staleTime: 300_000,
  })
  const notesByTicker = notesData?.notes || {}

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

  const filtered = accFilter === '전체'
    ? allHoldings
    : allHoldings.filter(h => h.account === accFilter)

  const tickers = filtered.map(h => h.ticker)
  const { data: prices = {} } = useQuery({
    queryKey: ['prices-batch', tickers.join(',')],
    queryFn: () => getPricesBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  // 요약 계산 (항상 KRW 기준)
  const { totalCur, totalInvest, profit } = React.useMemo(() => {
    let totalCur = 0, totalInvest = 0
    for (const h of filtered) {
      const isUs = !/^A?\d{6}$/.test(h.ticker)
      const cur  = prices[h.ticker]?.current_price ?? h.avg_price
      const mul  = isUs ? usdKrw : 1
      totalCur    += h.quantity * cur * mul
      totalInvest += h.quantity * h.avg_price * mul
    }
    return { totalCur, totalInvest, profit: totalCur - totalInvest }
  }, [filtered, prices, usdKrw])

  const profitPct   = totalInvest > 0 ? profit / totalInvest * 100 : 0
  const profitColor = profit >= 0 ? '#16A34A' : '#DC2626'
  const isUsd       = currencyMode === 'USD'

  // 평가액 기준 정렬
  const sorted = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      const getVal = h => {
        const isUs = !/^A?\d{6}$/.test(h.ticker)
        const cur  = prices[h.ticker]?.current_price ?? h.avg_price
        return h.quantity * cur * (isUs ? usdKrw : 1)
      }
      const diff = getVal(b) - getVal(a)
      return sortOrder === '높은순' ? diff : -diff
    })
  }, [filtered, prices, usdKrw, sortOrder])

  // 금액 포맷 (KRW or USD)
  const fmtVal = (krwAmt) => {
    if (isUsd) return `$${(krwAmt / usdKrw).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    return `₩${Math.round(krwAmt).toLocaleString()}`
  }
  // 프라이버시 마스크 — 같은 길이 유지로 레이아웃 흔들림 방지
  const mask = (s) => {
    if (!privacyMode) return s
    if (s == null) return s
    return String(s).replace(/[0-9.,]/g, '•')
  }
  const maskPct = (s) => privacyMode ? '••.••%' : s

  return (
    <div className="holdings-tab">
      {/* Hero */}
      <div className="hero-card" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* 큰 양수 수익률(+10% 이상) 일 때 Sparkles로 시각적 보상 */}
        <Sparkles active={!privacyMode && (profitPct ?? 0) >= 10} count={4} />
        {/* 가림/표시 토글 — 우측 상단 (양방향) */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePrivacy() }}
          title={privacyMode ? '금액 보이기' : '금액 가리기'}
          aria-label={privacyMode ? '금액 보이기' : '금액 가리기'}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 4,
            background: 'var(--clr-bg)',
            border: '1px solid var(--clr-border-md)',
            color: 'var(--clr-text-sub)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
          {privacyMode ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              가림
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              표시
            </>
          )}
        </button>

        <div className="hero-app-name" style={{
          paddingRight: 80,  /* 토글 버튼 영역 확보 */
          maxWidth: '100%', overflow: 'hidden',
        }}>
          다온 포트폴리오 사용자
          {currentUser?.nickname && (
            <span style={{
              display: 'block', fontSize: 17, fontWeight: 800,
              color: 'var(--clr-pos)', letterSpacing: '-.01em', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {currentUser.nickname}
            </span>
          )}
        </div>
        <div
          onClick={() => { if (privacyMode) togglePrivacy() }}
          title={privacyMode ? '눌러서 금액 표시' : ''}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            cursor: privacyMode ? 'pointer' : 'default',
            userSelect: privacyMode ? 'none' : 'auto',
          }}>
          <div>
            <div className="hero-label">
              총 평가액 {privacyMode && (
                <span style={{ fontSize: 9, opacity: .65, fontWeight: 600, marginLeft: 4 }}>
                  · 탭하여 표시
                </span>
              )}
            </div>
            <div className="hero-value">
              {privacyMode
                ? mask(fmtVal(totalCur))
                : <NumberTicker value={totalCur} format={fmtVal} duration={0.9} />}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="hero-label">손익</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: profitColor }}>
              {privacyMode
                ? mask(fmtVal(profit))
                : <NumberTicker
                    value={profit}
                    format={v => `${v >= 0 ? '+' : ''}${fmtVal(v)}`}
                    duration={0.9}
                  />}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: profitColor }}>
              {privacyMode
                ? maskPct()
                : <NumberTicker
                    value={profitPct ?? 0}
                    format={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                    duration={0.9}
                  />}
            </div>
          </div>
        </div>
      </div>

      {/* 필터 + 뷰 옵션 — 계좌(드롭다운)와 정렬 토글을 한 행으로 통합 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 계좌 필터 (드롭다운) */}
        <select
          className="acc-filter-select"
          value={accFilter}
          onChange={e => setAccFilter(e.target.value)}
          aria-label="계좌 필터"
        >
          {['전체', ...ACCOUNTS].map(acc => (
            <option key={acc} value={acc}>
              {acc === '전체' ? '전체 계좌' : ACC_LABELS[acc]}
            </option>
          ))}
        </select>

        {/* 평가액/시세 */}
        <div className="seg-ctrl" style={{ flex: 'none' }}>
          {['평가액', '시세'].map(v => (
            <button key={v} className={`seg-btn ${viewMode === v ? 'active' : ''}`}
              onClick={() => setViewMode(v)} style={{ minWidth: 44 }}>{v}</button>
          ))}
        </div>
        {/* 높은순/낮은순 */}
        <div className="seg-ctrl" style={{ flex: 'none' }}>
          {['높은순', '낮은순'].map(v => (
            <button key={v} className={`seg-btn ${sortOrder === v ? 'active' : ''}`}
              onClick={() => setSortOrder(v)} style={{ minWidth: 48 }}>{v}</button>
          ))}
        </div>
        {/* KRW/USD */}
        <div className="seg-ctrl" style={{ flex: 'none' }}>
          {['KRW', 'USD'].map(v => (
            <button key={v} className={`seg-btn ${currencyMode === v ? 'active' : ''}`}
              onClick={() => setCurrencyMode(v)} style={{ minWidth: 44 }}>{v === 'KRW' ? '₩원화' : '$달러'}</button>
          ))}
        </div>
      </div>

      {/* Holdings list */}
      {!portfolio ? (
        /* 포트폴리오 로딩 스켈레톤 */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4].map(i => <SkeletonRow key={i} avatarSize={42} />)}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: '24px 20px', background: 'var(--clr-surface)',
          border: '1px solid var(--clr-border-md)', borderRadius: 4,
          textAlign: 'center', boxShadow: '0 1px 3px rgba(15,23,42,.04)' }}>
          <div className="emoji-mute" style={{ fontSize: 40, marginBottom: 6 }}>💼</div>
          <div className="ko-keep" style={{ fontSize: 15, fontWeight: 800,
            color: 'var(--clr-text-strong)', marginBottom: 4 }}>
            다온에 오신 것을 환영합니다
          </div>
          <div className="ko-keep" style={{ fontSize: 12, color: 'var(--clr-text-muted)',
            marginBottom: 14, lineHeight: 1.7 }}>
            첫 종목을 추가하면 평가액·수익률·섹터 비중·AI 분석이 자동으로 활성화됩니다.<br/>
            티커(예: AAPL, 005930)나 종목명으로 자유롭게 추가하세요.
          </div>
          <button onClick={() => setActiveTab(5)} className="btn-primary"
            style={{ padding: '10px 22px' }}>
            첫 종목 추가하기 →
          </button>
          <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--clr-text-muted)',
            marginTop: 12, lineHeight: 1.6 }}>
            계좌 구조가 본인과 다르다면 <strong style={{ color: 'var(--clr-info-dark)' }}>관리 탭 → 계좌 관리</strong>에서
            추가/이름변경/삭제할 수 있습니다.
          </div>
        </div>
      ) : (
        <motion.div
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          initial="hidden"
          animate="show"
        >
        <AnimatePresence initial={false}>
        {sorted.map(h => {
          // 모든 숫자 필드를 안전하게 변환 — DB 또는 외부 API가 string·null·NaN 반환해도 NaN 전파 차단
          const ticker = String(h.ticker || '')
          const qty    = Number(h.quantity) || 0
          const avg    = Number(h.avg_price) || 0
          const isUs   = !/^A?\d{6}$/.test(ticker)
          const priceData = prices[ticker]
          const rawCur = priceData?.current_price
          const hasLivePrice = priceData != null && rawCur != null
            && typeof rawCur === 'number' && !isNaN(rawCur)
          const isStale = !!priceData?._stale
          const cur     = hasLivePrice ? rawCur : avg
          const chgPct  = Number(priceData?.change_pct) || 0
          const up      = chgPct >= 0
          const mul     = isUs ? (Number(usdKrw) || 1) : 1
          const costKrw = qty * avg * mul
          const curKrw  = qty * cur * mul
          const pnlKrw  = curKrw - costKrw
          const pnlPct  = costKrw > 0 ? (pnlKrw / costKrw) * 100 : 0

          if (editTicker === `${h.account}-${h.ticker}`) {
            return (
              <EditPanel key={`${h.account}-${h.ticker}`} holding={h}
                onSave={async (updated) => {
                  // 계좌가 바뀐 경우: 기존 계좌에서 삭제 후 새 계좌에 추가
                  if (updated.account !== h.account) {
                    await deleteHolding(h.account, h.ticker)
                  }
                  const { account, ...rest } = updated
                  await addHolding(account, rest)
                  qc.invalidateQueries({ queryKey: ['portfolio'] })
                  setEditTicker(null)
                }}
                onCancel={() => setEditTicker(null)}
                onDelete={async () => {
                  await deleteHolding(h.account, h.ticker)
                  qc.invalidateQueries({ queryKey: ['portfolio'] })
                  setEditTicker(null)
                }}
              />
            )
          }

          return (
            <motion.div
              key={`${h.account}-${h.ticker}`}
              layout
              variants={{
                hidden: { opacity: 0, y: 10 },
                show:   { opacity: 1, y: 0 },
              }}
              exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              className="holding-row"
            >
              {/* 1. Avatar */}
              <div className="h-avatar" onClick={() => setChartTicker(h.ticker)}>
                <LogoCircle ticker={h.ticker} size={40} />
              </div>

              {/* 2. Identity (이름 + 티커 inline) */}
              <div className="h-identity" onClick={() => setChartTicker(h.ticker)}>
                {isKrTicker(h.ticker) && h.name ? (
                  <>
                    <span className="h-identity-name">{h.name}</span>
                    <span className="h-identity-ticker">{h.ticker}</span>
                  </>
                ) : (
                  <>
                    <span className="h-identity-name">{h.ticker}</span>
                    {h.name && h.name !== h.ticker && (
                      <span className="h-identity-ticker" style={{ marginLeft: 8 }}>{h.name}</span>
                    )}
                  </>
                )}
              </div>

              {/* 3. Meta (수량 · 계좌) — sparkline은 별도 중앙 셀로 분리 */}
              <div className="h-meta" onClick={() => setChartTicker(h.ticker)}
                style={{ cursor: 'pointer' }}>
                <span>{privacyMode ? '•••주'
                  : `${h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}주`}</span>
                <span className="h-meta-divider" />
                <span>{ACC_LABELS[h.account]}</span>
              </div>

              {/* 3-2. Spark (중앙 배치) */}
              <div className="h-spark" onClick={() => setChartTicker(h.ticker)}
                style={{ cursor: 'pointer' }}>
                {priceData?.spark && (
                  <Sparkline values={priceData.spark} positive={up}
                    width={72} height={26} />
                )}
              </div>

              {/* 4. Value (평가액 또는 시세 — 큰 글자). 가격 미수신 시 chip 표시. */}
              <div className="h-value">
                {!hasLivePrice ? (
                  <span title="외부 시세 소스에서 가격을 받지 못했습니다 (한국 펀드/일부 ETF). 평균단가 기준."
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 7px', borderRadius: 2,
                      border: '1px dashed var(--m-text-tertiary)',
                      color: 'var(--m-text-tertiary)',
                      fontSize: 10, fontWeight: 700,
                      letterSpacing: '.04em', textTransform: 'uppercase',
                    }}>시세 없음</span>
                ) : viewMode === '평가액' ? (
                  <FlashPrice
                    value={curKrw}
                    fmt={v => mask(fmtVal(v))}
                    className="h-value-main"
                  />
                ) : (
                  <FlashPrice
                    value={cur}
                    fmt={v => v != null
                      ? mask(isUsd
                        ? (isUs ? `$${v.toFixed(2)}` : `$${(v / usdKrw).toFixed(2)}`)
                        : (isUs ? `$${v.toFixed(2)}` : `₩${Math.round(v).toLocaleString()}`))
                      : '—'}
                    className="h-value-main"
                  />
                )}
                {hasLivePrice && isStale && (
                  <div title="실시간 1·2차 소스 응답 없음 → 30분 내 마지막 정상값"
                    style={{
                      marginTop: 2, fontSize: 9, fontWeight: 700,
                      color: '#B45309', letterSpacing: '.04em',
                    }}>STALE</div>
                )}
              </div>

              {/* 5. PnL (손익 — 평가액 모드는 금액+%, 시세 모드는 평단+%). 가격 없으면 — 표기. */}
              <div className="h-pnl">
                {!hasLivePrice ? (
                  <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
                    수동 추정만 가능
                  </span>
                ) : viewMode === '평가액' ? (
                  <div className="h-pnl-row">
                    <FlashPrice
                      value={pnlKrw}
                      fmt={v => privacyMode ? mask(fmtVal(v)) : `${v >= 0 ? '+' : ''}${fmtVal(v)}`}
                      className={pnlKrw >= 0 ? 'm3-metric-value is-positive' : 'm3-metric-value is-negative'}
                    />
                    <FlashPrice
                      value={pnlPct}
                      fmt={v => privacyMode ? maskPct() : `${v >= 0 ? '+' : ''}${(v ?? 0).toFixed(2)}%`}
                      className={pnlPct >= 0 ? 'm3-metric-value is-positive' : 'm3-metric-value is-negative'}
                    />
                  </div>
                ) : (
                  <div className="h-pnl-row">
                    <span style={{ color: 'var(--m-text-tertiary)', fontWeight: 600 }}>
                      평단 {h.avg_price != null
                        ? mask(isUsd
                          ? (isUs ? `$${h.avg_price.toFixed(2)}` : `$${(h.avg_price / usdKrw).toFixed(2)}`)
                          : (isUs ? `$${h.avg_price.toFixed(2)}` : `₩${Math.round(h.avg_price).toLocaleString()}`))
                        : '—'}
                    </span>
                    <FlashPrice
                      value={chgPct}
                      fmt={v => privacyMode ? maskPct() : `${v >= 0 ? '+' : ''}${(v ?? 0).toFixed(2)}%`}
                      className={up ? 'm3-metric-value is-positive' : 'm3-metric-value is-negative'}
                    />
                  </div>
                )}
              </div>

              {/* 6. Actions — 수정(매수/매도 기록) + 메모. 차트는 row 자체 클릭 */}
              <div className="h-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditTicker(`${h.account}-${h.ticker}`)
                  }}
                  title="수정 · 매수/매도 거래 기록"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--m-outline-variant)',
                    color: 'var(--m-text-tertiary)',
                    width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}>
                  {/* sliders/settings 아이콘 — 메모(연필)와 명확히 구분 */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    width="13" height="13">
                    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                    <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
                    <line x1="17" y1="16" x2="23" y2="16"/>
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setNoteTicker({ ticker: h.ticker, name: h.name, isUs })
                  }}
                  title={notesByTicker[h.ticker] ? '메모 보기/편집' : '투자 노트 추가'}
                  style={{
                    background: notesByTicker[h.ticker] ? 'var(--m-primary-container)' : 'transparent',
                    border: '1px solid',
                    borderColor: notesByTicker[h.ticker] ? 'var(--m-primary)' : 'var(--m-outline-variant)',
                    color: notesByTicker[h.ticker] ? 'var(--m-primary)' : 'var(--m-text-tertiary)',
                    width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    width="12" height="12">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
            </motion.div>
          )
        })}
        </AnimatePresence>
        </motion.div>
      )}

      {/* 메모 시트 모달 */}
      {noteTicker && (
        <NoteSheet
          ticker={noteTicker.ticker}
          name={noteTicker.name}
          isUs={noteTicker.isUs}
          onClose={() => setNoteTicker(null)}
          onSaved={() => { refetchNotes(); setNoteTicker(null) }}
        />
      )}
    </div>
  )
}

// 계좌 라벨은 store.accounts (동적)에서 가져옴 — EditPanel 내부에서 useAccounts() 사용

function EditPanel({ holding, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({ ...holding })
  const { accounts: dynAccounts } = useAccounts()
  const accEntries = dynAccounts.map(a => [a.key, a.label])
  return (
    <div className="holding-edit-card">
      <div className="edit-title">{holding.ticker} 수정</div>

      {/* 계좌 선택 */}
      <div className="edit-field">
        <label className="edit-label">계좌</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {accEntries.map(([key, label]) => (
            <button key={key}
              onClick={() => setForm(p => ({ ...p, account: key }))}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid',
                borderColor: form.account === key ? '#0EA5E9' : '#E2E8F0',
                background: form.account === key ? 'var(--clr-info-bg)' : 'var(--clr-surface)',
                color: form.account === key ? 'var(--clr-info-dark)' : 'var(--clr-text-sub)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 나머지 필드 */}
      {[
        { label: '종목명', key: 'name', type: 'text' },
        { label: '수량', key: 'quantity', type: 'number' },
        { label: '평균 단가', key: 'avg_price', type: 'number' },
        { label: '섹터', key: 'sector', type: 'text' },
      ].map(f => (
        <div key={f.key} className="edit-field">
          <label className="edit-label">{f.label}</label>
          <input
            className="input"
            type={f.type}
            value={form[f.key] ?? ''}
            onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-primary" style={{ flex: 1 }} onClick={() => onSave(form)}>저장</button>
        <button className="btn-secondary" onClick={onCancel}>취소</button>
        <button className="btn-secondary" style={{ color: 'var(--clr-neg-dark)', borderColor: '#FCA5A5' }}
          onClick={onDelete}>삭제</button>
      </div>

      {/* 매수·매도 거래 기록 — 입력 시 보유 수량·평단이 FIFO로 자동 반영되고 전 탭에 연동됨 */}
      <div style={{ marginTop: 14, borderTop: '1px solid var(--m-outline-variant)', paddingTop: 8 }}>
        <TransactionsSection
          ticker={holding.ticker}
          name={holding.name || ''}
          isUs={!/^A?\d{6}$/.test(holding.ticker)}
        />
      </div>
    </div>
  )
}

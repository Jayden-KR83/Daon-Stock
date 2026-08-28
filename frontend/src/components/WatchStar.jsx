import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, addWatchlist, deleteWatchlist } from '../api'

/* ══════════════════════════════════════════════════════════════
   관심 종목 별표 — 어느 탭에서든 그 자리에서 담는다
   ══════════════════════════════════════════════════════════════
   2026-08-28 이전에는 관심 종목을 담으려면 반드시 '관심' 탭으로 가서 다시
   검색해야 했다. 종목 탭에서 방금 분석을 읽은 종목을, 발굴 탭에서 방금 찾은
   종목을, 시장 탭에서 눈에 띈 종목을 — 이름을 외웠다가 다른 탭에서 또 쳐야 했다.
   담고 싶은 순간과 담는 장소가 떨어져 있으면 사람은 그냥 안 담는다.

   그래서 목록·상세 어디에든 붙일 수 있는 별표 하나로 만든다.
   ⚠ 목록 행 안에 놓일 때가 많다 — 행 클릭(차트 이동)과 겹치지 않도록
     onClick 에서 stopPropagation 을 반드시 한다.
   ══════════════════════════════════════════════════════════════ */
export default function WatchStar({ ticker, name = '', exchange = '', qtype = '',
                                    size = 18, title }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'], queryFn: getPortfolio, staleTime: 60_000,
  })

  const tkr = String(ticker || '').trim()
  if (!tkr) return null

  const list = portfolio?.watchlist || []
  const on = list.some(w => String(w.ticker).toUpperCase() === tkr.toUpperCase())

  const toggle = async (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (on) await deleteWatchlist(tkr)
      else    await addWatchlist({ ticker: tkr, name, exchange, qtype })
      await qc.invalidateQueries({ queryKey: ['portfolio'] })
    } catch { /* 실패해도 화면은 그대로 — 다음 조회에서 실제 상태로 맞춰진다 */ }
    finally { setBusy(false) }
  }

  return (
    <button onClick={toggle} disabled={busy}
      className="tap-target"
      aria-pressed={on}
      aria-label={on ? `${name || tkr} 관심 해제` : `${name || tkr} 관심 추가`}
      title={title || (on ? '관심 목록에서 빼기' : '관심 목록에 담기')}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size + 6, height: size + 6, flexShrink: 0,
        background: 'transparent', border: 'none', padding: 0,
        cursor: busy ? 'default' : 'pointer',
        color: on ? '#F59E0B' : 'var(--clr-text-muted)',
        opacity: busy ? 0.45 : 1,
        transition: 'color .12s ease, transform .12s ease',
      }}>
      {/* 채운 별 / 빈 별 — 색만으로 구분하지 않는다(색약·흑백 대비) */}
      <svg viewBox="0 0 24 24" width={size} height={size}
        fill={on ? 'currentColor' : 'none'} stroke="currentColor"
        strokeWidth={on ? 1 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2.6 15.09 8.86 22 9.87 17 14.74 18.18 21.6 12 18.36 5.82 21.6 7 14.74 2 9.87 8.91 8.86 12 2.6" />
      </svg>
    </button>
  )
}

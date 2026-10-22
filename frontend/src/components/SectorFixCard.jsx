import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUnknownSectors, fixSector } from '../api'
import SectorSelect from './SectorSelect'

/**
 * 미분류 섹터 점검 — 정본에 없는 라벨을 쓰는 보유 종목을 드러내고 그 자리에서 고친다.
 *
 * 왜 필요한가: 모르는 라벨은 '기타'로 떨어진다. 배분 탭에는 '기타' 덩어리로만 보여서
 * **틀렸다는 사실 자체가 화면에 나타나지 않는다.** 서버에 unknown_labels() 가 있었지만
 * 부르는 곳이 없어 11일간 죽은 코드였다(2026-10-11 ~ 10-22).
 *
 * 0건이면 아무것도 그리지 않는다. 늘 떠 있는 '문제 없음' 카드는 자리만 먹고,
 * 몇 번 보고 나면 눈이 지나친다.
 */
export default function SectorFixCard() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['sectors-unknown'], queryFn: getUnknownSectors, staleTime: 60_000, retry: 0,
  })
  /* 고른 값은 티커+계좌로 기억한다. 같은 종목이 여러 계좌에 있을 수 있고,
     계좌마다 다른 섹터를 줄 이유는 없지만 **행 단위로 보이는 것**이 덜 헷갈린다. */
  const [picked, setPicked] = useState({})
  const [busy, setBusy]     = useState('')
  const [err, setErr]       = useState('')

  const items = data?.items || []
  if (!items.length) return null

  const key = (it) => `${it.account}:${it.ticker}`

  async function save(it) {
    const label = picked[key(it)] || it.suggestion
    if (!label) return
    setBusy(key(it)); setErr('')
    try {
      await fixSector({ ticker: it.ticker, sector: label, account: it.account })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['sectors-unknown'] }),
        qc.invalidateQueries({ queryKey: ['portfolio'] }),
      ])
    } catch (e) {
      setErr(e?.response?.data?.detail || '저장하지 못했습니다')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="section-title" style={{ marginBottom: 2 }}>
        미분류 섹터 {items.length}건
      </div>
      <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)',
        lineHeight: 1.5, marginBottom: 10 }}>
        정본에 없는 라벨이라 배분 탭에서 <strong>기타</strong>로 묶이고 있습니다.
        데이터 소스가 준 영어 업종은 종목마다 맞는 분류가 달라 자동으로 고치지 않습니다
        — 직접 고르세요.
      </div>

      {err && (
        <div style={{ fontSize: 11, color: 'var(--clr-neg)', marginBottom: 8 }}>{err}</div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(it => {
          const k = key(it)
          const val = picked[k] ?? it.suggestion ?? ''
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto',
              alignItems: 'center', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{it.ticker}</div>
                <div style={{ fontSize: 10, color: 'var(--clr-text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.sector || '(빈칸)'}
                </div>
              </div>
              <SectorSelect value={val}
                onChange={v => setPicked(p => ({ ...p, [k]: v }))}
                style={{ width: '100%' }} />
              <button className="btn-primary" disabled={!val || busy === k}
                onClick={() => save(it)} style={{ whiteSpace: 'nowrap' }}>
                {busy === k ? '저장중' : '반영'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

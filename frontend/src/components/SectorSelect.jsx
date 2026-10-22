import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSectors } from '../api'

/**
 * 섹터 선택 — 중분류를 대분류로 묶어 고르게 한다.
 *
 * 자유 입력을 쓰지 않는 이유: '반도체'와 '반도체 '와 '반도체(AI)' 가 각각 생긴다.
 * 실제로 그렇게 쌓여서 보유 52건이 라벨 31종으로 쪼개졌다(2026-10-11).
 * 목록은 서버(backend/sectors.py)가 주는 것만 쓴다 — 여기에 다시 적지 않는다.
 *
 * 다만 **기존 값은 지우지 않는다.** 목록에 없는 라벨(과거 데이터·구 라벨)이 들어오면
 * 맨 위에 그대로 띄운다. 고르지 않았는데 값이 바뀌는 일이 없어야 한다.
 */
export default function SectorSelect({ value, onChange, style, ...rest }) {
  const { data } = useQuery({
    queryKey: ['sectors'], queryFn: getSectors, staleTime: 60 * 60_000,
  })
  const cur = String(value || '').trim()
  const known = React.useMemo(() => {
    const s = new Set()
    for (const list of Object.values(data?.by_group || {})) list.forEach(l => s.add(l))
    return s
  }, [data])

  return (
    <select value={cur} onChange={e => onChange(e.target.value)}
      style={{ minWidth: 0, fontFamily: 'inherit', ...style }} {...rest}>
      <option value="">— 섹터 선택 —</option>
      {cur && !known.has(cur) && (
        <option value={cur}>{cur} (기존 값)</option>
      )}
      {(data?.groups || []).map(g => {
        const labels = data?.by_group?.[g] || []
        if (!labels.length) return null
        return (
          <optgroup key={g} label={g}>
            {labels.map(l => <option key={l} value={l}>{l}</option>)}
          </optgroup>
        )
      })}
    </select>
  )
}

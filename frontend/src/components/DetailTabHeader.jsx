import React from 'react'
import { useStore } from '../store'
import { isDetailTab } from './BottomNav'

/**
 * 하단 바에 없는 화면(분석·종목·등록·가이드) 위에 붙는 '어디서 왔는지' 줄.
 *
 * 2026-11-03 네비 재편에서 네 화면을 하단 바에서 뺐다. 하단 바는 늘 보이니
 * **길이 막히지는 않는다.** 다만 활성 탭이 하나도 없는 상태가 되어
 * "내가 어디 있지"가 사라진다 — 그래서 자리를 한 줄로 말해 준다.
 *
 * 모션은 쓰지 않는다(design.md R7 — 상태 변화를 설명할 때만).
 */
const PARENT = {
  2: { from: 0, fromLabel: '계좌', label: '보유 종목 종합 분석' },
  3: { from: 0, fromLabel: '계좌', label: '종목 상세' },
  5: { from: 6, fromLabel: '설정', label: '종목 등록' },
  7: { from: 0, fromLabel: '계좌', label: '사용 가이드' },
}

export default function DetailTabHeader() {
  const activeTab = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  if (!isDetailTab(activeTab)) return null
  const meta = PARENT[activeTab]
  if (!meta) return null

  return (
    <div
      /* 검사기가 '지금 어느 화면인가'를 추측하지 않고 읽을 표식.
         본문 글자로 판정하려 했더니 가이드 페이지에 '종목 등록'이 적혀 있어
         등록 화면으로 오판했다(2026-11-03 검사기 오류). */
      data-detail-tab={meta.label}
      style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', marginBottom: 2,
      borderBottom: '1px solid var(--clr-border)',
      background: 'var(--clr-surface)',
    }}>
      <button
        onClick={() => setActiveTab(meta.from)}
        aria-label={`${meta.fromLabel}(으)로 돌아가기`}
        className="tap-target"
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--clr-accent)', fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 800, padding: '2px 4px',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>‹</span>
        {meta.fromLabel}
      </button>
      <span style={{ color: 'var(--clr-text-muted)', fontSize: 12 }}>·</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--clr-text-strong)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meta.label}
      </span>
    </div>
  )
}

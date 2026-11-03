import React from 'react'
import { useStore } from '../store'

/**
 * 가이드 여는 책 버튼 (2026-11-03 오너 안: "책 모양을 화면 구석에").
 *
 * 가이드는 하단 바 한 칸을 쓸 만큼 자주 보는 화면이 아니다. 그렇다고 없애면
 * 처음 쓰는 사람이 길을 잃는다 — 그래서 **구석에 둔다**.
 *
 * 두 가지를 조심했다.
 *  · 이모지(📖)를 쓰지 않는다 — 기능 아이콘은 선 아이콘으로(design.md).
 *    OS 마다 다르게 그려지고, 오너가 "클로드가 만든 티"라고 지적한 패턴이다.
 *  · 이미 우하단에 '한마디'(FeedbackButton)가 있다. 겹치지 않게 그 **위**에 둔다.
 *  · 가이드 화면에서는 숨는다 — 자기를 여는 버튼이 자기 위에 떠 있을 이유가 없다.
 */
export default function GuideFab() {
  const activeTab = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)
  if (activeTab === 7) return null

  return (
    <button
      onClick={() => setActiveTab(7)}
      aria-label="사용 가이드 열기"
      title="사용 가이드"
      style={{
        position: 'fixed', right: 14,
        /* 하단바(≈64) + 한마디 버튼(≈44) + 여백 — 겹치지 않게 그 위로 */
        bottom: 'calc(var(--tap-safe-bottom, 0px) + 124px)',
        width: 40, height: 40, borderRadius: 4,
        border: '1px solid var(--clr-border-md)',
        background: 'var(--clr-surface)',
        color: 'var(--clr-text-sub)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', zIndex: 40,
        boxShadow: '0 1px 4px rgba(0,0,0,.08)',
      }}>
      {/* 펼친 책 — 선 아이콘(stroke 1.8), 앱의 다른 아이콘과 같은 규격 */}
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
        stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    </button>
  )
}

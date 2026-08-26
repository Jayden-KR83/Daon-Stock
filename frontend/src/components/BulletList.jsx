import React from 'react'

/* ══════════════════════════════════════════════════════════════
   문장 머릿글 — 앱 전체에서 이것 하나만 쓴다
   ══════════════════════════════════════════════════════════════
   2026-08-27 이전에는 리포트마다 머릿글이 제각각이었다.

     분석 탭   : 5px 회색 네모 (BulletList)
     종목 분석 : 대시(–) 또는 아예 없음(줄글 <p>)

   같은 AI 리포트인데 탭을 옮기면 글의 생김새가 바뀌어, 어디까지가 한 항목인지
   눈으로 구분이 안 됐다. 그래서 머릿글 체계를 이 파일 하나로 모은다.

   ── 왜 '작은 회색 네모'인가 ──
   ● 원형 점은 design.md 의 직사각형 원칙과 어긋난다.
   – 대시는 마이너스 부호(-3.2%)와 헷갈린다. 금융 화면에서는 특히 위험하다.
   ■ 작은 회색 네모는 글자 크기와 무관하게 균일하고, 숫자 기호와 겹치지 않으며,
     전문 자산관리 보고서의 관례에도 맞는다.

   ⚠ 머릿글을 새로 정의하지 말 것. 색·크기를 바꾸고 싶으면 여기서 바꾼다.
   ══════════════════════════════════════════════════════════════ */

/* 한글 문장을 마침표 기준으로 잘라 항목 배열로 만든다. 1문장이면 1개.
   길이 4자 이하는 버린다 — '음.' 같은 조각이 항목으로 서면 더 어지럽다. */
export function splitToSentences(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .split(/(?<=[.。!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 4)
}

export default function BulletList({
  items = [],
  color = 'var(--clr-text)',
  bulletColor = 'var(--clr-text-tertiary)',
  small = false,
  gap = 7,
  /* 항목 텍스트를 다르게 그리고 싶을 때(예: AI 본문의 **강조**·숫자 색상).
     넘기지 않으면 그냥 문자열로 그린다. */
  renderItem = null,
}) {
  if (!items || items.length === 0) return null
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((s, i) => (
        <li key={i} className="ko-keep" style={{
          position: 'relative', paddingLeft: 15,
          marginBottom: i < items.length - 1 ? gap : 0,
          fontSize: small ? 12 : 13, color, lineHeight: 1.7,
        }}>
          <span aria-hidden="true" style={{
            position: 'absolute', left: 0, top: '0.6em',
            width: 5, height: 5, borderRadius: 0,
            background: bulletColor, opacity: 0.9,
          }} />
          {renderItem ? renderItem(s, i) : s}
        </li>
      ))}
    </ul>
  )
}

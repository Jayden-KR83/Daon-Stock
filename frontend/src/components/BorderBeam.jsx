import React from 'react'
import './BorderBeam.css'

/**
 * Magic UI 풍 BorderBeam — 부모(position:relative + overflow:hidden) 내부에서
 * 카드 테두리를 따라 회전하는 빛띠.
 *
 * props:
 *   size      - 빛띠 한 변 길이 (px)  기본 220
 *   duration  - 한 바퀴 시간 (s)      기본 9
 *   borderWidth - 테두리 두께 (px)    기본 1.5
 *   colorFrom / colorTo - 그라디언트 색상 (CSS 색)
 *   delay     - 시작 지연 (s)         기본 0
 */
export default function BorderBeam({
  size = 220,
  duration = 9,
  borderWidth = 1.5,
  colorFrom = 'var(--clr-info, #0EA5E9)',
  colorTo   = 'var(--clr-ai,   #6366F1)',
  delay = 0,
}) {
  return (
    <div
      aria-hidden="true"
      className="bb-wrap"
      style={{
        '--bb-size':     `${size}px`,
        '--bb-duration': `${duration}s`,
        '--bb-border':   `${borderWidth}px`,
        '--bb-from':     colorFrom,
        '--bb-to':       colorTo,
        '--bb-delay':    `${delay}s`,
      }}
    />
  )
}

import React from 'react'
import './ShimmerButton.css'

/**
 * Shimmer Button — Magic UI 풍 광택이 흐르는 버튼.
 * AI 분석 시작·전략 분석 같은 핵심 CTA 강조용.
 *
 * props:
 *   children     — 버튼 내용 (텍스트/아이콘)
 *   onClick      — 클릭 핸들러
 *   disabled
 *   variant      — 'primary' (gradient) | 'ai' (indigo→purple)
 *   shimmerColor — 흐르는 광택 색 (default: rgba(255,255,255,.5))
 *   ...rest      — button props
 */
export default function ShimmerButton({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  shimmerColor = 'rgba(255,255,255,.5)',
  style = {},
  ...rest
}) {
  const bg = variant === 'ai'
    ? 'linear-gradient(135deg, var(--clr-info) 0%, var(--clr-ai) 100%)'
    : variant === 'primary'
      ? 'linear-gradient(135deg, var(--clr-info-dark) 0%, var(--clr-info) 100%)'
      : variant === 'pos'
        ? 'linear-gradient(135deg, var(--clr-pos-dark) 0%, var(--clr-pos) 100%)'
        : variant

  return (
    <button
      className={`shimmer-btn ${disabled ? 'shimmer-disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg,
        ['--shimmer-color']: shimmerColor,
        ...style,
      }}
      {...rest}
    >
      <span className="shimmer-btn-content">{children}</span>
      <span aria-hidden="true" className="shimmer-btn-overlay" />
    </button>
  )
}

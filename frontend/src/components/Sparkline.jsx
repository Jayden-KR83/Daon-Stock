import React from 'react'

export default function Sparkline({ values = [], width = 72, height = 22, positive = true }) {
  if (!values || values.length < 2) return <svg width={width} height={height} />
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const rng = mx - mn < 1e-6 ? 1 : mx - mn
  const color = positive ? '#16A34A' : '#DC2626'
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1) * width).toFixed(1)},${((1 - (v - mn) / rng) * height).toFixed(1)}`
  ).join(' L ')
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={`M ${pts}`} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

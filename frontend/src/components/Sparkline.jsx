import React from 'react'

/* 목록용 초소형 추이선.
 *
 * 2026-08-28: 선만 있으면 오르는 중인지 내리는 중인지 알 수 없다는 지적.
 * 색으로만 구분하니 색약·흑백 인쇄·작은 화면에서 특히 약하다.
 * → 직전 정규장 종가에 회색 점선을 그어 기준을 만든다.
 *   선이 점선 위에 있으면 상승, 아래면 하락 — 숫자를 읽지 않아도 방향이 보인다.
 *
 * baseline 이 표시 구간(min~max) 밖이면 그리지 않는다. 가장자리에 붙은 선은
 * 기준선이 아니라 테두리처럼 보여서 오히려 방향을 헷갈리게 한다.
 */
export default function Sparkline({ values = [], width = 72, height = 22,
                                    positive = true, baseline = null }) {
  if (!values || values.length < 2) return <svg width={width} height={height} />
  const mn0 = Math.min(...values)
  const mx0 = Math.max(...values)
  // 기준선이 구간 안에 들어오도록 범위를 넓힌다 — 넓히지 않으면 잘려 안 보인다
  const hasBase = typeof baseline === 'number' && isFinite(baseline)
  const mn = hasBase ? Math.min(mn0, baseline) : mn0
  const mx = hasBase ? Math.max(mx0, baseline) : mx0
  const rng = mx - mn < 1e-6 ? 1 : mx - mn
  const y = v => ((1 - (v - mn) / rng) * (height - 2) + 1).toFixed(1)
  const color = positive ? '#16A34A' : '#DC2626'
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1) * width).toFixed(1)},${y(v)}`
  ).join(' L ')
  return (
    <svg width={width} height={height} style={{ display: 'block' }}
      role="img" aria-label={positive ? '상승 추이' : '하락 추이'}>
      {hasBase && (
        <line x1="0" x2={width} y1={y(baseline)} y2={y(baseline)}
          stroke="var(--clr-text-muted)" strokeWidth="1"
          strokeDasharray="2 2" opacity="0.55" />
      )}
      <path d={`M ${pts}`} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

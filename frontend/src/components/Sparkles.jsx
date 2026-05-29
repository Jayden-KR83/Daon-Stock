import React, { useEffect, useState, useRef } from 'react'

/**
 * Sparkles — Magic UI 풍 반짝임 효과.
 * 부모(position:relative) 내부에서 SVG 별이 무작위 위치에 깜빡거림.
 * 큰 양수 수익률 강조 등 시각적 보상에 사용.
 *
 * props:
 *   count       — 동시에 보이는 별 개수 (default 5)
 *   colors      — 별 색상 배열
 *   minSize/maxSize — 별 크기 (px)
 *   active      — true면 표시, false면 숨김 (수익 → 손실 전환 시)
 */
export default function Sparkles({
  count = 5,
  colors = ['#FBBF24', '#FCD34D', '#FEF08A'],
  minSize = 5,
  maxSize = 11,
  active = true,
}) {
  const [stars, setStars] = useState([])
  const idxRef = useRef(0)

  useEffect(() => {
    if (!active) { setStars([]); return }
    const spawn = () => {
      idxRef.current += 1
      const id = idxRef.current
      const size = minSize + Math.random() * (maxSize - minSize)
      setStars(prev => [
        ...prev,
        {
          id,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.4,
          duration: 0.9 + Math.random() * 0.5,
        }
      ].slice(-count))
      // 1.4s 후 자동 제거 (animation duration 후)
      setTimeout(() => {
        setStars(prev => prev.filter(s => s.id !== id))
      }, 1500)
    }
    // 초기 즉시 + 주기적 spawn
    spawn()
    const interval = setInterval(spawn, 600)
    return () => clearInterval(interval)
  }, [active, count, minSize, maxSize])

  if (!active) return null
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
    }}>
      {stars.map(s => (
        <SparkleIcon key={s.id} x={s.x} y={s.y} size={s.size}
          color={s.color} delay={s.delay} duration={s.duration} />
      ))}
      <style>{`
        @keyframes sparkle-fade {
          0%   { opacity: 0; transform: scale(0) rotate(0deg); }
          50%  { opacity: 1; transform: scale(1) rotate(180deg); }
          100% { opacity: 0; transform: scale(0) rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sparkle-icon { animation: none !important; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function SparkleIcon({ x, y, size, color, delay, duration }) {
  return (
    <svg
      className="sparkle-icon"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        animation: `sparkle-fade ${duration}s ease-out ${delay}s forwards`,
        filter: `drop-shadow(0 0 3px ${color})`,
      }}
    >
      <path d="M10 0 L11.5 8.5 L20 10 L11.5 11.5 L10 20 L8.5 11.5 L0 10 L8.5 8.5 Z"
        fill={color} />
    </svg>
  )
}

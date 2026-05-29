import React, { useState } from 'react'

const BADGE_COLORS = [
  '#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#14B8A6','#F97316','#0EA5E9','#84CC16','#6366F1'
]

function hashColor(str) {
  return BADGE_COLORS[str.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % BADGE_COLORS.length]
}

function isKr(ticker) {
  return /^A?\d{6}$/.test(String(ticker))
}

/* 'A005930' → '005930' 6자리만 추출 */
function krCode(ticker) {
  const m = String(ticker).match(/(\d{6})/)
  return m ? m[1] : null
}

export default function LogoCircle({ ticker, size = 42 }) {
  const t = String(ticker).toUpperCase()
  const color = hashColor(t)
  const [imgFailed, setImgFailed] = useState(false)
  const [bgColor, setBgColor] = useState('transparent')

  const s2 = size - 6

  /* ── 한국 종목: Toss → Alphasquare → 색상 배지 ── */
  if (isKr(t)) {
    const code = krCode(t)
    if (!code || imgFailed) {
      return (
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: color, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 9, fontWeight: 800,
          color: '#fff', flexShrink: 0, letterSpacing: '-.02em'
        }}>
          {code || t}
        </div>
      )
    }
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: bgColor, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, position: 'relative', overflow: 'hidden'
      }}>
        <img
          src={`https://static.toss.im/png-icons/securities/icn-sec-fill-${code}.png`}
          width={s2} height={s2}
          style={{
            objectFit: 'contain', borderRadius: '50%',
            background: 'rgba(255,255,255,0.92)', padding: 2, position: 'absolute',
          }}
          onError={(e) => {
            const alpha = `https://file.alphasquare.co.kr/media/images/stock_logo/kr/${code}.png`
            if (e.target.src !== alpha) {
              e.target.src = alpha
            } else {
              setImgFailed(true)
              setBgColor(color)
            }
          }}
          alt={code}
        />
      </div>
    )
  }

  /* ── 미국 종목: parqet → google favicon → 미국기 이모지 ── */
  const src1 = `https://assets.parqet.com/logos/symbol/${t}?format=jpg`

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bgColor, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, position: 'relative', overflow: 'hidden'
    }}>
      {imgFailed && (
        <span style={{ fontSize: 18, position: 'absolute', lineHeight: 1 }}>🇺🇸</span>
      )}
      {!imgFailed && (
        <img
          src={src1}
          width={s2} height={s2}
          style={{ objectFit: 'contain', borderRadius: '50%',
            background: 'rgba(255,255,255,0.88)', padding: 2, position: 'absolute' }}
          onError={(e) => {
            const src2 = `https://www.google.com/s2/favicons?domain=${t.toLowerCase()}.com&sz=64`
            if (e.target.src !== src2) {
              e.target.src = src2
            } else {
              setImgFailed(true)
              setBgColor(color)
            }
          }}
          alt={t}
        />
      )}
    </div>
  )
}

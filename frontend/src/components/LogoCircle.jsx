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

/* 로고 이미지는 제공처(Toss·parqet)에서 이미 자기 배경을 갖고 온다
   (예: AAPL = 검정 바탕 흰 사과, alpha 없음).
   과거엔 그 위에 rgba(255,255,255,.9) 배경 + padding 2를 줬는데, 로고가 2px 안으로
   밀려 그 틈으로 흰 바탕이 드러나 다크모드에서 '흰 테두리 원'으로 보였다.
   → 배경·패딩 제거 + objectFit:cover 로 원을 꽉 채운다. */
export default function LogoCircle({ ticker, size = 42 }) {
  const t = String(ticker).toUpperCase()
  const color = hashColor(t)
  const [imgFailed, setImgFailed] = useState(false)
  const [bgColor, setBgColor] = useState('transparent')

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
          width={size} height={size}
          style={{
            objectFit: 'cover', borderRadius: '50%', position: 'absolute',
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
          width={size} height={size}
          style={{ objectFit: 'cover', borderRadius: '50%', position: 'absolute' }}
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

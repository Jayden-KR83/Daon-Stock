import React from 'react'

/* ══════════════════════════════════════════════════════════════
   프리마켓 / 애프터마켓 표시
   ══════════════════════════════════════════════════════════════
   2026-08-28: 프리장에 앱을 열었더니 NVDA 가 +8.7% 로 떠 있었다. 그 숫자는
   '어제 정규장' 의 변동률이었다. 숫자 자체는 맞지만 지금 보는 사람에게는
   틀린 정보다 — 실제 프리장 등락은 +0.02% 였다.

   그래서 정규장 밖에서는 두 가지를 반드시 같이 보여준다.
     ① 큰 숫자가 '언제 것' 인지 (정규장 종가)
     ② 지금 실제로 얼마에 거래되는지 (프리/애프터 체결가와 등락률)

   ⚠ 평가액·손익은 계속 정규장 종가로 계산한다. 확장시간은 거래가 얇아
     호가가 크게 튄다 — 총자산이 새벽에 출렁이면 쓸 수 없는 숫자가 된다.
     여기 표시는 '참고' 이고, 그래서 색을 절제해서 쓴다.
   ══════════════════════════════════════════════════════════════ */

const LABEL = { pre: '프리마켓', post: '애프터마켓' }

/* 확장시간 체결 시각 — 미 동부 기준으로 적는다(사용자가 장 시간을 그 기준으로 본다) */
function etTime(epochSec) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(epochSec * 1000)) + ' ET'
  } catch { return '' }
}

/** 한 줄짜리 상세 표시 — 종목 상세 화면용 */
export function SessionLine({ ext, fmt }) {
  if (!ext || ext.price == null) return null
  const up = (ext.change_pct ?? 0) >= 0
  const color = up ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)'
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
        padding: '2px 6px', borderRadius: 2, color: 'var(--clr-text-sub)',
        border: '1px solid var(--clr-border-md)' }}>
        {LABEL[ext.session] || '시간외'}
      </span>
      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--clr-text-strong)' }}>
        {fmt ? fmt(ext.price) : ext.price}
      </span>
      <span style={{ fontSize: 13, fontWeight: 800, color }}>
        {up ? '+' : ''}{(ext.change_pct ?? 0).toFixed(2)}%
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--clr-text-muted)' }}>
        정규장 종가 대비 · {etTime(ext.at)}
      </span>
    </div>
  )
}

/** 목록 행에 붙이는 아주 작은 칩 — 보유·관심 목록용 */
export function SessionChip({ ext }) {
  if (!ext || ext.change_pct == null) return null
  const up = (ext.change_pct ?? 0) >= 0
  return (
    <span title={`${LABEL[ext.session] || '시간외'} ${up ? '+' : ''}${ext.change_pct.toFixed(2)}% · 정규장 종가 대비`}
      style={{ fontSize: 9, fontWeight: 800, padding: '0 4px', borderRadius: 2,
        lineHeight: 1.6, whiteSpace: 'nowrap', cursor: 'help',
        color: up ? 'var(--clr-pos-dark)' : 'var(--clr-neg-dark)',
        border: `1px solid ${up ? 'var(--clr-pos-border)' : 'var(--clr-neg-border)'}` }}>
      {ext.session === 'post' ? '애프터' : '프리'} {up ? '+' : ''}{ext.change_pct.toFixed(1)}%
    </span>
  )
}

/** 큰 숫자가 언제 기준인지 알려주는 라벨 — 정규장 밖에서만 뜬다 */
export function RegularCloseNote({ session }) {
  if (session !== 'pre' && session !== 'post') return null
  return (
    <span style={{ fontSize: 10.5, color: 'var(--clr-text-muted)', fontWeight: 600 }}>
      정규장 종가 기준
    </span>
  )
}

export default SessionLine

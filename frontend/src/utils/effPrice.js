/** 평가용 단가(현지통화) 결정 — 한 곳에 통일.
 *  우선순위: 라이브 시세 → 사용자 수동 기준가(manual_price) → 평균 단가.
 *  한국 비상장 펀드처럼 외부 시세가 없는 종목을 최소한 "참고가"로 평가하기 위함.
 *  반환값은 항상 종목 통화 기준(환산 전). */
export const UNLISTED_FUND = 'UNLISTED_FUND'
export const CRYPTO = 'CRYPTO'

/** 암호화폐인가 — 'BTC-USD' 형태 또는 asset_type=CRYPTO.
 *  수량 단위가 '주'가 아니라 '개'이고, PER 같은 기업 지표가 없다. */
export function isCrypto(h) {
  if (String(h?.asset_type || '').toUpperCase() === CRYPTO) return true
  return /^[A-Z]{2,6}-USD$/.test(String(h?.ticker || '').toUpperCase())
}

/** 수량 뒤에 붙는 단위. 암호화폐는 소수점 보유가 흔해 '개'로 표기한다. */
export function qtyUnit(h) {
  return isCrypto(h) ? '개' : '주'
}

/** 비상장 공모펀드인가 — 거래소 시세가 없어 실시간 조회 대상이 아니다. */
export function isUnlistedFund(h) {
  return String(h?.asset_type || '').toUpperCase() === UNLISTED_FUND
}

/** 시세를 조회할 티커만 추린다. 비상장 펀드를 빼면 죽은 조회가 사라진다. */
export function priceableTickers(holdings) {
  return [...new Set((holdings || [])
    .filter(h => !isUnlistedFund(h))
    .map(h => h?.ticker)
    .filter(Boolean))]
}

export function effPrice(h, prices) {
  // 비상장 펀드: 기준가(nav) → 수동 참고가 → 평단. 라이브 시세는 애초에 없다.
  if (isUnlistedFund(h)) {
    const nav = Number(h?.nav)
    if (nav > 0) return nav
    const m = Number(h?.manual_price) || 0
    return m > 0 ? m : (Number(h?.avg_price) || 0)
  }
  const live = prices?.[h?.ticker]?.current_price
  if (typeof live === 'number' && !isNaN(live)) return live
  const manual = Number(h?.manual_price) || 0
  if (manual > 0) return manual
  return Number(h?.avg_price) || 0
}

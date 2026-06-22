/** 평가용 단가(현지통화) 결정 — 한 곳에 통일.
 *  우선순위: 라이브 시세 → 사용자 수동 기준가(manual_price) → 평균 단가.
 *  한국 비상장 펀드처럼 외부 시세가 없는 종목을 최소한 "참고가"로 평가하기 위함.
 *  반환값은 항상 종목 통화 기준(환산 전). */
export function effPrice(h, prices) {
  const live = prices?.[h?.ticker]?.current_price
  if (typeof live === 'number' && !isNaN(live)) return live
  const manual = Number(h?.manual_price) || 0
  if (manual > 0) return manual
  return Number(h?.avg_price) || 0
}

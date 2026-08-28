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
  /* 정규장 밖이면 확장시간(프리/애프터) 체결가를 쓴다.
     안 그러면 프리장 내내 '어제 종가' 가 박혀 있어 화면이 멈춘 것처럼 보이고,
     등락률도 어제 것이 오늘 값처럼 읽힌다(2026-08-28 NVDA +8.7% 오해).
     ⚠ 확장시간은 거래가 얇아 호가가 튄다 — 그래서 화면에는 반드시 '프리/애프터'
       라벨을 같이 띄운다(components/SessionBadge.jsx). */
  const p = prices?.[h?.ticker]
  const ext = p?.ext?.price
  if (typeof ext === 'number' && !isNaN(ext)) return ext
  const live = p?.current_price
  if (typeof live === 'number' && !isNaN(live)) return live
  const manual = Number(h?.manual_price) || 0
  if (manual > 0) return manual
  return Number(h?.avg_price) || 0
}

/** 지금 화면에 보여줄 등락률 + 그 기준 라벨.
 *
 *  왜 필요한가: 일봉의 마지막 값은 정규장 밖에서 '어제' 다. 그대로 쓰면
 *  프리장에 어제 등락률(+8.7%)이 오늘 수치처럼 보인다. 세션에 맞는 값을 고르고,
 *  무엇 대비인지 라벨을 항상 함께 돌려준다 — 라벨 없는 숫자가 오해의 출발점이다.
 *
 *  반환: { pct, label, session }  (label 이 null 이면 평소의 일간 등락률)
 */
export function sessionChange(p) {
  if (!p) return { pct: 0, label: null, session: 'closed' }
  const session = p.session || 'regular'
  if (p.ext && typeof p.ext.change_pct === 'number') {
    return {
      pct: p.ext.change_pct,
      label: p.ext.session === 'post' ? '애프터' : '프리',
      session,
    }
  }
  return { pct: Number(p.change_pct) || 0, label: null, session }
}

/** 기준선으로 쓸 '직전 정규장 종가'.
 *
 *  백엔드를 건드리지 않고 정확히 얻는다:
 *   · 확장시간이면 ext.change_pct 의 기준이 곧 current_price(직전 정규장 종가)다.
 *   · 정규장이면 현재가와 등락률에서 역산한다 — cur / (1 + pct/100).
 *  스파크라인의 회색 점선이 이 값에 놓이면, 선이 그 위에 있으면 상승·아래면 하락으로
 *  한눈에 읽힌다(숫자를 읽지 않아도 방향을 안다).
 */
export function prevClose(p) {
  if (!p) return null
  if (p.ext && typeof p.current_price === 'number') return p.current_price
  const cur = Number(p.current_price)
  const pct = Number(p.change_pct)
  if (!isFinite(cur) || !isFinite(pct) || pct <= -100) return null
  return cur / (1 + pct / 100)
}

/**
 * 종목을 사용자가 알아보기 쉽게 표시합니다.
 * - 한국 종목: "현대차" 처럼 한글명 우선, 없으면 "005380"
 * - 미국 종목: "AAPL" 티커 그대로
 */
// KRX 단축코드는 6자리. 전통적으로 숫자 6자리(005930)지만 최근 상장 종목은
// 영숫자 혼합(0131V0 = 1Q 미국우주항공테크)도 쓴다.
// '첫 글자가 숫자'가 판별자 — 미국 티커는 숫자로 시작하지 않는다.
export function isKrTicker(ticker) {
  return /^A?\d[0-9A-Z]{5}$/.test(String(ticker || '').toUpperCase())
}

export function displayName(ticker, name) {
  if (!ticker) return name || ''
  if (isKrTicker(ticker)) {
    return (name && String(name).trim()) ? name : ticker
  }
  return ticker
}

/**
 * 차트 탭 헤더 등에서 "현대차 (005380)" 형태로 코드까지 같이 보여주고 싶을 때.
 */
export function displayNameWithCode(ticker, name) {
  if (!ticker) return name || ''
  if (isKrTicker(ticker) && name && String(name).trim() && name !== ticker) {
    return `${name} (${ticker})`
  }
  return ticker
}

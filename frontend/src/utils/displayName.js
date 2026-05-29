/**
 * 종목을 사용자가 알아보기 쉽게 표시합니다.
 * - 한국 종목: "현대차" 처럼 한글명 우선, 없으면 "005380"
 * - 미국 종목: "AAPL" 티커 그대로
 */
export function isKrTicker(ticker) {
  return /^A?\d{6}$/.test(String(ticker || ''))
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

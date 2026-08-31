/* ══════════════════════════════════════════════════════════════
   가림(privacy) 모드 공통 마스킹
   ══════════════════════════════════════════════════════════════
   2026-08-26 개인 자산 노출 사고의 직접 원인이 여기다.

   가림 모드는 원래 '포트폴리오 탭의 히어로 카드'에만 걸려 있었다. 그래서 오너가
   가림을 켜고 화면을 공유해도, 분석 탭으로 넘어가는 순간 AI 리포트 본문·자산 추이
   차트 축·계좌별 예수금에 실제 금액이 그대로 찍혔다. 화면에는 '가림' 이라고
   표시돼 있으니 안전하다고 믿고 발표하게 된다 — 그게 더 위험하다.

   그래서 규칙을 하나로 만든다:

     🟥 개인 금액을 화면에 찍는 모든 자리는 이 파일의 함수를 거친다.

   새 카드를 만들 때 금액을 직접 toLocaleString() 해서 붙이지 말 것.
   `usePrivacy()` 의 won/eok/text 를 쓰면 가림 상태가 자동으로 반영된다.

   ── 무엇을 가리고 무엇을 남기나 ──
   가린다  : 금액(₩, $), 억/만 단위 규모, 주식 수량
   남긴다  : 퍼센트(+12.3%), 종목명, 날짜, 개수(3종목)
   퍼센트는 절대 규모를 드러내지 않으면서 '무슨 이야기를 하는 화면인지'는
   알 수 있게 해준다. 전부 가리면 발표 자체가 불가능해진다.
   ══════════════════════════════════════════════════════════════ */
import { useStore } from '../store'

export const MASK_WON  = '₩•••••••'
export const MASK_USD  = '$•••••'
export const MASK_PLAIN = '•••••'

/* 문장 속 금액만 골라 가린다 (AI 리포트 본문처럼 우리가 포맷하지 않은 텍스트용).
   퍼센트는 건드리지 않는다. */
const TEXT_PATTERNS = [
  // ₩1,234,567 / ₩ 1,234,567
  [/₩\s?\d[\d,]*(\.\d+)?/g, MASK_WON],
  // $1,234.56 (소액 주가도 규모를 드러내므로 같이 가린다)
  [/\$\s?\d[\d,]*(\.\d+)?/g, MASK_USD],
  /* 한국어 단위 표기 — AI 본문은 '6천만원' '27만원' '3.2억' 처럼 쓴다.
     조/억/천만/백만/만 을 한 번에 잡는다. 긴 단위를 먼저 두지 않으면
     '천만' 의 '만' 만 잡혀 '6천••' 처럼 반쯤 남는다. */
  [/\d[\d,]*(\.\d+)?\s?(조|억|천만|백만|만)\s?원?/g, '••'],
  /* 복합 표기의 꼬리 — '6,148만 4천원' 은 위 규칙이 앞쪽만 먹어 '••4천원' 이 남는다.
     남은 '4천원' 도 지운다. AI 본문은 이런 한국식 복합 단위를 자주 쓴다
     (2026-08-28 채팅 검증에서 실제로 반쯤 남는 것을 확인). */
  [/•+\s?\d[\d,]*(\.\d+)?\s?(천|백|십)?\s?원/g, '••원'],
  [/\d[\d,]*(\.\d+)?\s?(천|백|십)\s?원/g, '••원'],
  // '총자산 618,010,693 원' 처럼 기호 없이 원이 뒤에 붙는 경우
  [/\d{1,3}(,\d{3})+\s?원/g, '•••••••원'],
  // 기호도 단위도 없이 쉼표만 찍힌 7자리 이상 숫자 (618,010,693)
  [/\d{1,3}(,\d{3}){2,}/g, '•••••••'],
]

export function maskText(s, on) {
  if (!on || !s) return s
  let out = String(s)
  for (const [re, rep] of TEXT_PATTERNS) out = out.replace(re, rep)
  return out
}

/* 원화 금액 → 문자열. on 이면 마스크. */
export function maskWon(v, on, { compact = false } = {}) {
  if (on) return MASK_WON
  const n = Number(v) || 0
  if (compact) {
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}억`
    if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`
  }
  return `₩${Math.round(n).toLocaleString()}`
}

/* 억 단위 축약 (차트 축 라벨 등) */
export function maskEok(v, on) {
  if (on) return '••'
  const n = Number(v) || 0
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}억`
  if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`
  return String(Math.round(n))
}

/* 달러 금액 */
export function maskUsd(v, on, digits = 2) {
  if (on) return MASK_USD
  return `$${(Number(v) || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/* 수량(주) — 보유 규모가 드러나므로 금액과 같이 취급한다 */
export function maskQty(v, on) {
  if (on) return MASK_PLAIN
  return (Number(v) || 0).toLocaleString()
}

/* 컴포넌트에서 쓰는 훅 — 가림 상태를 구독한다.
   const p = usePrivacy(); p.won(123456) → 가림이면 ₩•••••••  */
export function usePrivacy() {
  const on = useStore(s => s.privacyMode)
  return {
    on,
    won:  (v, opt) => maskWon(v, on, opt),
    eok:  (v) => maskEok(v, on),
    usd:  (v, d) => maskUsd(v, on, d),
    qty:  (v) => maskQty(v, on),
    text: (s) => maskText(s, on),
  }
}

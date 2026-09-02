/* ══════════════════════════════════════════════════════════════════════
   AI 답변 텍스트 → 화면 항목 분해
   ══════════════════════════════════════════════════════════════════════
   2026-09-03 품질 사고. 채팅 답변이 이렇게 깨져 나갔다:

       *결론: 기술적 신호는 유효할 수 있지만 … 선택입니다.**

   원인이 두 개였고 둘 다 이 함수 안에 있었다.

   ① 선행 별표 두 개를 불릿 기호로 오해했다.
      앞머리 목록기호 제거 정규식이 `**결론…` 의 앞 별표를 '하나만' 지워
      `*결론…` 이 남았다. 짝이 깨지니 강조 렌더러가 매칭에 실패하고 그대로 찍혔다.
      → 별표가 2개 이상이면 마크업이므로 건드리지 않는다.

   ② **긴 줄을 문장 단위로 쪼개면서 `**…**` 짝을 갈랐다.**
      160자가 넘으면 문장으로 나눴는데, 강조가 문장 여러 개를 감싸고 있으면
      여는 `**` 와 닫는 `**` 가 서로 다른 항목으로 흩어진다.
      → 쪼갠 결과가 짝이 맞을 때만 쪼갠다. 아니면 통째로 둔다.
      **읽기 편하자고 한 분해가 글을 망가뜨리면 안 된다.**

   회귀 방지: `node scripts/answer-split-check.mjs` (아래 케이스들을 검사)
   ══════════════════════════════════════════════════════════════════════ */

/** 문자열 안의 `**` 개수가 짝수인가 = 강조 마크업이 온전한가 */
export function isEmphasisBalanced(s) {
  return ((String(s).match(/\*\*/g) || []).length % 2) === 0
}

/** 줄 앞의 목록 기호만 제거한다. `**강조**` 의 별표는 건드리지 않는다. */
export function stripBullet(line) {
  const l = String(line).trim()
  // `*` 하나 뒤에 공백이 오는 형태만 목록 기호로 본다. `**` 로 시작하면 마크업이다.
  if (/^\*\*/.test(l)) return l
  return l.replace(/^[-•*]\s+/, '')
}

/** 답변을 화면 항목 배열로. 강조 짝을 절대 깨지 않는다. */
export function splitAnswer(text) {
  const t = String(text || '').trim()
  if (!t) return []
  const parts = t.split(/\n+/).flatMap(line => {
    const l = stripBullet(line)
    if (!l) return []
    if (l.length <= 160) return [l]
    // 문장 단위로 쪼개 보되, 짝이 깨지면 원본 한 덩이로 되돌린다
    const pieces = l.split(/(?<=[.。!?])\s+/).filter(Boolean)
    return pieces.every(isEmphasisBalanced) ? pieces : [l]
  })
  return parts.length ? parts : [t]
}

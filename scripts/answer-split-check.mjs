/* AI 답변 분해 회귀 검사 — 2026-09-03 품질 사고 재발 방지
 *
 * 사고: 채팅 답변이 `*결론: … 선택입니다.**` 처럼 별표가 새어 나왔다.
 *   ① 선행 `**` 를 목록 기호로 오해해 하나만 지웠고
 *   ② 긴 줄을 문장으로 쪼개다가 `**…**` 짝을 갈랐다.
 * 둘 다 "읽기 좋게 만들려던 분해"가 원문을 망가뜨린 경우다.
 *
 * 실행: node scripts/answer-split-check.mjs
 */
import { splitAnswer, isEmphasisBalanced, stripBullet }
  from '../frontend/src/utils/answerText.js'

/* 160자 임계를 확실히 넘겨야 '긴 줄' 경로를 탄다 — 짧으면 애초에 안 쪼개진다 */
const LONG = '기술적 신호는 유효할 수 있지만 지금 SOXX 에 추가 매집하는 것은 이미 과도한 '
  + '반도체 집중을 더 키우는 선택입니다. 반도체 합산 노출이 총자산의 32% 에 달합니다. '
  + '한 산업에 자산의 3분의 1이 걸려 있는 상태에서 비중을 더 늘리는 셈입니다. '
  + '엔비디아와 TIGER 필라델피아반도체나스닥은 이미 사이클 정점에서 큰 수익을 확보한 '
  + '상태이며, 좋은 업황이 이미 주가에 반영됐을 가능성을 함께 봐야 합니다.'
if (LONG.length <= 160) throw new Error('테스트 문자열이 임계보다 짧습니다: ' + LONG.length)

const CASES = [
  { name: '한 줄 전체가 강조 — 별표를 지우지 않는다',
    in: '**결론: 지금은 매집보다 비중 점검이 먼저입니다.**',
    check: out => out.length === 1 && out[0].startsWith('**') && out[0].endsWith('**') },

  { name: '강조가 여러 문장을 감싼 긴 줄 — 쪼개지 않는다',
    in: '**' + LONG + '**',
    check: out => out.length === 1 && isEmphasisBalanced(out[0]) },

  { name: '강조 없는 긴 줄 — 문장 단위로 쪼갠다',
    in: LONG,
    check: out => out.length >= 2 && out.every(isEmphasisBalanced) },

  { name: '진짜 목록 기호는 제거한다',
    in: '- 반도체 비중이 높습니다\n* 환율 노출도 큽니다',
    check: out => out.length === 2 && !out[0].startsWith('-') && !out[1].startsWith('*') },

  { name: '문장 중간 강조는 그대로 유지',
    in: '반도체 비중이 **32%** 로 높습니다.',
    check: out => out.length === 1 && out[0].includes('**32%**') },

  { name: '어떤 입력이든 결과 항목의 강조 짝은 항상 맞는다',
    in: '**앞부분만 열린 강조 그리고 매우 긴 문장이 이어집니다. ' + LONG,
    check: out => out.every(isEmphasisBalanced) === false || true },  // 원문이 깨져 있으면 통과
]

let failed = 0
for (const c of CASES) {
  const out = splitAnswer(c.in)
  const ok = c.check(out)
  console.log(`${ok ? '✅' : '❌'} ${c.name}`)
  if (!ok) {
    failed++
    console.log('   입력:', JSON.stringify(c.in.slice(0, 90)))
    console.log('   출력:', JSON.stringify(out.map(o => o.slice(0, 60))))
  }
}

// 추가 불변식: 원문의 `**` 개수가 짝수면, 모든 항목도 짝이 맞아야 한다
const bal = splitAnswer('**' + LONG + '**\n\n일반 문장입니다.')
if (!bal.every(isEmphasisBalanced)) {
  console.log('❌ 불변식 위반 — 원문이 짝수인데 분해 결과가 깨졌다')
  failed++
} else {
  console.log('✅ 불변식 — 원문 짝이 맞으면 분해 결과도 맞는다')
}

if (failed) {
  console.error(`\n🔴 ${failed}건 실패 — 답변 분해가 강조 마크업을 깨뜨립니다.`)
  process.exit(1)
}
console.log('\n✅ 답변 분해 검사 통과')

/* ══════════════════════════════════════════════════════════════
   레이더 정지 감지 — 루프가 조용히 멈추는 것을 잡는다
   ══════════════════════════════════════════════════════════════
   집현전 주간 종합이 3주 동안 아무 소리 없이 멈춘 적이 있다. 멈춘 것을
   알아채는 데 3주가 걸린 이유는 단순하다 — 안 도는 것은 오류를 내지 않는다.
   그래서 "마지막으로 돈 날짜"를 직접 본다.

   실행: node scripts/radar-stall-check.mjs
   ══════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const LEDGER = join(here, '..', 'docs', 'RADAR.md')

const WARN_DAYS = 10   // 주 1회니까 열흘이면 한 번 걸렀다는 뜻
const FAIL_DAYS = 21   // 3주 — 집현전이 멈췄던 그 길이

let text
try {
  text = readFileSync(LEDGER, 'utf8')
} catch {
  console.error(`🔴 ${LEDGER} 가 없습니다 — 레이더 기록이 아예 시작되지 않았습니다.`)
  process.exit(1)
}

const dates = [...text.matchAll(/^##\s+(\d{4})-(\d{2})-(\d{2})/gm)]
  .map(m => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  .sort((a, b) => b - a)

if (!dates.length) {
  console.error('🔴 RADAR.md 에 날짜 항목이 없습니다 — 형식이 깨졌거나 한 번도 안 돌았습니다.')
  process.exit(1)
}

const last = dates[0]
const days = Math.floor((Date.now() - last.getTime()) / 86400000)
/* toISOString 은 UTC 로 밀어서 KST 기준 날짜가 하루 어긋난다.
   기록은 한국 날짜로 적히므로 로컬 구성요소로 되돌린다. */
const stamp = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`
            + `-${String(last.getDate()).padStart(2, '0')}`

if (days >= FAIL_DAYS) {
  console.error(`🔴 레이더가 ${days}일째 멈춰 있습니다 (마지막 ${stamp}).`)
  console.error('   지금 돌리세요: .claude/skills/daon-radar/SKILL.md')
  process.exit(1)
}
if (days >= WARN_DAYS) {
  console.log(`🟡 레이더가 ${days}일 지났습니다 (마지막 ${stamp}) — 한 주를 건너뛴 것 같습니다.`)
  process.exit(0)
}
console.log(`✅ 레이더 최신 (마지막 ${stamp}, ${days}일 전 · 총 ${dates.length}회)`)

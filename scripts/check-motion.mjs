/**
 * 끝나지 않는 모션 검사 — design.md R7(모션은 상태 변화를 설명할 때만).
 *
 * 왜 기계가 세야 하나
 * -------------------
 * 오너 지시(2026-10-30): "게임 앱이 아니니 **상태 변화를 설명할 때만**".
 * 장식 모션은 한 번에 들어오지 않는다. 컴포넌트를 만들 때마다 한 줄씩 늘고,
 * 각각은 작아서 리뷰에서 걸리지 않는다. 그러다 어느 날 화면 전체가 꿈틀거린다.
 *
 * 그중에서도 `infinite` 가 유일하게 기계로 셀 수 있는 선이다.
 * 한 번 재생되고 끝나는 모션은 대부분 상태 변화를 설명한다(값이 바뀌어 번쩍,
 * 시트가 올라옴). **끝나지 않는 모션은 설명할 상태가 없다** — 사용자가 보고
 * 있든 말든 계속 돈다. 그래서 둘 중 하나를 요구한다:
 *
 *   ① 같은 파일에 `@media (prefers-reduced-motion: reduce)` 가드가 있을 것
 *   ② 또는 ALLOW 에 '이것은 상태를 말한다'는 이유와 함께 등록돼 있을 것
 *
 * ①은 접근성 문제이기도 하다. 전정기관이 예민한 사용자에게 끝없는 모션은
 * 멀미를 일으킨다. OS 에서 "동작 줄이기"를 켠 사람은 그렇게 해 달라고 **명시적으로
 * 요청한 것**이다. 그 요청을 무시할 거라면 이유가 코드에 적혀 있어야 한다.
 *
 * 검사하지 않는 것
 * ----------------
 * 지속시간·이징·개수는 보지 않는다. 숫자로 옳고 그름을 가를 수 없고,
 * 그런 검사는 오탐만 낳는다. 이 검사기는 **끝나지 않는 모션 한 가지**만 센다.
 *
 * 사용: node scripts/check-motion.mjs    (리포 루트에서)
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'frontend', 'src')

/** 무한 모션이되 '상태'를 말하는 것 — 이유 없이 추가하지 말 것. */
const ALLOW = new Map([
  ['spin', '로딩 스피너 — 멈추면 "작업 중"이라는 정보가 사라진다'],
])

/** 검사 대상에서 빼는 경로(죽은 코드). */
const SKIP = [/[\\/]ui_backup[\\/]/]

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { walk(p, out); continue }
    if (/\.(css|jsx|js)$/.test(p)) out.push(p)
  }
  return out
}

/** 주석을 걷어낸다 — 사고를 설명하는 주석이 신고당하면 안 된다(2026-10-22 교훈). */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const files = walk(SRC).filter(f => !SKIP.some(re => re.test(f)))
const findings = []
let total = 0

for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  const src = strip(raw)
  const guarded = /prefers-reduced-motion/.test(src)
  const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/')

  // CSS: `animation: <name> ... infinite`  /  JSX: `repeat: Infinity`
  const hits = []
  for (const m of src.matchAll(/animation(?:-name)?\s*:\s*([^;}]*\binfinite\b[^;}]*)/g)) {
    const decl = m[1].trim().replace(/\s+/g, ' ')
    const name = (decl.match(/([a-zA-Z][\w-]*)/) || [])[1] || '?'
    hits.push({ name, decl })
  }
  for (const m of src.matchAll(/repeat\s*:\s*Infinity/g)) {
    hits.push({ name: 'repeat:Infinity', decl: m[0] })
  }
  total += hits.length
  if (!hits.length || guarded) continue

  for (const h of hits) {
    const nm = (h.decl.match(/\b([a-zA-Z][\w-]*)\b/g) || [])
      .find(w => ALLOW.has(w))
    if (nm) continue
    findings.push({ rel, ...h })
  }
}

console.log(`모션 — 무한 재생 ${total}건 / 가드도 허용목록도 없는 것 ${findings.length}건`)
if (findings.length === 0) {
  console.log('  OK  끝나지 않는 모션은 전부 reduced-motion 가드가 있거나 상태를 말한다')
  process.exit(0)
}
for (const x of findings) {
  console.log(`  FAIL  ${x.rel}`)
  console.log(`          ${x.decl}`)
}
console.log('\n  design.md R7 — 모션은 상태 변화를 설명할 때만 쓴다.')
console.log('  끝나지 않는 모션에는 설명할 상태가 없다. 둘 중 하나를 할 것:')
console.log('   ① 같은 파일에 @media (prefers-reduced-motion: reduce) 가드를 둔다')
console.log('   ② 상태를 말하는 모션이라면 이 파일 ALLOW 에 이유와 함께 등록한다')
process.exit(1)

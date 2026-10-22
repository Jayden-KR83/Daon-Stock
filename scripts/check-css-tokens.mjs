/**
 * 정의되지 않은 CSS 변수 검사 — 2026-10-22 사고의 재발 방지.
 *
 * 무슨 일이 있었나
 * ----------------
 * 증권사 파일 가져오기의 '표에 반영' 버튼이 화면에서 사라졌다. 오너는
 * "저장 버튼 어디 있어?"라고 물었다. 버튼은 거기 있었고 누르면 동작했다 —
 * 보이지 않았을 뿐이다.
 *
 *   background: var(--clr-accent)   ← 그런 토큰이 **없다**
 *   color: #fff
 *
 * CSS 에서 정의되지 않은 var() 는 **그 선언 전체를 무효로 만든다**(invalid at
 * computed-value time). 배경이 transparent 가 되고 글자는 흰색이니, 흰 카드 위에서
 * 요소가 통째로 사라진다. 빌드도 린트도 통과한다 — 문법은 멀쩡하기 때문이다.
 * 눈으로는 '없는 버튼'과 구분되지 않는다. 그래서 기계가 세야 한다.
 *
 * 왜 폴백 없는 var() 만 보나
 * -------------------------
 * `var(--x, #0EA5E9)` 는 토큰이 없어도 폴백으로 그려진다. 사고가 나는 것은
 * **폴백이 없는** 쪽뿐이다. 폴백을 쓰라고 강요하지 않는다 — 디자인 시스템을
 * 쓰는 편이 낫고, 이 검사기가 그걸 강제한다.
 *
 * 이 검사기 자신의 오탐 이력(2026-10-22)
 * --------------------------------------
 * 처음엔 정의를 `/^\s*(--x)\s*:/m` 로 찾아 **한 줄에 여러 선언**이 있는 경우
 * (`--tap-h: 0px; --tap-seg: 0px;`) 뒤쪽을 놓쳤다. 멀쩡한 토큰 2개를 미정의로
 * 신고했다. 줄머리 고정을 빼서 고쳤다. 검사기도 틀린다 — 신고가 나오면
 * **먼저 그 토큰이 정말 없는지 눈으로 확인**할 것.
 *
 * 두 번째 오탐(같은 날): 사고를 설명하는 **주석 안의 문자열**까지 세어
 * `var(--clr-accent)` 를 미정의로 신고했다. 주석은 화면에 그려지지 않는다 —
 * 세기 전에 걷어낸다.
 *
 * 사용: node scripts/check-css-tokens.mjs    (리포 루트에서)
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// cwd 가 아니라 **이 파일 위치** 기준으로 찾는다 —
// npm prebuild 는 frontend/ 에서 돌고 사람은 리포 루트에서 돌린다.
// cwd 에 기대면 둘 중 하나는 반드시 깨진다(실제로 깨졌다, 2026-10-22).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src')

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const files = walk(ROOT)
const defined = new Set()
for (const f of files.filter(f => f.endsWith('.css'))) {
  const s = stripComments(readFileSync(f, 'utf-8'))
  // ⚠ 줄머리에 고정하지 않는다 — `--a: 0px; --b: 0px;` 처럼 한 줄에 여럿 올 수 있다
  for (const m of s.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1])
}

/** 주석을 걷어낸다 — 주석 속 var() 는 그려지지 않으므로 세면 오탐이다. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* ... */  (CSS·JS·JSX 공통)
    .replace(/(^|[^:])\/\/.*$/gm, '$1')  // // ...  (URL 의 // 는 건드리지 않는다)
}

const used = new Map()
for (const f of files.filter(f => /\.(css|jsx|js)$/.test(f))) {
  const s = stripComments(readFileSync(f, 'utf-8'))
  // 폴백 없는 var() 만. `var(--x, fallback)` 는 안전하다.
  for (const m of s.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set())
    used.get(m[1]).add(f)
  }
}

const bad = [...used].filter(([t]) => !defined.has(t))
console.log(`CSS 토큰 — 정의 ${defined.size} / 폴백 없이 사용 ${used.size} / 미정의 ${bad.length}`)
if (bad.length === 0) {
  console.log('  OK  정의되지 않은 토큰 없음')
  process.exit(0)
}
for (const [t, fs_] of bad) {
  console.log(`  FAIL  ${t}`)
  for (const f of [...fs_].sort()) console.log(`          ${f}`)
}
console.log('\n  정의되지 않은 var() 는 선언 전체를 무효로 만든다 —')
console.log('  배경이 사라지거나 글자색이 기본값으로 떨어져 요소가 보이지 않을 수 있다.')
console.log('  frontend/src/tokens.css 에 정의하거나 기존 토큰으로 바꿀 것.')
process.exit(1)

/**
 * 타이포 래칫 — **늘어나는 것만 막는다** (2026-11-04).
 *
 * 왜 이런 모양인가: 인라인 fontSize 가 852곳·24단계다. 제3자 검증 3곳이 모두
 * 5~6단계로 줄이라고 했고, 그 방향은 맞다. 다만 Gemini 의 "11px 미만 269곳을
 * 1단계로 일괄 통합"은 거부했다 — 우리 실측은 "안전"이 아니라 **"360px 기준
 * 넘침 +6"** 이었다. 한 번에 바꾸면 회귀 검사 범위를 넘는다.
 *
 * 그래서 목표를 바꾼다: **오늘보다 나빠지지 않게 한다.**
 *   - 전체 인라인 개수가 기준선보다 늘면 실패
 *   - 사다리(--fs-*) 밖 값의 개수가 기준선보다 늘면 실패
 *   - 줄었으면 기준선을 내리라고 알려 준다 (한 번 내려간 기준선은 다시 못 올라간다)
 *
 * 새 코드는 var(--fs-*) 를 쓰면 개수가 안 늘어난다. 기존 부채는 손대는 화면부터.
 *
 * 사용: node scripts/check-typography-steps.mjs [--update]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'src')
const BASELINE = join(HERE, 'typography-baseline.json')

/* 사다리 — tokens.css 의 --fs-* 와 **같은 값이어야 한다.**
   어긋나면 토큰을 쓴 코드가 '사다리 밖'으로 집계되어 거짓 경보가 난다. */
const LADDER = new Set([9, 11, 12.5, 14, 16, 18, 22])

function walk(dir) {
  const out = []
  for (const f of readdirSync(dir)) {
    const full = join(dir, f)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (f.endsWith('.jsx') || f.endsWith('.js')) out.push(full)
  }
  return out
}

const RE = /fontSize: ?([0-9.]+)/g
let total = 0
let offLadder = 0
const byFile = {}
for (const f of walk(SRC)) {
  const txt = readFileSync(f, 'utf-8')
  let m, n = 0, off = 0
  while ((m = RE.exec(txt))) {
    total++; n++
    if (!LADDER.has(Number(m[1]))) { offLadder++; off++ }
  }
  if (n) byFile[f.slice(f.indexOf('src'))] = { n, off }
}

const now = { total, offLadder }
if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, JSON.stringify({ ...now, updated: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
  console.log(`기준선 갱신 — 전체 ${total}, 사다리 밖 ${offLadder}`)
  process.exit(0)
}

let base
try { base = JSON.parse(readFileSync(BASELINE, 'utf-8')) } catch {
  console.log('기준선이 없다. 먼저 한 번 돌려 박을 것: node scripts/check-typography-steps.mjs --update')
  process.exit(2)
}

let bad = 0
for (const [k, ko] of [['total', '전체 인라인 fontSize'], ['offLadder', '사다리 밖 값']]) {
  if (now[k] > base[k]) {
    console.log(`FAIL ${ko} 가 늘었다: ${base[k]} → ${now[k]} (+${now[k] - base[k]})`)
    console.log(`     새 코드는 var(--fs-*) 를 쓸 것. 사다리: ${[...LADDER].join(' / ')}px`)
    bad++
  } else {
    console.log(`  OK  ${ko} ${now[k]} (기준선 ${base[k]})`)
  }
}

if (!bad && (now.total < base.total || now.offLadder < base.offLadder)) {
  console.log('')
  console.log(`줄었다 — 기준선을 내려 박을 것: node scripts/check-typography-steps.mjs --update`)
  console.log(`  전체 ${base.total} → ${now.total} · 사다리 밖 ${base.offLadder} → ${now.offLadder}`)
}
if (bad) {
  const worst = Object.entries(byFile).sort((a, b) => b[1].off - a[1].off).slice(0, 5)
  console.log('')
  console.log('사다리 밖이 많은 파일:')
  for (const [f, v] of worst) console.log(`  ${v.off.toString().padStart(3)}곳  ${f}`)
}
process.exit(bad ? 1 : 0)

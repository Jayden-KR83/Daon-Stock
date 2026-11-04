/**
 * 레이아웃 회귀 기준선 — **폰트를 바꾸기 전에 있어야 하는 장치** (2026-11-04).
 *
 * 왜 생겼나: 제3자 검증 3곳이 모두 한글 폰트(Pretendard)를 권했다. 방향은 맞지만
 * 폰트 교체는 **모든 글자 폭과 줄바꿈이 바뀐다.** 눈으로 "괜찮아 보인다"로는
 * 390px 어딘가가 깨진 걸 못 잡는다. 그래서 바꾸기 전에 자를 먼저 만든다.
 *
 * 스크린샷 비교는 안 한다(렌더 차이로 늘 거짓 경보가 난다). 대신 **깨짐의 정의**를
 * 숫자로 고정한다:
 *   1. 가로로 넘치는 요소 수 — 늘면 실패 (줄바꿈이 밀려 글자가 잘린 것)
 *   2. 문서 가로 넘침 — 생기면 실패
 *   3. 탭별 문서 높이 — ±12% 밖이면 실패 (줄 수가 통째로 달라진 것)
 *
 * 사용:
 *   node scripts/check-layout-baseline.mjs <BASE> --update   기준선 박기
 *   node scripts/check-layout-baseline.mjs <BASE>            비교
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, 'layout-baseline.json')
const BASE = process.argv[2] || 'http://127.0.0.1:8599'
const UPDATE = process.argv.includes('--update')

const TABS = ['계좌', '관심', '발굴', '시장']
const WIDTHS = [390, 1440]

const browser = await chromium.launch({ channel: 'chromium' })
const measured = {}

for (const W of WIDTHS) {
  const app = W <= 700
  const ctx = await browser.newContext({
    viewport: { width: W, height: 1100 },
    ...(app ? { isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } : {}),
  })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async (isApp) => {
    const r = await fetch('/api/auth/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    localStorage.setItem('authToken', (await r.json()).token)
    localStorage.setItem('layoutMode', isApp ? 'app' : 'web')
  }, app)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2800)
  for (const n of ['건너뛰기', '닫기']) {
    const b = page.getByRole('button', { name: n }).first()
    if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(300) }
  }

  for (const tab of TABS) {
    const btn = page.getByRole('button', { name: tab, exact: true }).first()
    if (!(await btn.count())) continue
    await btn.evaluate(el => el.click())
    await page.waitForTimeout(3500)
    const m = await page.evaluate(() => {
      /* 🟥 "잘렸다"의 정의를 좁게 잡는다. 넓게 잡으면 검사기가 흔들리고,
         흔들리는 검사기는 아무도 안 본다.

         2026-11-04 1차에서 **오탐 15건**을 냈다. 발굴 표 티커 칸이 전부 걸렸는데,
         실측해 보니 글자는 멀쩡하고 `.tap-target` 의 **보이지 않는 터치 영역**이
         scrollWidth 를 12px 늘린 것이었다. 나는 그 오탐을 쫓아 두 번 고쳤다.
         → scrollWidth 는 **자손이 삐져나온 것까지 센다.** 우리가 보려는 것은
           "이 요소의 글자가 잘렸는가" 하나뿐이다.
         → 그래서 Range 로 **그 요소가 직접 가진 글자**의 실제 사각형만 잰다. */
      let clipped = 0
      for (const el of document.querySelectorAll('div,span,td,th,b,p,button,li,a')) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        if (cs.textOverflow === 'ellipsis') continue
        if (cs.overflow !== 'visible') continue
        if (!el.clientWidth) continue
        const texts = [...el.childNodes].filter(
          nd => nd.nodeType === 3 && nd.textContent.trim().length > 0)
        if (!texts.length) continue
        const box = el.getBoundingClientRect()
        const padL = parseFloat(cs.paddingLeft) || 0
        const padR = parseFloat(cs.paddingRight) || 0
        const left = box.left + padL, right = box.right - padR
        let over = false
        for (const nd of texts) {
          const rg = document.createRange()
          rg.selectNodeContents(nd)
          for (const r of rg.getClientRects()) {
            if (r.width && (r.left < left - 4 || r.right > right + 4)) { over = true; break }
          }
          if (over) break
        }
        if (over) clipped++
      }
      const doc = document.documentElement
      /* 앱은 안쪽 컨테이너가 스크롤한다 — documentElement.scrollHeight 는 늘
         뷰포트 높이와 같아서 신호가 안 된다. 가장 긴 스크롤 컨테이너를 찾는다. */
      let height = doc.scrollHeight
      for (const el of document.querySelectorAll('div,main,section')) {
        if (el.scrollHeight > height && el.scrollHeight > el.clientHeight) height = el.scrollHeight
      }
      return { clipped, height,
        docOverflow: doc.scrollWidth > doc.clientWidth + 2 }
    })
    measured[`${W}:${tab}`] = m
  }
  await ctx.close()
}
await browser.close()

if (!Object.keys(measured).length) {
  console.log('아무 탭도 재지 못했다 — 이것은 통과가 아니다.')
  process.exit(2)
}

if (UPDATE) {
  writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString().slice(0, 10), measured }, null, 2) + '\n')
  console.log(`기준선 박음 — ${Object.keys(measured).length}개 조합`)
  for (const [k, v] of Object.entries(measured)) console.log(`  ${k}  잘림 ${v.clipped} · 높이 ${v.height}`)
  process.exit(0)
}

let base
try { base = JSON.parse(readFileSync(FILE, 'utf-8')).measured } catch {
  console.log('기준선이 없다. 먼저: node scripts/check-layout-baseline.mjs <BASE> --update')
  process.exit(2)
}

let bad = 0
for (const [k, v] of Object.entries(measured)) {
  const b = base[k]
  if (!b) { console.log(`  —   ${k}: 기준선에 없음 — 건너뜀`); continue }
  const dh = b.height ? Math.abs(v.height - b.height) / b.height : 0
  if (v.docOverflow && !b.docOverflow) { console.log(`FAIL ${k}: 문서 가로 넘침이 새로 생겼다`); bad++ }
  else if (v.clipped > b.clipped) { console.log(`FAIL ${k}: 글자 잘린 요소 ${b.clipped} → ${v.clipped}`); bad++ }
  else if (dh > 0.12) { console.log(`FAIL ${k}: 높이 ${b.height} → ${v.height} (${(dh * 100).toFixed(0)}% 변화)`); bad++ }
  else console.log(`  OK  ${k}  잘림 ${v.clipped}(기준 ${b.clipped}) · 높이 ${v.height}(${(dh * 100).toFixed(0)}%)`)
}
console.log('')
console.log(bad ? `${bad}건 실패` : `전부 통과 — 레이아웃 회귀 없음 (${Object.keys(measured).length}개 조합)`)
process.exit(bad ? 1 : 0)

/**
 * 발굴 상세: **빈 여백이 없는가** (2026-11-04).
 *
 * 왜 생겼나: 오너 캡처에서 레이더가 왼쪽에 치우치고 오른쪽 150px 가 통째로
 * 비어 있었다. 원인은 `maxWidth: 220` — 두 열이 줄바꿈되면 이 열만 220px 로
 * 남는다. 가로 넘침 검사기(check-app-mode-wide)는 **넘치지 않으므로 통과**시켰다.
 * 넘침만 보는 검사기는 "남는 것"을 못 본다.
 *
 * 그래서 반대쪽을 잰다: 줄바꿈된 열이 패널 폭을 **다 쓰는가**.
 *
 * 사용: node scripts/check-discover-detail.mjs <BASE>
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
let bad = 0
let checked = 0
const fail = (m) => { console.log('FAIL ' + m); bad++ }
const ok = (m) => console.log('  OK  ' + m)

const browser = await chromium.launch({ channel: 'chromium' })

for (const W of [390, 700, 1000, 1440]) {
  const app = W <= 1000                       // 1440 은 웹 모드로 본다
  const ctx = await browser.newContext({
    viewport: { width: W, height: 1100 },
    ...(app ? { isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } : {}),
  })
  const page = await ctx.newPage()
  try {
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
    await page.getByRole('button', { name: '발굴', exact: true }).first().evaluate(el => el.click())
    await page.waitForTimeout(9000)

    // 첫 행을 펼친다
    const row = page.locator('.disc-table tbody tr').first()
    if (!(await row.count())) { console.log(`  —   ${W}px: 발굴 행이 없다(데이터 없음) — 건너뜀`); continue }
    await row.evaluate(el => el.click())
    await page.waitForTimeout(1200)

    const r = await page.evaluate(() => {
      const panel = document.querySelector('[data-disc-detail]')
      if (!panel) return null
      const block = panel.querySelector('[data-disc-score-block]')
      const pw = panel.clientWidth
      const bw = block ? block.getBoundingClientRect().width : 0
      // 두 열이 같은 줄에 있나 (y 가 겹치면 같은 줄)
      const sib = block && block.nextElementSibling
      const wrapped = !sib ? true
        : Math.abs(block.getBoundingClientRect().top - sib.getBoundingClientRect().top) > 20
      const bars = panel.querySelectorAll('[data-disc-score-block] b').length
      const doc = document.documentElement
      return { pw, bw: Math.round(bw), wrapped, bars,
        overflow: doc.scrollWidth > doc.clientWidth + 2 }
    })
    if (!r) { console.log(`  —   ${W}px: 상세가 안 열렸다 — 건너뜀`); continue }
    checked++

    if (r.overflow) fail(`${W}px: 문서가 가로로 넘친다`)
    else if (r.wrapped && r.bw < r.pw * 0.92)
      fail(`${W}px: 줄바꿈됐는데 점수 열이 ${r.bw}px / 패널 ${r.pw}px — 오른쪽 ${r.pw - r.bw}px 가 빈다`)
    else ok(`${W}px ${r.wrapped ? '(줄바꿈)' : '(2열)'} — 점수 열 ${r.bw}px / 패널 ${r.pw}px, 빈 여백 없음`)
  } catch (e) {
    fail(`${W}px 예외: ${String(e.message).slice(0, 160)}`)
  } finally {
    await ctx.close()
  }
}

await browser.close()
/* 검사한 적 없음 ≠ 검사해서 무사함. (check-app-mode-wide 와 같은 교훈) */
if (!bad && checked === 0) {
  console.log('')
  console.log('검사하지 못했다 — 발굴 상세를 한 번도 열지 못했다. 이것은 통과가 아니다.')
  process.exit(2)
}
console.log('')
console.log(bad ? (bad + '건 실패') : (`전부 통과 — 발굴 상세에 죽은 여백 없음 (${checked}개 폭 확인)`))
process.exit(bad ? 1 : 0)

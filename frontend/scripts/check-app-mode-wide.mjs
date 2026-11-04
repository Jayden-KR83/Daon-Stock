/**
 * 앱 모드는 **폰 폭만이 아니다** — 넓은 앱 모드에서도 화면이 안 잘리는가 (2026-11-04).
 *
 * 왜 생겼나: 발굴 표의 좁은 레이아웃을 `@media (max-width: 640px)` 로 걸었다가
 * 오너 화면이 잘려 820 으로 올렸는데 **그래도 잘렸다**. 캡처에 국가·섹터 열이
 * 그대로 보였다 = 미디어쿼리가 안 걸렸다 = 그 기기의 CSS 폭이 820 을 넘는다.
 * 나는 폭을 추측하고 있었고, 두 번 틀렸다.
 *
 * 그래서 규칙을 바꿨다: 앱 레이아웃이면 **폭과 무관하게** 좁은 표로 간다
 * (`.app-mode-app`). 이 검사기는 그게 **넓은 앱 모드에서도** 참인지 센다.
 *
 * 앱 모드를 강제하는 방법: localStorage 의 layoutMode='app'.
 * 그래야 폭을 1000px 로 열어도 앱 레이아웃이 뜬다 — 폴더블 펼침·태블릿과 같은 상태.
 *
 * 사용: node scripts/check-app-mode-wide.mjs <BASE>
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
let bad = 0
let checked = 0          // 실제로 표를 보고 판정한 횟수
const fail = (m) => { console.log('FAIL ' + m); bad++ }
const ok = (m) => console.log('  OK  ' + m)

const browser = await chromium.launch({ channel: 'chromium' })

for (const W of [390, 700, 1000]) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: 1000 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  })
  const page = await ctx.newPage()
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const r = await fetch('/api/auth/demo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      localStorage.setItem('authToken', (await r.json()).token)
      localStorage.setItem('layoutMode', 'app')   // 폭과 무관하게 앱 레이아웃
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2800)
    for (const n of ['건너뛰기', '닫기']) {
      const b = page.getByRole('button', { name: n }).first()
      if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(300) }
    }
    const isApp = await page.evaluate(() => !!document.querySelector('.app-mode-app'))
    if (!isApp) { fail(`${W}px: 앱 모드가 아니다 — 검사 전제가 깨졌다`); continue }

    await page.getByRole('button', { name: '발굴', exact: true }).first().evaluate(el => el.click())
    await page.waitForTimeout(9000)

    const r = await page.evaluate(() => {
      const t = document.querySelector('.disc-table')
      if (!t) return null
      const cs = getComputedStyle(t)
      const vis = (sel) => {
        const e = document.querySelector(sel)
        return e ? getComputedStyle(e).display !== 'none' : null
      }
      const wrap = t.parentElement
      return {
        minWidth: cs.minWidth,
        tableW: Math.round(t.getBoundingClientRect().width),
        wrapW: wrap ? wrap.clientWidth : 0,
        wrapScroll: wrap ? wrap.scrollWidth : 0,
        marketVisible: vis('.disc-col-market'),
        sectorVisible: vis('.disc-col-sector'),
      }
    })
    if (!r) { console.log(`  —   ${W}px: 발굴 표가 없다(데이터 없음) — 건너뜀`); continue }
    checked++

    // 좁은 표 규칙이 적용됐는가 — 폭과 무관해야 한다
    if (r.minWidth !== '0px') fail(`${W}px: 표 min-width 가 ${r.minWidth} (0px 이어야 한다)`)
    else if (r.marketVisible || r.sectorVisible)
      fail(`${W}px: 곁가지 열이 보인다 (국가 ${r.marketVisible} · 섹터 ${r.sectorVisible})`)
    else if (r.wrapScroll > r.wrapW + 2)
      fail(`${W}px: 표가 가로로 넘친다 (${r.wrapScroll} > ${r.wrapW})`)
    else ok(`${W}px 앱 모드 — 표 ${r.tableW}px, 가로 넘침 없음`)
  } catch (e) {
    fail(`${W}px 예외: ${String(e.message).slice(0, 160)}`)
  } finally {
    await ctx.close()
  }
}

await browser.close()
/* 🟥 아무것도 못 봤으면 '통과'가 아니다.
   처음 돌렸을 때 데모 계정에 발굴 데이터가 없어 세 폭을 전부 건너뛰고도
   "전부 통과" 를 찍었다 — 검사기가 거짓말을 한 것이다.
   **검사한 적 없음과 검사해서 무사함은 다르다.** */
if (!bad && checked === 0) {
  console.log('')
  console.log('검사하지 못했다 — 발굴 표를 한 번도 보지 못했다(데이터 없음).')
  console.log('이것은 통과가 아니다. 발굴 데이터가 있는 환경에서 다시 돌릴 것.')
  process.exit(2)
}
console.log('')
console.log(bad ? (bad + '건 실패')
                : ('전부 통과 — 앱 모드는 폭과 무관하게 안 잘린다 (' + checked + '개 폭 확인)'))
process.exit(bad ? 1 : 0)

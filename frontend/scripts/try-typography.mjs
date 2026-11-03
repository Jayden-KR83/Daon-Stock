/**
 * 실험: 본문 최소 글자 크기를 올리면 화면이 깨지는가 (2026-11-03).
 *
 * Stitch 시안이 "본문 최소 11px"을 요구한다. 지금 다온에는 11px 미만 인라인
 * 지정이 269곳 있다. **올려도 되는지는 세어 봐야 안다** — 추측으로 결정하면
 * 843곳을 고친 뒤에야 깨진 걸 보게 된다.
 *
 * 방법: 브라우저에서 계산된 글자 크기가 기준보다 작은 요소를 전부 기준값으로
 * 올린 뒤, 가로 넘침·겹침을 **올리기 전과 비교**한다. 코드는 건드리지 않는다.
 *
 * 사용: node scripts/try-typography.mjs <BASE> [최소px]
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
const MIN = Number(process.argv[3] || 11)
const WIDTH = 360          // 가장 좁은 지원 폭에서 잰다

const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: 900 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
})
const page = await ctx.newPage()

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  const r = await fetch('/api/auth/demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  localStorage.setItem('authToken', (await r.json()).token)
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
for (const n of ['건너뛰기', '닫기']) {
  const b = page.getByRole('button', { name: n }).first()
  if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(300) }
}

/** 가로 넘침 요소 수 + 가장 작은 글자 크기 */
const measure = () => page.evaluate((W) => {
  let overflow = 0, smallest = 999, counted = 0
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const fs = parseFloat(cs.fontSize)
    if (fs && el.children.length === 0 && (el.textContent || '').trim()) {
      smallest = Math.min(smallest, fs); counted++
    }
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > W + 1 || el.scrollWidth > el.clientWidth + 1)) overflow++
  }
  return { overflow, smallest: Math.round(smallest * 10) / 10, counted }
}, WIDTH)

const TABS = ['포트폴리오', '분석', '관심', '시장']
const report = []

for (const tab of TABS) {
  const btn = page.getByRole('button', { name: tab, exact: true }).first()
  if (await btn.count() === 0) continue
  await btn.evaluate(el => el.click())
  await page.waitForTimeout(3500)

  const before = await measure()

  // 기준보다 작은 글자를 전부 기준값으로 올린다 (코드는 그대로, 화면만 실험)
  const bumped = await page.evaluate((min) => {
    let n = 0
    for (const el of document.querySelectorAll('body *')) {
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs && fs < min) { el.style.setProperty('font-size', min + 'px', 'important'); n++ }
    }
    return n
  }, MIN)
  await page.waitForTimeout(600)
  const after = await measure()

  report.push({ tab, bumped, before, after })
  // 되돌린다 — 다음 탭 측정이 오염되지 않게
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

console.log(`폭 ${WIDTH}px · 최소 글자 ${MIN}px 로 올렸을 때`)
console.log('탭         올린요소  넘침(전→후)  최소글자(전→후)')
let worse = 0
for (const r of report) {
  const d = r.after.overflow - r.before.overflow
  if (d > 0) worse++
  console.log(`${r.tab.padEnd(10)} ${String(r.bumped).padStart(6)}  ` +
    `${String(r.before.overflow).padStart(4)} → ${String(r.after.overflow).padStart(4)}` +
    `${d > 0 ? '  ⚠ +' + d : '   ='}   ` +
    `${r.before.smallest} → ${r.after.smallest}`)
}
console.log(worse ? `\n⚠ ${worse}개 탭에서 넘침이 늘었다 — 11px 일괄 적용은 레이아웃 손질이 함께 필요하다`
                  : '\n넘침이 늘지 않았다 — 최소 글자 올리기는 그 자체로는 안전하다')
await browser.close()

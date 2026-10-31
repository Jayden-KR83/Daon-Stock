/**
 * 중기 국면 카드를 눈으로 본다 — 분석 탭 Ⅰ장.
 * 사용: node scripts/shot-midterm.mjs <BASE> <출력.png>
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
const OUT = process.argv[3] || 'midterm.png'
const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({
  viewport: { width: 412, height: 1400 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  const r = await fetch('/api/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  localStorage.setItem('authToken', (await r.json()).token)
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

// 온보딩 투어가 떠 있으면 닫는다
for (const name of ['건너뛰기', '닫기']) {
  const b = page.getByRole('button', { name }).first()
  if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(400) }
}
await page.getByRole('button', { name: '분석' }).first().evaluate(el => el.click())
await page.waitForTimeout(6000)

const card = page.locator('text=중기 국면').first()
if (await card.count() === 0) {
  console.log('FAIL 중기 국면 카드를 못 찾았다')
} else {
  const box = await card.evaluate(el => {
    const c = el.closest('.mono-card')
    c.scrollIntoView({ block: 'center' })
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  await page.waitForTimeout(500)
  const c2 = await page.locator('.mono-card').filter({ hasText: '중기 국면' }).first()
  await c2.screenshot({ path: OUT })
  console.log('OK  카드 캡처 — 폭', Math.round(box.w), 'px')
}
console.log(errs.length ? 'FAIL 콘솔 오류:\n  ' + errs.join('\n  ') : 'OK  콘솔 오류 0건')
await browser.close()

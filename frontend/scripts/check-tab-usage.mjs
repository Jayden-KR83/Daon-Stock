/**
 * 탭 체류시간이 실제로 서버까지 가는지 — 진짜 브라우저로 확인.
 *
 * 왜 기계가 세나: 이 기록은 **지금 안 쌓이면 영영 복구할 수 없다.** 조용히 안 보내고
 * 있어도 화면에는 아무 일도 일어나지 않는다. 반년 뒤 "탭을 합치자" 할 때
 * 빈 표를 보게 된다. 그래서 '보내지는지'를 배포 전에 눈이 아니라 기계가 센다.
 *
 * 사용: node scripts/check-tab-usage.mjs <BASE>
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
let bad = 0
const fail = (m) => { console.log('FAIL ' + m); bad++ }
const ok = (m) => console.log('  OK  ' + m)

const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })

const posted = []
page.on('request', r => {
  if (r.url().includes('/api/usage/tab') && r.method() === 'POST') posted.push(r.url())
})

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    localStorage.setItem('authToken', (await r.json()).token)
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  for (const name of ['건너뛰기', '닫기']) {
    const b = page.getByRole('button', { name }).first()
    if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(300) }
  }

  // 포트폴리오에 3초 머문 뒤 분석으로 — 떠날 때 1건이 가야 한다
  await page.waitForTimeout(3200)
  await page.getByRole('button', { name: '분석' }).first().evaluate(el => el.click())
  await page.waitForTimeout(1500)
  if (posted.length === 0) fail('탭을 떠났는데 /api/usage/tab 요청이 없다')
  else ok(`탭 이동 시 기록 전송 ${posted.length}건`)

  // 2초 미만은 세지 않는다 — 빠르게 두 번 오가도 늘지 않아야 한다
  const before = posted.length
  await page.getByRole('button', { name: '관심' }).first().evaluate(el => el.click())
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '종목' }).first().evaluate(el => el.click())
  await page.waitForTimeout(1200)
  if (posted.length > before) fail('2초 미만 체류를 보냈다 (스쳐 지나간 탭)')
  else ok('스쳐 지나간 탭은 보내지 않는다')

  // 서버 집계에 실제로 들어갔나
  const agg = await page.evaluate(async () => {
    const r = await fetch('/api/usage/tabs?days=1', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('authToken') } })
    return r.json()
  })
  const tabs = (agg.items || []).map(i => i.tab)
  if (!tabs.length) fail('서버 집계가 비어 있다: ' + JSON.stringify(agg).slice(0, 200))
  else ok(`서버 집계 반영 — ${tabs.join(', ')} (분모 ${Math.round((agg.basis?.total_ms || 0) / 1000)}초)`)
  if (!agg.basis?.first_event_at) fail('기록 시작일이 응답에 없다 — 분모를 모르면 표를 읽을 수 없다')
  else ok('기준(basis) 동봉')
} catch (e) {
  fail('예외: ' + String(e.message).slice(0, 300))
} finally {
  if (errs.length) fail('콘솔 오류 ' + errs.length + '건:\n    ' + errs.join('\n    '))
  else ok('콘솔 오류 0건')
  await browser.close()
  console.log(bad ? `\n${bad}건 실패` : '\n전부 통과')
  process.exit(bad ? 1 : 0)
}

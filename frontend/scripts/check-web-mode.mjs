/**
 * 웹(데스크톱) 모드 검사 — 2026-11-03.
 *
 * 왜 생겼나: 네비를 재편하면서 **하단 바(모바일)만 고치고 사이드바(웹)를 빼먹었다.**
 * 오너는 PC 로 보는데 "반영됐다"고 보고했고, 화면은 옛 구조 그대로였다.
 * 리스크 목록에 'SideNavBar 도 같이' 라고 적어 두고도 놓쳤다 — 적어 두는 것으로는
 * 안 되고 **기계가 세야 한다.**
 *
 * 지금까지의 검사기는 전부 모바일 폭(390~412px)이었다. 이 검사기는 **1440px**로 연다.
 *
 * 사용: node scripts/check-web-mode.mjs <BASE>
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
let bad = 0
const fail = (m) => { console.log('FAIL ' + m); bad++ }
const ok = (m) => console.log('  OK  ' + m)

const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) })

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    localStorage.setItem('authToken', (await r.json()).token)
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3200)
  for (const n of ['건너뛰기', '닫기']) {
    const b = page.getByRole('button', { name: n }).first()
    if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(400) }
  }

  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.side-nav-btn')]
      .map(b => (b.textContent || '').trim()).filter(Boolean))
  if (!labels.length) { fail('사이드바를 찾지 못했다 (웹 모드가 아닌가?)'); throw new Error('stop') }
  console.log('  사이드바: ' + labels.join(' · '))

  // 이름이 바뀌었는가
  if (labels.includes('포트폴리오')) fail("사이드바에 옛 이름 '포트폴리오' 가 남아 있다")
  else ok("'계좌' 로 바뀌었다")

  // 주 5개가 앞에 오는가 — 모바일 하단 바와 같은 순서여야 한다
  const want = ['계좌', '관심', '발굴', '시장', '설정']
  const head = labels.slice(0, 5)
  if (JSON.stringify(head) !== JSON.stringify(want))
    fail(`주 5개 순서가 하단 바와 다르다: ${head.join('·')} (기대 ${want.join('·')})`)
  else ok('주 5개 순서가 하단 바와 같다')

  // 부 항목도 도달 가능해야 한다 (데스크톱은 폭이 넉넉하니 숨기지 않는다)
  for (const k of ['분석', '종목', '등록', '가이드']) {
    if (!labels.includes(k)) fail(`'${k}' 로 가는 길이 사이드바에 없다`)
  }
  ok('분석·종목·등록·가이드 모두 사이드바에 있다')

  // 실제로 눌러서 화면이 바뀌는가 (분석)
  const an = page.locator('.side-nav-btn', { hasText: '분석' }).first()
  if (await an.count()) {
    await an.evaluate(el => el.click())
    await page.waitForTimeout(3000)
    const seg = await page.getByRole('button', { name: 'Ⅱ 진단', exact: true }).count()
    if (!seg) fail('사이드바 분석을 눌렀는데 장 세그먼트가 안 보인다')
    else ok('사이드바 분석 → 장 세그먼트 렌더')
  }
} catch (e) {
  if (String(e.message) !== 'stop') fail('예외: ' + String(e.message).slice(0, 240))
} finally {
  if (errs.length) fail('콘솔/페이지 오류 ' + errs.length + '건:\n    ' + errs.slice(0, 4).join('\n    '))
  else ok('콘솔 오류 0건')
  await browser.close()
  console.log(bad ? `\n${bad}건 실패` : '\n전부 통과')
  process.exit(bad ? 1 : 0)
}

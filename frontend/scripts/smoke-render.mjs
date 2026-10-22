/**
 * 배포 후 '앱이 실제로 뜨는가' 검사 — 2026-10-12 사고의 재발 방지.
 *
 * 왜 필요한가: 그날 스모크는 `/` 200, `/api/sectors` 200, 프리캐시 36건 200 을 전부 통과했다.
 * 그런데 홈 화면 앱은 열리지 않았다. **파일이 서빙된다는 것과 앱이 동작한다는 것은 다르다.**
 * HTTP 200 은 "서버가 바이트를 줬다"는 뜻일 뿐, 그 바이트가 실행돼 화면이 그려졌다는 보장이 없다.
 *
 * 그래서 진짜 브라우저로 ① 로그인 전 ② 데모 로그인 후 ③ 모든 탭을 눌러 보고,
 * 콘솔 오류·pageerror 가 하나라도 있으면 **배포를 실패로 만든다**.
 *
 * 서비스워커까지 켠 채로 돈다 — PWA 경로가 깨지는 사고였기 때문이다.
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'https://daonwealth.com'
const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1 }

const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'allow',
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 })
  let kids = await page.evaluate(() => document.getElementById('root')?.children.length ?? -1)
  if (kids < 1) fail('로그인 전 화면이 비어 있다 (#root 자식 ' + kids + ')')
  else console.log('  OK  로그인 전 렌더')

  // 데모 계정으로 로그인 후 경로까지 — 사고는 로그인한 사용자에게서 났다
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    localStorage.setItem('authToken', (await r.json()).token)
  })
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  kids = await page.evaluate(() => document.getElementById('root')?.children.length ?? -1)
  if (kids < 1) fail('로그인 후 화면이 비어 있다')
  else console.log('  OK  로그인 후 렌더')

  const names = await page.$$eval('.nav-btn', ns => ns.map(n => n.textContent.trim()))
  if (!names.length) fail('하단 네비가 그려지지 않았다')
  for (let i = 0; i < names.length; i++) {
    await page.$$eval('.nav-btn', (ns, k) => ns[k]?.click(), i)
    await page.waitForTimeout(1200)
    const k2 = await page.evaluate(() => document.getElementById('root')?.children.length ?? -1)
    if (k2 < 1) fail('탭 "' + (names[i] || i) + '" 에서 화면이 비었다')
  }
  console.log('  OK  탭 ' + names.length + '개 전환')

  // 서비스워커가 실제로 활성화되는가 (프리캐시 404 사고의 직접 지표)
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration('/')
    return r ? (r.active ? 'active' : (r.installing?.state || r.waiting?.state || 'none')) : 'none'
  })
  if (sw !== 'active') fail('서비스워커가 활성화되지 않았다 (' + sw + ') — PWA 가 깨진다')
  else console.log('  OK  서비스워커 활성')

  // 하단 네비 가로 끌기 — 2026-10-12 사고: touch-action:pan-y 가 남아 있어
  // 브라우저도 JS 도 가로 제스처를 처리하지 않는 '아무도 스크롤하지 않는' 상태였다.
  // 눈으로는 "그냥 안 움직인다"로만 보여 두 번 놓쳤다 — scrollLeft 를 숫자로 센다.
  try {
    await page.evaluate(() => { document.querySelectorAll('.tour-root,.tour-scrim').forEach(e => e.remove()) })
    const box = await page.locator('.nav-strip').boundingBox()
    const geo = await page.evaluate(() => {
      const s = document.querySelector('.nav-strip')
      return { hidden: s.scrollWidth - s.clientWidth, ta: getComputedStyle(s).touchAction }
    })
    if (geo.hidden > 20) {
      const cdp = await ctx.newCDPSession(page)
      const y = Math.round(box.y + box.height / 2), x0 = Math.round(box.x + box.width * 0.85)
      const tabBefore = await page.evaluate(() => document.querySelector('.nav-btn.active')?.textContent?.trim())
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 20, y }] })
        await page.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(800)
      const sl = await page.evaluate(() => document.querySelector('.nav-strip').scrollLeft)
      const tabAfter = await page.evaluate(() => document.querySelector('.nav-btn.active')?.textContent?.trim())
      // ⚠ CDP 터치 이벤트는 touch-action 을 **무시한다** — 시뮬레이션만으로는
      //   pan-y 같은 설정 오류를 못 잡는다(실측: 고치기 전 운영에서도 통과했다).
      //   그래서 실제 기기에서 가로 제스처를 결정하는 값을 직접 본다.
      if (!/pan-x|manipulation|auto/.test(geo.ta))
        fail('하단 네비 touch-action=' + geo.ta + ' — 실기기에서 가로로 끌리지 않는다')
      else if (sl < 20) fail('하단 네비를 끌어도 움직이지 않는다')
      else if (tabBefore !== tabAfter) fail('끌기만 했는데 탭이 바뀌었다 — 끌기는 고르는 동작이 아니다')
      else console.log('  OK  하단 네비 끌기 (touch-action=' + geo.ta + ', scrollLeft ' + Math.round(sl) + ', 탭 유지)')
    }
  } catch (e) { console.log('  경고: 네비 끌기 검사 실패 - ' + String(e.message).slice(0, 100)) }

  if (errs.length) {
    fail('실행 중 오류 ' + errs.length + '건')
    errs.slice(0, 6).forEach(e => console.log('        ' + e))
  } else console.log('  OK  콘솔 오류 없음')
} catch (e) {
  fail('검사 자체가 실패: ' + String(e.message).slice(0, 180))
} finally {
  await browser.close()
}

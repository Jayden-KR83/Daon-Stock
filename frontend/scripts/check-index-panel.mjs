/**
 * 지수 알림 패널이 실제로 뜨는지 — 로컬 서버에 진짜 브라우저로 확인.
 * 412px(모바일 폭)에서 ① 패널 렌더 ② 12개 행 ③ 라벨·입력칸 시작 x 정렬
 * ④ 가로 넘침 없음 ⑤ 콘솔 오류 0건 ⑥ 저장/토글이 서버에 실제로 반영.
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
let bad = 0
const fail = (m) => { console.log('FAIL ' + m); bad++ }
const ok = (m) => console.log('  OK  ' + m)

const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    localStorage.setItem('authToken', (await r.json()).token)
  })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)

  // 1) API 응답 자체
  const api = await page.evaluate(async () => {
    const r = await fetch('/api/alerts/index', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('authToken') } })
    return { status: r.status, body: await r.json() }
  })
  if (api.status !== 200) fail('GET /api/alerts/index → ' + api.status)
  else if (!Array.isArray(api.body.items) || api.body.items.length !== 12)
    fail('지수 항목 수: ' + JSON.stringify(api.body).slice(0, 200))
  else ok('GET /api/alerts/index — 12개 지수, 기본 켜짐 '
    + api.body.items.filter(i => i.enabled).length + '개')

  // 2) 알림 벨 → 설정 탭
  const bell = page.locator('button[aria-label*="알림"], button[title*="알림"]').first()
  if (await bell.count() === 0) fail('알림 벨 버튼을 못 찾았다')
  // 모바일 레이아웃에서 벨은 애니메이션 중일 수 있어 DOM click 으로 직접 연다
  await bell.evaluate(el => el.click())
  await page.waitForTimeout(900)
  // 시트의 '설정 (n)' 탭 — 하단 내비에도 '설정' 버튼이 있어 이름을 좁힌다
  await page.getByRole('button', { name: /^설정 \(/ }).first()
    .evaluate(el => el.click())
  await page.waitForTimeout(1200)

  const panel = page.locator('text=지수 알림').first()
  if (await panel.count() === 0) fail('지수 알림 패널이 화면에 없다')
  else ok('지수 알림 패널 렌더')

  // 3) 12개 행 — 임계 입력칸 개수로 센다.
  //    선택자는 data-index-ticker 다. 급등락 패널에도 aria-label '임계 변동률(%)' 입력칸이
  //    있어서 그걸로 고르면 13개가 잡히고, 첫 번째가 급등락 쪽이라 엉뚱한 칸을 채운다.
  const inputs = page.locator('input[data-index-ticker]')
  const n = await inputs.count()
  if (n !== 12) fail('임계 입력칸 ' + n + '개 (12개여야 한다)')
  else ok('지수 12행 모두 렌더')

  // 4) 정렬 — 라벨과 입력칸의 시작 x 가 행마다 같아야 한다
  const xs = await page.evaluate(() => {
    const out = { label: [], input: [] }
    for (const el of document.querySelectorAll('input[data-index-ticker]')) {
      out.input.push(Math.round(el.getBoundingClientRect().left))
      const row = el.closest('div[style*="grid-template-columns"]')
      if (row) out.label.push(Math.round(row.firstElementChild.getBoundingClientRect().left))
    }
    return out
  })
  const uniq = a => [...new Set(a)]
  if (uniq(xs.label).length !== 1) fail('라벨 시작 x 가 어긋난다: ' + uniq(xs.label))
  else if (uniq(xs.input).length !== 1) fail('입력칸 시작 x 가 어긋난다: ' + uniq(xs.input))
  else ok('정렬 — 라벨 x=' + xs.label[0] + ' · 입력칸 x=' + xs.input[0] + ' (12행 동일)')

  // 5) 412px 에서 가로 넘침
  const over = await page.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('input[data-index-ticker]')) {
      const row = el.closest('div[style*="grid-template-columns"]')
      if (!row) continue
      const r = row.getBoundingClientRect()
      if (r.right > window.innerWidth + 1 || row.scrollWidth > row.clientWidth + 1)
        bad.push(el.getAttribute('aria-label'))
    }
    return bad
  })
  if (over.length) fail('412px 에서 넘침: ' + over.join(', '))
  else ok('412px 가로 넘침 없음')

  // 6) 저장이 서버까지 — VIX 임계를 바꿔 저장한 뒤 다시 읽는다.
  //    first() 를 쓰면 안 된다 — 첫 칸은 S&P500 이다(마켓바 순서). 티커로 겨냥한다.
  const vix = page.locator('input[data-index-ticker="^VIX"]')
  // 지금 값과 다른 값을 넣어야 '변경됨'이 된다 — 같은 값을 넣으면 저장 버튼이
  // 비활성이고, 그걸 '저장 실패'로 읽으면 검사기가 거짓 신고를 한다.
  const cur = Number(await vix.inputValue())
  const target = cur === 7.5 ? 6 : 7.5
  await vix.fill(String(target))
  const save = page.getByRole('button', { name: /^저장 \(/ }).first()
  if (await save.count() === 0) fail('임계를 바꿨는데 저장 버튼이 활성화되지 않았다')
  else {
    await save.click()
    await page.waitForTimeout(1500)
    const after = await page.evaluate(async () => {
      const r = await fetch('/api/alerts/index', {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('authToken') } })
      return (await r.json()).items.find(i => i.ticker === '^VIX')
    })
    if (after?.threshold_pct !== target)
      fail('저장이 서버에 반영되지 않았다: ' + JSON.stringify(after))
    else ok('임계 저장 → 서버 반영 (VIX ' + cur + '% → ' + target
      + '%, customized=' + after.customized + ')')
  }

  // 7) 기본값으로 되돌리기
  await page.getByRole('button', { name: '기본값으로' }).first().click()
  await page.waitForTimeout(1500)
  const reset = await page.evaluate(async () => {
    const r = await fetch('/api/alerts/index', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('authToken') } })
    return (await r.json()).items.find(i => i.ticker === '^VIX')
  })
  if (reset?.threshold_pct !== 10 || reset?.customized !== false)
    fail('기본값 되돌리기 실패: ' + JSON.stringify(reset))
  else ok('기본값으로 → VIX 10% 복구')

  await page.screenshot({ path: process.argv[3] || 'index-panel.png', fullPage: false })
} catch (e) {
  fail('예외: ' + String(e.message).slice(0, 300))
} finally {
  if (errs.length) fail('콘솔/페이지 오류 ' + errs.length + '건:\n    ' + errs.join('\n    '))
  else ok('콘솔 오류 0건')
  await browser.close()
  console.log(bad ? `\n${bad}건 실패` : '\n전부 통과')
  process.exit(bad ? 1 : 0)
}

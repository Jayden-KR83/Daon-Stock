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

  /* 2026-11-05 — 이 검사는 **방향이 뒤집혔다.**
     전에는 "분석·등록·가이드가 사이드바에 있어야 한다"를 지켰다. 오너가 같은
     지시를 두 번 했다: 분석은 계좌에, 등록·여정·가이드는 설정에. 그러니 이제
     그 넷이 사이드바에 **없어야** 한다.

     검사기를 안 고쳤다면 오너가 시킨 변경이 '회귀'로 보고되고, 되돌리는 쪽이
     '통과'가 된다 — 검사기가 폐기된 결정을 지키는 형태다.

     ⚠ 옛 코드에는 버그도 있었다: for 루프에서 fail() 을 여러 번 부른 뒤
       조건 없이 ok('…모두 있다') 를 찍었다. 실패 3건과 "모두 있다"가 **같은
       화면에 나란히 찍혔다.** 실패 여부로 분기한다. */
  const MUST_NOT = ['분석', '등록', '가이드', '여정']
  const leftovers = MUST_NOT.filter(k => labels.includes(k))
  if (leftovers.length)
    fail(`사이드바에 아직 남아 있다: ${leftovers.join('·')} — 분석은 계좌, 나머지는 설정으로 갔다`)
  else ok('분석·등록·가이드·여정이 사이드바에서 빠졌다 (각자 새 자리로)')

  // 뺐으면 **다른 길이 있어야** 한다. 숨기는 것이 목적이 아니다.
  const goTab = async (name) => {
    const b = page.locator('.side-nav-btn', { hasText: name }).first()
    if (!await b.count()) return false
    await b.evaluate(el => el.click()); await page.waitForTimeout(2500)
    return true
  }

  // 분석 → 계좌 탭의 진입 버튼
  if (await goTab('계좌')) {
    const an = page.getByRole('button', { name: /보유 종목 종합 분석/ }).first()
    if (!await an.count()) fail('계좌에 분석 진입 버튼이 없다 — 분석으로 가는 길이 끊겼다')
    else {
      await an.evaluate(el => el.click()); await page.waitForTimeout(3000)
      const seg = await page.getByRole('button', { name: 'Ⅱ 진단', exact: true }).count()
      if (!seg) fail('계좌 → 분석을 눌렀는데 장 세그먼트가 안 보인다')
      else ok('계좌 → 보유 종목 종합 분석 → 분석 렌더')
    }
  }

  // 등록·가이드 → 설정 탭의 바로가기 카드
  if (await goTab('설정')) {
    for (const name of ['종목 등록', '가이드']) {
      const b = page.getByRole('button', { name: new RegExp(name) }).first()
      if (!await b.count()) fail(`설정 바로가기에 '${name}' 이 없다`)
      else ok(`설정 → ${name} 진입 있음`)
    }
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

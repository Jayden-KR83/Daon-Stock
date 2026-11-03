/**
 * 분석 탭 장 세그먼트 — 네 장이 전부 열리는가 (2026-11-03).
 *
 * Ⅰ·Ⅱ·Ⅲ·부록을 한 스크롤에서 네 칸으로 갈랐다. 가르는 작업은 JSX 조각을
 * 조건부로 감싸는 일이라, **빌드는 통과하는데 특정 장만 백지**가 되기 쉽다
 * (실제로 이 탭은 TDZ 로 두 번 통째로 죽었다).
 *
 * 그래서 네 장을 하나씩 눌러 ① 내용이 있는가 ② 콘솔 오류가 없는가 를 센다.
 * 공통 영역(AI 실행 버튼·계좌 선택기)이 **모든 장에서 보이는지**도 확인한다 —
 * 그게 이번 설계의 전제였다(Ⅱ 로 들어온 사람이 버튼을 못 찾으면 안 된다).
 *
 * 사용: node scripts/check-analysis-chapters.mjs <BASE>
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://127.0.0.1:8599'
let bad = 0
const fail = (m) => { console.log('FAIL ' + m); bad++ }
const ok = (m) => console.log('  OK  ' + m)

const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 180)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 180)) })

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    localStorage.setItem('authToken', (await r.json()).token)
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  for (const n of ['건너뛰기', '닫기']) {
    const b = page.getByRole('button', { name: n }).first()
    if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(400) }
  }

  // 계좌 → 분석
  const enter = page.getByRole('button', { name: /보유 종목 종합 분석/ }).first()
  if (await enter.count() === 0) { fail('계좌에 분석 진입 버튼이 없다'); throw new Error('stop') }
  await enter.evaluate(el => el.click())
  await page.waitForTimeout(4000)

  const CHAPTERS = ['Ⅰ 상태', 'Ⅱ 진단', 'Ⅲ 제안', '부록']
  for (const label of CHAPTERS) {
    const b = page.getByRole('button', { name: label, exact: true }).first()
    if (await b.count() === 0) { fail(`세그먼트 '${label}' 버튼이 없다`); continue }
    await b.evaluate(el => el.click())
    await page.waitForTimeout(2600)

    // 장 본문만 잰다 — data-chapter 표식 안쪽. 공통 영역(세그먼트·AI 버튼)은 빠진다.
    // 처음엔 .mono-card 개수로 셌는데 부록은 카드를 안 써서 거짓 신고했다(검사기 오류).
    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-chapter]')
      if (!el) return null
      return { key: el.getAttribute('data-chapter'),
               len: (el.innerText || '').trim().length,
               nodes: el.querySelectorAll('*').length }
    })
    if (!info) fail(`'${label}' 장 본문(data-chapter)이 없다`)
    // 임계는 낮게 — 부록처럼 **원래 내용이 적은 장**이 있다(리포트 전에는 버튼 하나).
    // 높게 잡으면 멀쩡한 장을 '비었다'고 신고한다(2026-11-03 실제로 그랬다).
    // 여기서 잡으려는 것은 '적은 장'이 아니라 **통째로 안 그려진 장**이다.
    else if (info.len < 10 || info.nodes < 2)
      fail(`'${label}' 장이 비었다 (글자 ${info.len} · 요소 ${info.nodes})`)
    else ok(`'${label}' 장 렌더 (글자 ${info.len} · 요소 ${info.nodes})`)

    // 공통 영역 — 모든 장에서 AI 실행 버튼이 보여야 한다
    const aiBtn = await page.getByRole('button', { name: /AI 전략 분석|최신 정보로 업데이트/ }).count()
    if (aiBtn === 0) fail(`'${label}' 장에서 AI 실행 버튼이 사라졌다 — 설계 전제가 깨졌다`)
  }
  ok('AI 실행 버튼이 네 장 모두에서 보인다')

  // 돌아가기
  const back = page.getByRole('button', { name: /계좌.*돌아가기/ }).first()
  if (await back.count() === 0) fail('분석에서 돌아갈 길이 없다')
  else ok('‹계좌 돌아가기 있음')
} catch (e) {
  if (String(e.message) !== 'stop') fail('예외: ' + String(e.message).slice(0, 240))
} finally {
  if (errs.length) fail('콘솔/페이지 오류 ' + errs.length + '건:\n    ' + errs.slice(0, 4).join('\n    '))
  else ok('콘솔 오류 0건')
  await browser.close()
  console.log(bad ? `\n${bad}건 실패` : '\n전부 통과')
  process.exit(bad ? 1 : 0)
}

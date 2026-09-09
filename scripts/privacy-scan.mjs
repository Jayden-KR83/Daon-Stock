/* ══════════════════════════════════════════════════════════════
   가림(privacy) 모드 누수 검사
   ══════════════════════════════════════════════════════════════
   2026-08-26 개인 자산 노출 사고의 재발 방지 검사다.

   사고 경위: 오너가 자기 PC에서 앱을 띄워 팀에 기능 시연을 했다. 가림 모드는
   켜져 있었고 포트폴리오 탭은 ₩••• 로 잘 가려져 있었다. 그런데 분석 탭으로
   넘어가는 순간 AI 리포트 본문·자산 추이 차트 축·계좌별 예수금에 실제 금액이
   그대로 찍혔다. 화면에 '가림' 이라고 적혀 있어서 안전하다고 믿은 것이 문제를
   키웠다.

   이 스크립트는 가림을 켠 상태로 모든 탭을 돌며 금액 패턴이 남아 있는지 센다.
   하나라도 있으면 실패한다.

   실행:
     node scripts/privacy-scan.mjs                    # http://localhost:3000
     node scripts/privacy-scan.mjs https://daonwealth.com

   필요 패키지: playwright-core (시스템에 설치된 Edge/Chrome 을 그대로 쓴다.
   브라우저를 따로 내려받지 않는다.)
   ══════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://localhost:3000'
const EDGE = process.env.DAON_BROWSER
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const TABS = ['포트폴리오', '분석', '종목', '관심', '발굴', '시장', '등록', '설정', '가이드']

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: 'ko-KR' })
const page = await ctx.newPage()

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.evaluate(() => {
  localStorage.setItem('daon.tour.v1.demo', 'done')
  localStorage.setItem('daon_last_seen_version', 'dismissed')
})
await page.getByText('데모 둘러보기', { exact: false }).first().click()
await page.waitForSelector('.hero-card', { timeout: 40000 })
await page.waitForTimeout(3000)

// 가림이 꺼져 있으면 켠다 (기본값은 켜짐)
const pv = page.locator('[data-tour="privacy"]')
if (await pv.count() && (await pv.innerText()).includes('표시')) {
  await pv.click()
  await page.waitForTimeout(900)
}

const findings = []
for (const tab of TABS) {
  const loc = page.locator('.nav-btn', { hasText: tab }).first()
  if (!(await loc.count())) continue
  await loc.click()
  // 분석 탭은 AI 리포트·차트가 늦게 붙는다
  await page.waitForTimeout(tab === '분석' ? 12000 : 4500)
  const hits = await page.evaluate(() => {
    const t = document.body.innerText
    /* (?<![\d,.조억만]) — 더 큰 숫자의 '안쪽'을 잘라 잡지 않게 한다.
       "기아 매출 33조370억원" 에서 370억 을 떼어내 개인 자산으로 오인한 적이 있다
       (2026-09-09 레이더 1주차). AI 리포트 산문에는 공개 기업 실적이 섞여 들어온다.
       왼쪽 경계만 막았을 뿐 그물은 그대로다 — "1억2,000만원" 이면 1억 쪽이 여전히 걸린다. */
    const pats = [
      /₩\s?\d[\d,]{5,}/g,                    // ₩131,217,292
      /(?<![\d,.조억만])\d+(\.\d+)?억/g,      // 1.37억
      /(?<![\d,.조억만])[\d,]{4,}만\s?원?/g,  // 1,250만원
    ]
    const out = []
    for (const re of pats) out.push(...(t.match(re) || []))
    return [...new Set(out)]
  })
  if (hits.length) findings.push({ tab, hits: hits.slice(0, 8), n: hits.length })
  process.stdout.write(`${tab}: ${hits.length ? '❌ ' + hits.length : '✅'}\n`)
}

await browser.close()

if (findings.length) {
  console.error('\n🔴 가림 모드인데 금액이 보입니다 — 개인 자산 노출 경로입니다.')
  for (const f of findings) console.error(`  ${f.tab}: ${f.hits.join(', ')}${f.n > 8 ? ' …' : ''}`)
  console.error('\n금액을 찍는 자리는 src/utils/privacy.js 의 usePrivacy()/maskText() 를 거쳐야 합니다.')
  process.exit(1)
}
console.log('\n✅ 모든 탭에서 금액이 가려졌습니다.')

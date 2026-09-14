/* ══════════════════════════════════════════════════════════════
   탭 간 숫자 일치 검사 — 같은 것을 가리키는 숫자는 같아야 한다
   ══════════════════════════════════════════════════════════════
   2026-09-14 사고: 분석 탭 '자산 추이'가 128,664,640 을 크게 띄우는데
   포트폴리오 탭 총자산은 134,728,855 였다. 차이는 예수금 6,049,232 원.
   원인은 계산 실수가 아니라 **이름**이었다 — 일별 스냅샷은 예수금을 저장한 적이
   없어서 그 숫자는 주식 평가액인데, 카드 제목이 '자산 추이'였다.

   그래서 이 검사기는 "계산이 맞나"가 아니라 **"같은 이름의 숫자가 화면마다
   같은가"** 를 본다. 틀린 계산보다 같은 말로 다른 것을 가리키는 쪽이 더 위험하다.
   사용자는 계산을 검산하지 않지만 두 화면을 나란히 보기 때문이다.

   실행: node scripts/number-consistency.mjs https://daonwealth.com
   ══════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://localhost:3000'
const EDGE = process.env.DAON_BROWSER
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

/* 허용 오차 — 탭을 옮기는 사이에도 시세는 움직인다.
   그 흔들림을 결함으로 신고하면 검사기는 곧 무시당한다.
   0.5% 는 몇 초 사이 주가 변동은 통과시키고, 예수금 누락(보통 3~5%)은 잡는다. */
const TOLERANCE = 0.005

const findings = []
const add = (what, detail) => findings.push({ what, detail })

const won = n => '₩' + Math.round(n).toLocaleString()

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })
const page = await ctx.newPage()

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.evaluate(() => {
  localStorage.setItem('daon.tour.v1.demo', 'done')
  localStorage.setItem('daon_last_seen_version', 'dismissed')
})
await page.getByText('데모 둘러보기', { exact: false }).first().click()
await page.waitForSelector('.hero-card', { timeout: 40000 })
await page.waitForTimeout(2500)

// 가림 모드면 숫자를 읽을 수 없다 — 끈다
const pv = page.locator('.top-nav-privacy-btn')
if (await pv.count() && (await pv.getAttribute('aria-pressed')) === 'true') {
  await pv.click()
  await page.waitForTimeout(800)
}

const num = s => Number(String(s).replace(/[^\d]/g, ''))

/* ── ① 포트폴리오 탭: 총자산 = 주식 + 예수금 ───────────────────── */
/* 히어로 카드 안에서만 읽는다. 문서 전체에서 '총 자산'을 찾으면 계좌별 카드의
   같은 라벨이 먼저 걸려 엉뚱한 숫자를 비교하게 된다(첫 실행에서 실제로 그랬다). */
const pf = await page.evaluate(() => {
  const hero = document.querySelector('.hero-card')
  if (!hero) return null
  const t = hero.innerText
  const m = t.match(/총 ?자산\s*₩\s?([\d,]+)[\s\S]{0,60}?주식\s*₩\s?([\d,]+)[\s\S]{0,40}?예수금\s*₩\s?([\d,]+)/)
  return m ? { total: m[1], stock: m[2], cash: m[3] } : null
})
if (!pf) {
  add('포트폴리오 총자산을 읽지 못함', '화면 구조가 바뀌었을 수 있다 — 검사기를 고칠 것')
} else {
  const total = num(pf.total), stock = num(pf.stock), cash = num(pf.cash)
  if (Math.abs(total - (stock + cash)) > 1) {
    add('포트폴리오 탭 내부 불일치',
        `총자산 ${won(total)} ≠ 주식 ${won(stock)} + 예수금 ${won(cash)}`)
  }
  console.log(`포트폴리오: 총자산 ${won(total)} = 주식 ${won(stock)} + 예수금 ${won(cash)}`)

  /* ── ② 분석 탭: 같은 총자산에 도달하는가 ──────────────────────── */
  await page.locator('.side-nav-btn', { hasText: '분석' }).first().click()
  await page.waitForTimeout(20000)

  const al = await page.evaluate(() => {
    const t = document.body.innerText
    // '주식 평가액 추이' 카드의 현재값 + 그 아래 총자산 표기
    const head = t.match(/주식 평가액 추이\s*₩\s?([\d,]+)/)
    const tie  = t.match(/예수금\s*₩\s?([\d,]+)\s*=\s*총자산\s*₩\s?([\d,]+)/)
    return { head: head ? head[1] : null, cash: tie ? tie[1] : null, total: tie ? tie[2] : null }
  })

  if (!al.head) {
    add('분석 탭에서 평가액 카드를 읽지 못함', '카드 제목이 바뀌었는지 확인할 것')
  } else if (!al.total) {
    add('분석 탭에 총자산 연결 표기가 없다',
        `평가액 ${won(num(al.head))} 만 보이면 포트폴리오 총자산과 달라 보인다`)
  } else {
    const aTotal = num(al.total), aStock = num(al.head), aCash = num(al.cash)
    console.log(`분석      : 총자산 ${won(aTotal)} = 주식 ${won(aStock)} + 예수금 ${won(aCash)}`)

    if (Math.abs(aCash - cash) > 1) {
      add('예수금이 탭마다 다르다', `포트폴리오 ${won(cash)} vs 분석 ${won(aCash)}`)
    }
    const diff = Math.abs(aTotal - total)
    if (diff / Math.max(total, 1) > TOLERANCE) {
      add('총자산이 탭마다 다르다',
          `포트폴리오 ${won(total)} vs 분석 ${won(aTotal)} — 차이 ${won(diff)}`)
    }
  }
}

await browser.close()

console.log(`\n탭 간 숫자 일치 검사 — ${findings.length}건\n`)
for (const f of findings) {
  console.log(`🔴 ${f.what}`)
  console.log(`   ${f.detail}`)
}
if (!findings.length) console.log('✅ 같은 이름의 숫자가 탭마다 일치한다')
console.log('\n※ 계산의 정확성은 검사하지 않는다. 같은 이름이 다른 것을 가리키는 경우만 잡는다.')

process.exit(findings.length ? 1 : 0)

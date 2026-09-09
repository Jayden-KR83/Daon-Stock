/* ══════════════════════════════════════════════════════════════════════
   다온 자가 UX 점검 — "지인이 말하기 전에 내가 먼저 본다"
   ══════════════════════════════════════════════════════════════════════
   2026-09-09 지인 피드백 10건이 왔다. 그중 6건은 **기계가 잡을 수 있는 것**이었다.

     · Market Status 가 화면 밖 57px 에 있어 영영 안 보임      → 화면 밖 요소 검사
     · '김은숙'이 '김은'으로 잘림                              → 텍스트 잘림 검사
     · 두 번째 행부터도 예시 placeholder 가 남아 헷갈림        → placeholder 반복 검사
     · 포트폴리오에서 종목 추가로 가는 길이 없음               → 진입 경로 검사
     · 가림 모드를 분석 탭에서 끌 수 없음                      → 전역 모드 스위치 검사
     · 평단 기준선이 없어 손익이 안 읽힘                       → (수동)

   공통점: **전부 "화면을 처음 보는 사람" 시점의 문제**다. 개발자는 자기가 만든
   화면을 이미 알기 때문에 안 보인다. 그래서 사람의 눈이 아니라 규칙으로 잡는다.

   ⚠ 이 검사는 '보기 좋은가'를 판정하지 않는다. 그건 기계가 못 한다.
     판정하는 것은 **"물리적으로 볼 수 없는가 / 닿을 수 없는가 / 오해를 부르는가"** 뿐이다.

   실행:
     node scripts/ux-firstuse.mjs                     # http://localhost:3000
     node scripts/ux-firstuse.mjs https://daonwealth.com
   필요: playwright-core (시스템 Edge/Chrome 사용, 브라우저 다운로드 없음)
   ══════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'http://localhost:3000'
const EDGE = process.env.DAON_BROWSER
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const findings = []
const add = (sev, tab, what, detail) => findings.push({ sev, tab, what, detail })

/* ── 규칙 ①: 화면 밖에 있는데 스크롤로도 닿을 수 없는 요소 ────────────
   Market Status 가 딱 이랬다. 콘텐츠가 짧아 스크롤이 안 생기는데 요소는
   화면 아래에 있었다 — 사용자는 존재조차 알 수 없다. */
const RULE_OFFSCREEN = () => {
  const out = []
  const vh = window.innerHeight, vw = window.innerWidth
  const scrolls = (cs, n) => (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
                             && n.scrollHeight > n.clientHeight + 4

  /* 조상 중 하나가 overflow 를 잘라내는데 그 조상 바깥에 요소가 놓이면,
     그 요소는 존재하지만 영영 볼 수 없다. 문서가 길어져도 소용없다 —
     셸(.web-root/.web-body-grid)이 hidden 이라 스크롤 자체가 안 먹는다.
     2026-09-09 Market Status 결함의 실제 메커니즘이 이것이었다. */
  const clippedBy = (el) => {
    const r = el.getBoundingClientRect()
    let p = el.parentElement
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p)
      if (scrolls(cs, p)) return null                  // 스크롤로 닿는다 → 괜찮다
      if (cs.overflowY === 'hidden' || cs.overflowY === 'clip') {
        const pr = p.getBoundingClientRect()
        if (r.top >= pr.bottom - 4 || r.bottom <= pr.top + 4) {
          return String(p.className).slice(0, 30) || p.tagName.toLowerCase()
        }
      }
      p = p.parentElement
    }
    return null
  }

  /* 문서 스크롤로 닿을 수 있는가 — '길다'와 '스크롤된다'는 다르다. */
  const docScrollable = () => {
    const se = document.scrollingElement || document.documentElement
    const blocked = [document.documentElement, document.body]
      .some(n => ['hidden', 'clip'].includes(getComputedStyle(n).overflowY))
    return !blocked && se.scrollHeight > se.clientHeight + 4
  }
  const canScrollTo = (el) => {
    let p = el.parentElement
    while (p && p !== document.body) {
      if (scrolls(getComputedStyle(p), p)) return true
      p = p.parentElement
    }
    return docScrollable()
  }

  document.querySelectorAll('.card, .mono-card, section, [class*="status"], [class*="banner"]')
    .forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const cut = clippedBy(el)
      if (cut) {
        out.push({ cls: String(el.className).slice(0, 40),
                   text: (el.textContent || '').trim().slice(0, 40),
                   rect: `${cut} 가 잘라냄 (top ${Math.round(r.top)})` })
        return
      }
      const below = r.top >= vh, above = r.bottom <= 0, right = r.left >= vw
      if ((below || above || right) && !canScrollTo(el)) {
        out.push({ cls: String(el.className).slice(0, 40),
                   text: (el.textContent || '').trim().slice(0, 40),
                   rect: `화면 밖 ${Math.round(r.top)}~${Math.round(r.bottom)} / vh ${vh}` })
      }
    })
  return out
}

/* ── 규칙 ②: 사람 이름·라벨이 잘려 다른 말이 되는 곳 ──────────────────
   '김은숙' → '김은'. 줄임표(…) 없이 잘리면 사용자는 잘린 줄도 모른다. */
const RULE_TRUNCATED = () => {
  const out = []
  document.querySelectorAll('[class*="name"], [class*="user"], [class*="avatar"], [class*="label"]')
    .forEach(el => {
      if (el.children.length > 0) return          // 컨테이너는 건너뛴다
      const t = (el.textContent || '').trim()
      if (!t || t.length < 2) return
      const cs = getComputedStyle(el)
      const clipped = el.scrollWidth > el.clientWidth + 1
      const noEllipsis = cs.textOverflow !== 'ellipsis'
      if (clipped && noEllipsis) {
        out.push({ cls: String(el.className).slice(0, 40), text: t.slice(0, 30),
                   w: `${el.clientWidth}/${el.scrollWidth}` })
      }
    })
  return out
}

/* ── 규칙 ③: 여러 입력칸이 같은 예시를 반복해 '입력값처럼' 보이는 곳 ──
   두 번째 행부터 placeholder 가 남으면 이미 넣은 값인지 예시인지 구분이 안 된다. */
const RULE_PLACEHOLDER_REPEAT = () => {
  /* ⚠ '같은 화면에 같은 문구가 2번' 은 오탐이 난다. 한 행 안에서 종목명과 섹터가
     둘 다 "자동으로 채워집니다" 인 것은 정상이다(서로 다른 열, 같은 안내).
     진짜 문제는 **같은 열이 여러 행에서 같은 예시를 반복**하는 경우다 —
     그때만 "이미 입력한 값인가?" 하는 착각이 생긴다.
     늑대 소년이 된 검사기는 무시당한다. 규칙은 좁게 잡는다. */
  const rows = [...document.querySelectorAll('tr[data-rowkey]')]
  if (rows.length < 2) return []
  const byCol = {}
  rows.forEach(tr => {
    [...tr.querySelectorAll('input[placeholder]')].forEach((inp, col) => {
      const p = inp.placeholder.trim()
      if (!p) return
      byCol[col] = byCol[col] || {}
      byCol[col][p] = (byCol[col][p] || 0) + 1
    })
  })
  const out = []
  for (const [col, m] of Object.entries(byCol)) {
    for (const [p, n] of Object.entries(m)) {
      if (n >= 2) out.push({ placeholder: p.slice(0, 30), count: n, col })
    }
  }
  return out
}

/* ── 규칙 ④: 전역 모드인데 그 탭에서 끌 수 없는 스위치 ────────────────
   가림(privacy)이 전 화면에 걸리는데 스위치는 포트폴리오에만 있었다.
   모드를 켠 채 다른 탭으로 가면 빠져나올 방법이 없다 = 갇힌다. */
const RULE_GLOBAL_MODE_SWITCH = () => {
  const has = !!document.querySelector('.app-privacy-btn, [data-tour="privacy"]')
  return has ? [] : [{ mode: '가림(privacy)', detail: '이 탭에 해제 스위치가 없다' }]
}

const col2name = (c) => ['티커', '종목명', '수량', '평균단가', '섹터'][Number(c)] || `${c}번`

async function auditTab(page, tabName) {
  const off  = await page.evaluate(RULE_OFFSCREEN)
  const trun = await page.evaluate(RULE_TRUNCATED)
  const ph   = await page.evaluate(RULE_PLACEHOLDER_REPEAT)
  const gm   = await page.evaluate(RULE_GLOBAL_MODE_SWITCH)
  off.forEach(o => add('high', tabName, '화면 밖 + 스크롤 불가', `${o.cls} "${o.text}" (${o.rect})`))
  trun.forEach(t => add('high', tabName, '텍스트 잘림(줄임표 없음)', `${t.cls} "${t.text}" ${t.w}`))
  ph.forEach(p => add('med', tabName, '같은 열의 placeholder 반복',
    `${col2name(p.col)} 열 "${p.placeholder}" ×${p.count}행 — 입력값으로 오해된다`))
  gm.forEach(g => add('med', tabName, '전역 모드 해제 불가', `${g.mode} — ${g.detail}`))
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: 'ko-KR' })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(e.message))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.evaluate(() => {
  localStorage.setItem('daon.tour.v1.demo', 'done')
  localStorage.setItem('daon_last_seen_version', 'dismissed')
})
await page.getByText('데모 둘러보기', { exact: false }).first().click()
await page.waitForSelector('.hero-card', { timeout: 40000 })
await page.waitForTimeout(3000)

/* ── 규칙 ⑤: 핵심 작업에 도달하는 길이 있는가 ────────────────────────
   "종목을 추가하려면 등록 탭으로 가세요"라는 안내만 있고 버튼이 없으면
   그건 길이 아니다. 첫 화면에서 손이 닿아야 한다. */
const hasAddPath = await page.locator('button', { hasText: '종목 추가' }).count()
if (!hasAddPath) add('high', '포트폴리오', '핵심 작업 진입 경로 없음', '종목 추가로 가는 버튼이 없다')

for (const tab of ['포트폴리오', '분석', '종목', '관심', '등록', '설정']) {
  const loc = page.locator('.nav-btn', { hasText: tab }).first()
  if (!(await loc.count())) continue
  await loc.click()
  await page.waitForTimeout(tab === '분석' ? 9000 : 4000)
  await auditTab(page, tab)
}

// 웹 모드(넓은 화면)에서도 한 번 — 우측 패널은 여기서만 존재한다
await ctx.close()
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })
const page2 = await ctx2.newPage()
page2.on('pageerror', e => pageErrors.push(e.message))
await page2.goto(BASE, { waitUntil: 'domcontentloaded' })
await page2.waitForTimeout(1500)
await page2.evaluate(() => {
  localStorage.setItem('daon.tour.v1.demo', 'done')
  localStorage.setItem('daon_last_seen_version', 'dismissed')
})
await page2.getByText('데모 둘러보기', { exact: false }).first().click()
await page2.waitForSelector('.hero-card', { timeout: 40000 })
await page2.waitForTimeout(4000)
await auditTab(page2, '웹(1440)')

/* ── 자기검사 — 규칙이 아직 '잡을 줄 아는지' 확인한다 ────────────────────
   조용히 통과만 하는 검사기가 가장 위험하다. 규칙이 언젠가 선택자 변경 등으로
   아무것도 못 잡게 되면, 화면은 망가졌는데 검사는 초록불이 된다.
   그래서 2026-09-09 에 실제로 있었던 결함을 CSS 로 되살려, 규칙이 울리는지 본다.
   (실행 인자 --selftest 로만 돈다 — 평소 점검 결과를 오염시키지 않는다) */
if (process.argv.includes('--selftest')) {
  await page2.addStyleTag({ content: `
    /* 옛 결함 재현: 우측 패널이 화면 아래로 삐져나가고 배너가 바닥에 붙는다 */
    /* 옛 CSS 그대로: 패널이 제 격자 칸보다 커지고, 배너는 그 바닥에 붙는다
       → 격자(.web-body-grid, overflow:hidden)가 배너를 잘라 먹는다 */
    .right-panel { display: flex !important; flex-direction: column !important;
                   height: calc(100vh + 120px) !important; align-self: flex-start !important; }
    /* order:9 로 다시 맨 아래로 돌려놓는다 — 배너를 맨 위로 올린 것이 고침이었으므로,
       그 고침을 되돌려야 옛 결함이 되살아난다. margin-top:auto 만으로는 재현되지 않는다. */
    .rp-market-status { order: 9 !important; margin-top: auto !important; }
  ` })
  await page2.waitForTimeout(600)
  const off = await page2.evaluate(RULE_OFFSCREEN)
  console.log(`
[자기검사] 화면 밖 규칙: ${off.length ? '✅ 잡음(' + off.length + '건)' : '🔴 못 잡음 — 규칙이 죽었다'}`)

  await page2.evaluate(() => {
    const el = document.querySelector('.top-nav-username')
    if (el) { el.style.maxWidth = '18px'; el.style.textOverflow = 'clip' }
  })
  await page2.waitForTimeout(300)
  const tr = await page2.evaluate(RULE_TRUNCATED)
  console.log(`[자기검사] 텍스트 잘림 규칙: ${tr.length ? '✅ 잡음(' + tr.length + '건)' : '🔴 못 잡음 — 규칙이 죽었다'}`)

  await page2.evaluate(() => {
    document.querySelectorAll('.app-privacy-btn, [data-tour="privacy"]').forEach(e => e.remove())
  })
  const gm = await page2.evaluate(RULE_GLOBAL_MODE_SWITCH)
  console.log(`[자기검사] 전역 모드 규칙: ${gm.length ? '✅ 잡음' : '🔴 못 잡음 — 규칙이 죽었다'}`)
}

await browser.close()

pageErrors.forEach(e => add('high', '-', '자바스크립트 오류', e.slice(0, 120)))

const high = findings.filter(f => f.sev === 'high')
const med  = findings.filter(f => f.sev === 'med')
console.log(`\n다온 자가 UX 점검 — 심각 ${high.length}건 · 주의 ${med.length}건\n`)
for (const f of [...high, ...med]) {
  console.log(`${f.sev === 'high' ? '🔴' : '🟡'} [${f.tab}] ${f.what}`)
  console.log(`   ${f.detail}`)
}
if (!findings.length) console.log('✅ 규칙 위반 없음')
console.log('\n※ 이 검사는 "보기 좋은가"를 판정하지 않는다. 볼 수 없거나 닿을 수 없거나')
console.log('   오해를 부르는 것만 잡는다. 나머지는 여전히 사람이 봐야 한다.')

process.exit(high.length ? 1 : 0)

/* 2026-07-30 변경분 동적 검증 (데모 모드, 로컬 8501)
 *   1) 로고 흰 배경/패딩 제거   2) 지수 배너 좌우 이동 버튼
 *   3) 하단 네비 전체 탭 스트립 + 활성 탭 자동 센터링
 *   4) 발굴탭 산정방식 기본 접힘  5) valuation 지표 클릭 → 설명 펼침
 *   6) 앱→웹 레이아웃 전환
 * 사용: node scripts/smoke-2026-07-30.js   (exit 0=PASS, 1=FAIL)
 */
const puppeteer = require('puppeteer-core')

const BASE = process.env.BASE || 'http://127.0.0.1:8501'
const CHROME_PATH = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const results = []
const ok   = (n, d = '') => { results.push(['PASS', n, d]); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`) }
const fail = (n, d = '') => { results.push(['FAIL', n, d]); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function clickByText(page, selector, text) {
  const handles = await page.$$(selector)
  for (const h of handles) {
    const t = (await page.evaluate(el => el.textContent || '', h)).trim()
    if (t.includes(text)) { await h.click(); return true }
  }
  return false
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

  const errors = []
  page.on('pageerror', e => errors.push(String(e.message || e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

  console.log(`\n▶ ${BASE} (390×844 모바일)\n`)
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 })

  // Changelog 모달은 전체화면 스크림(z-index 9999)이라 좌표 클릭을 전부 삼킨다.
  // ChangelogModal이 인정하는 sentinel로 영구 dismiss (CI용 규약).
  await page.evaluate(() => localStorage.setItem('daon_last_seen_version', 'dismissed'))
  await page.reload({ waitUntil: 'networkidle2', timeout: 45000 })

  // ── 데모 진입 ──
  const entered = await clickByText(page, 'button', '데모')
  if (!entered) { fail('데모 진입 버튼'); }
  else {
    await page.waitForSelector('.bottom-nav', { timeout: 30000 }).catch(() => {})
    await sleep(2500)
    ok('데모 진입')
  }

  // ── 3) 하단 네비: 전체 탭 스트립 ──
  const nav = await page.evaluate(() => {
    const strip = document.querySelector('.nav-strip')
    if (!strip) return null
    const btns = [...strip.querySelectorAll('.nav-btn')]
    return {
      count: btns.length,
      labels: btns.map(b => b.querySelector('.nav-label')?.textContent?.trim()),
      scrollable: strip.scrollWidth > strip.clientWidth + 4,
      moreLabel: document.querySelector('.nav-btn-more .nav-label')?.textContent?.trim(),
      noswipe: strip.dataset.noswipe !== undefined,
    }
  })
  if (!nav) fail('하단 네비 스트립 존재')
  else {
    nav.count >= 9 ? ok('하단 네비 전체 탭 노출', `${nav.count}개: ${nav.labels.join('·')}`)
                   : fail('하단 네비 전체 탭 노출', `${nav.count}개뿐`)
    nav.scrollable ? ok('스트립 가로 스크롤 가능') : fail('스트립 가로 스크롤 가능')
    nav.moreLabel === '전체' ? ok("'전체' 버튼 고정") : fail("'전체' 버튼 고정", String(nav.moreLabel))
    nav.noswipe ? ok('스트립 data-noswipe (탭 스와이프 충돌 방지)') : fail('스트립 data-noswipe')
  }

  // 활성 탭이 바뀌면 스트립이 그 탭을 화면 안으로 스크롤하는지
  const before = await page.evaluate(() => document.querySelector('.nav-strip').scrollLeft)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.nav-strip .nav-btn')]
    btns[btns.length - 1].click()          // 가장 오른쪽(가려져 있던) 탭
  })
  await sleep(1200)
  const after = await page.evaluate(() => {
    const s = document.querySelector('.nav-strip')
    const act = s.querySelector('.nav-btn.active')
    const sr = s.getBoundingClientRect(), ar = act.getBoundingClientRect()
    return { scrollLeft: s.scrollLeft, visible: ar.left >= sr.left - 2 && ar.right <= sr.right + 2 }
  })
  after.scrollLeft > before + 10
    ? ok('활성 탭 자동 센터링', `scrollLeft ${Math.round(before)} → ${Math.round(after.scrollLeft)}`)
    : fail('활성 탭 자동 센터링', `${before} → ${after.scrollLeft}`)
  after.visible ? ok('숨어 있던 탭이 보이는 위치로 이동') : fail('숨어 있던 탭이 보이는 위치로 이동')

  // ── 2) 지수 배너 좌우 이동 ──
  const mb = await page.evaluate(() => ({
    prev: !!document.querySelector('.mbar-nav-prev'),
    next: !!document.querySelector('.mbar-nav-next'),
    view: !!document.querySelector('.mbar-view'),
    scrollLeft: document.querySelector('.mbar-view')?.scrollLeft ?? -1,
  }))
  ;(mb.prev && mb.next && mb.view) ? ok('지수 배너 ◀▶ 버튼 + 스크롤 컨테이너')
                                   : fail('지수 배너 ◀▶ 버튼', JSON.stringify(mb))

  // 버튼이 실제로 '눌릴 수 있는' 위치인지 — 예전엔 .app-top-controls(fixed z9999)가 ▶를 덮었다
  const hit = await page.evaluate(() => {
    const r = {}
    for (const k of ['prev', 'next']) {
      const el = document.querySelector(`.mbar-nav-${k}`)
      const b = el.getBoundingClientRect()
      const h = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2))
      r[k] = { self: h === el || el.contains(h), covered: `${h?.tagName}.${String(h?.className).slice(0, 24)}` }
    }
    return r
  })
  ;(hit.prev.self && hit.next.self)
    ? ok('◀▶ 버튼이 다른 레이어에 덮이지 않음')
    : fail('◀▶ 버튼이 덮임', JSON.stringify(hit))
  if (mb.next) {
    const x0 = await page.evaluate(() => document.querySelector('.mbar-view').scrollLeft)
    await page.click('.mbar-nav-next')
    await sleep(900)
    const x1 = await page.evaluate(() => document.querySelector('.mbar-view').scrollLeft)
    x1 > x0 + 20 ? ok('▶ 버튼으로 우측 이동', `${Math.round(x0)} → ${Math.round(x1)}`)
                 : fail('▶ 버튼으로 우측 이동', `${Math.round(x0)} → ${Math.round(x1)}`)
    // ◀ 는 왼쪽 끝에서 누르면 복제 구간으로 감싸 이동한다(무한 루프) → 값이 커질 수 있다.
    // 따라서 "줄어들거나, 감싸서 크게 뛴다" 둘 다 정상으로 본다.
    await page.click('.mbar-nav-prev')
    await sleep(900)
    const x2 = await page.evaluate(() => document.querySelector('.mbar-view').scrollLeft)
    x2 !== x1 ? ok('◀ 버튼으로 좌측 이동', `${Math.round(x1)} → ${Math.round(x2)}`)
              : fail('◀ 버튼으로 좌측 이동', '변화 없음')
  }

  // ── 1) 로고: 흰 배경/패딩 없음 ──
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.nav-strip .nav-btn')]
      .find(x => x.querySelector('.nav-label')?.textContent?.trim() === '포트폴리오')
    b?.click()
  })
  await sleep(6000)          // 로컬 첫 진입은 시세 배치 조회가 느리다
  const logos = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter(i =>
      /toss\.im|parqet|alphasquare|s2\/favicons/.test(i.src))
    return imgs.slice(0, 8).map(i => {
      const cs = getComputedStyle(i)
      return { src: i.src.slice(0, 46), bg: cs.backgroundColor, pad: cs.padding, fit: cs.objectFit }
    })
  })
  if (!logos.length) fail('종목 로고 이미지 발견', '데모 보유종목 없음?')
  else {
    const whiteish = logos.filter(l => /255,\s*255,\s*255/.test(l.bg) && !/,\s*0\)$/.test(l.bg))
    const padded   = logos.filter(l => l.pad && l.pad !== '0px')
    whiteish.length === 0 ? ok('로고 흰 배경 제거', `${logos.length}개 검사`)
                          : fail('로고 흰 배경 제거', JSON.stringify(whiteish))
    padded.length === 0 ? ok('로고 패딩 제거(흰 테두리 원인)')
                        : fail('로고 패딩 제거', JSON.stringify(padded))
    logos.every(l => l.fit === 'cover') ? ok('objectFit: cover (원 꽉 채움)')
                                       : fail('objectFit: cover', JSON.stringify(logos.map(l => l.fit)))
  }

  // ── 4) 발굴탭 산정방식 기본 접힘 ──
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.nav-strip .nav-btn')]
      .find(x => x.querySelector('.nav-label')?.textContent?.trim() === '발굴')
    b?.click()
  })
  await sleep(3500)
  const det = await page.evaluate(() => {
    const ds = [...document.querySelectorAll('details')]
      .filter(d => (d.querySelector('summary')?.textContent || '').includes('점수 산정 방식'))
    return { found: ds.length, open: ds.map(d => d.open) }
  })
  det.found === 0
    ? fail('발굴탭 산정방식 블록', '못 찾음 (탭 미로드?)')
    : (det.open.every(o => o === false)
        ? ok('발굴탭 산정방식 기본 접힘', `${det.found}개 모두 closed`)
        : fail('발굴탭 산정방식 기본 접힘', JSON.stringify(det.open)))

  // ── 5) valuation 지표 클릭 → 설명 ──
  // Valuation 섹션은 '개별 주식'에만 그려진다(지수·ETF 아님) → 보유 종목 행을 눌러 진입.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.nav-strip .nav-btn')]
      .find(x => x.querySelector('.nav-label')?.textContent?.trim() === '포트폴리오')
    b?.click()
  })
  await sleep(3000)
  const picked = await page.evaluate(() => {
    // 미국 개별주 로고가 있는 행을 눌러 차트 탭으로 진입
    const img = [...document.querySelectorAll('img')].find(i => /parqet|s2\/favicons/.test(i.src))
    let n = img
    while (n && n !== document.body) {
      if (n.onclick || n.tagName === 'BUTTON' || (n.className || '').toString().includes('row')) {
        n.click(); return n.tagName + '.' + String(n.className).slice(0, 30)
      }
      n = n.parentElement
    }
    img?.parentElement?.click()
    return img ? 'img-parent' : 'none'
  })
  await sleep(10000)
  const peg = await page.evaluate(async () => {
    const btns = [...document.querySelectorAll('button')]
    const t = btns.find(b => (b.textContent || '').includes('PEG Ratio'))
    if (!t) return { found: false }
    t.click()
    await new Promise(r => setTimeout(r, 400))
    const box = t.parentElement
    const txt = box?.textContent || ''
    return {
      found: true,
      expanded: t.getAttribute('aria-expanded'),
      hasKo: txt.includes('주가수익성장비율'),
      hasCalc: txt.includes('계산'),
      hasRead: txt.includes('읽는 법'),
      hasEg: txt.includes('예시'),
      len: txt.length,
    }
  })
  if (!peg.found) fail('PEG Ratio 항목 발견', 'Valuation 섹션 미로드 (시세 조회 실패 가능)')
  else {
    peg.expanded === 'true' ? ok('지표 클릭 → 펼침(aria-expanded)') : fail('지표 클릭 → 펼침', String(peg.expanded))
    ;(peg.hasKo && peg.hasCalc && peg.hasRead && peg.hasEg)
      ? ok('PEG 설명 4요소(한글명·계산·읽는 법·예시)', `${peg.len}자`)
      : fail('PEG 설명 4요소', JSON.stringify(peg))
  }

  // ── 6) 앱 → 웹 레이아웃 전환 ──
  const switched = await page.evaluate(async () => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '웹')
    if (!b) return { btn: false }
    b.click()
    await new Promise(r => setTimeout(r, 900))
    return {
      btn: true,
      webRoot: !!document.querySelector('.web-root'),
      sideNav: !!document.querySelector('.side-nav-logo-area'),
      stored: localStorage.getItem('layoutMode'),
    }
  })
  if (!switched.btn) fail("모바일에서 '웹' 전환 버튼 노출")
  else {
    ok("모바일에서 '웹' 전환 버튼 노출")
    ;(switched.webRoot && switched.sideNav)
      ? ok('웹 레이아웃 전환 동작', `layoutMode=${switched.stored}`)
      : fail('웹 레이아웃 전환 동작', JSON.stringify(switched))
  }
  // 되돌리기 (웹 → 앱). 테마 버튼과 클래스를 공유했었으므로 :not() 으로 앱 버튼만 집는다.
  const back = await page.evaluate(async () => {
    const b = document.querySelector('.top-nav-app-btn:not(.top-nav-theme-btn)')
    if (!b) return { btn: false }
    b.click()
    await new Promise(r => setTimeout(r, 900))
    return { btn: true, appRoot: !!document.querySelector('.app-root'), stored: localStorage.getItem('layoutMode') }
  })
  back.btn && back.appRoot ? ok('웹 → 앱 되돌리기', `layoutMode=${back.stored}`)
                           : fail('웹 → 앱 되돌리기', JSON.stringify(back))

  // ── 콘솔 에러 ──
  const real = errors.filter(e =>
    !/favicon|net::ERR|Failed to load resource|toss\.im|parqet|alphasquare|s2\/favicons|manifest/i.test(e))
  real.length === 0 ? ok('JS 런타임 에러 0건')
                    : fail('JS 런타임 에러', real.slice(0, 4).join(' | '))

  await browser.close()

  const failed = results.filter(r => r[0] === 'FAIL')
  console.log(`\n${'─'.repeat(56)}`)
  console.log(`  PASS ${results.length - failed.length} / ${results.length}`)
  if (failed.length) {
    console.log('  실패:')
    failed.forEach(f => console.log(`    · ${f[1]} ${f[2]}`))
  }
  console.log(`${'─'.repeat(56)}\n`)
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('치명적 오류:', e); process.exit(1) })

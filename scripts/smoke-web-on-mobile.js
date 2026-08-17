/* 재발 방지 — 좁은 기기(390px)에서 '웹(데스크톱) 화면'으로 전환했을 때 레이아웃이
 * 깨지지 않는지 검사한다.
 *
 * 2026-08-02 사고: 모바일에서 웹 레이아웃을 고를 수 있게 만들었는데, 데스크톱 3열이
 * 390px 로 압축돼 본문 칸이 몇 글자 폭으로 줄고 총 평가액이 한 글자씩 세로로 쪼개졌다.
 * "가로 스크롤로 감당된다"고 코드 주석에 적었을 뿐 실제로 확인하지 않은 것이 원인.
 *
 * 검사 항목
 *   1) 웹 레이아웃 전환이 되는가
 *   2) 본문 칸(.web-main-col)이 실사용 가능한 폭을 갖는가 (≥ 480px)
 *   3) 큰 숫자/제목이 여러 줄로 쪼개지지 않는가 (높이가 글꼴 크기의 2.2배 이내)
 *   4) 앱 모드로 되돌리면 원래대로 복구되는가
 *
 * 사용: BASE=https://daonwealth.com node scripts/smoke-web-on-mobile.js
 */
const puppeteer = require('puppeteer-core')
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE || 'https://daonwealth.com'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const results = []
const ok = (n, d = '') => { results.push(true); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`) }
const bad = (n, d = '') => { results.push(false); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`) }

;(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const p = await b.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  console.log(`\n▶ ${BASE} · 390×844 에서 웹(데스크톱) 화면 전환 검사\n`)

  await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await p.evaluate(() => localStorage.setItem('daon_last_seen_version', 'dismissed'))
  await p.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  for (const h of await p.$$('button')) {
    const t = (await p.evaluate(el => el.textContent || '', h)).trim()
    if (t.includes('데모')) { await h.click(); break }
  }
  try {
    await p.waitForSelector('.nav-strip', { timeout: 40000 })
  } catch {
    // 실패 원인을 삼키지 말고 드러낸다 (데모 진입 실패 / JS 에러 / 이미 웹모드 등)
    const st = await p.evaluate(() => ({
      appRoot: !!document.querySelector('.app-root'),
      webRoot: !!document.querySelector('.web-root'),
      layoutMode: localStorage.getItem('layoutMode'),
      buttons: [...document.querySelectorAll('button')].map(x => x.textContent.trim()).slice(0, 8),
      body: document.body.innerText.slice(0, 160),
    }))
    bad('앱 레이아웃 진입', JSON.stringify(st))
    console.log(`\n  PASS 0 / ${results.length}\n`)
    await b.close()
    process.exit(1)
  }
  await sleep(7000)

  // 앱 → 웹 전환
  const switched = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '웹')
    if (!btn) return { btn: false }
    btn.click()
    await new Promise(r => setTimeout(r, 1500))
    return { btn: true, webRoot: !!document.querySelector('.web-root') }
  })
  if (!switched.btn || !switched.webRoot) { bad('웹 레이아웃 전환', JSON.stringify(switched)) }
  else ok('웹 레이아웃 전환')
  await sleep(4000)

  const geo = await p.evaluate(() => {
    const root = document.querySelector('.web-root')
    const main = document.querySelector('.web-main-col')
    const vp = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''
    const measure = sel => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const fs = parseFloat(getComputedStyle(el).fontSize)
      return { w: Math.round(r.width), h: Math.round(r.height), fs: Math.round(fs),
               lines: +(r.height / fs).toFixed(1), text: (el.textContent || '').trim().slice(0, 18) }
    }
    return {
      rootW: root ? Math.round(root.getBoundingClientRect().width) : 0,
      mainW: main ? Math.round(main.getBoundingClientRect().width) : 0,
      viewport: vp,
      heroValue: measure('.hero-card .hero-value') || measure('.hero-value'),
      heroName: measure('.hero-app-name'),
      // .hero-app-name 은 라벨 + 닉네임(별도 block, 더 큰 글꼴) 2단 구성이라
      // height/fontSize 로는 정상도 3줄 넘게 나온다 → 폭으로 판정한다.
      // 원래 사고의 증상은 '칸이 30px 로 줄어든 것'이었으므로 폭이 직접 신호다.
      heroNameWidth: (() => {
        const el = document.querySelector('.hero-app-name')
        return el ? Math.round(el.getBoundingClientRect().width) : 0
      })(),
    }
  })

  if (geo.mainW >= 480) ok('본문 칸 실사용 폭 확보', `${geo.mainW}px (root ${geo.rootW}px)`)
  else bad('본문 칸이 너무 좁음', `${geo.mainW}px — 데스크톱 3열이 압축됨`)

  if (/width=\d{3,}/.test(geo.viewport)) ok('viewport 가 데스크톱 폭으로 교체됨', geo.viewport)
  else bad('viewport 미교체', geo.viewport)

  if (geo.heroNameWidth >= 200) ok('사용자명 칸 폭 정상', `${geo.heroNameWidth}px`)
  else bad('사용자명 칸이 좁아 쪼개짐', `${geo.heroNameWidth}px`)

  for (const [label, m] of [['총 평가액', geo.heroValue]]) {
    if (!m) { console.log(`  · ${label} 요소 없음 (건너뜀)`); continue }
    if (m.lines <= 2.2) ok(`${label} 한 줄 렌더`, `${m.lines}줄 (h${m.h}/fs${m.fs}) "${m.text}"`)
    else bad(`${label} 글자 단위 줄바꿈`, `${m.lines}줄 — 칸이 좁아 쪼개짐 "${m.text}"`)
  }

  // 웹 모드 상태에서 먼저 캡처 — 복구 후에 찍으면 앱 화면이 나와 확인이 안 된다
  await p.screenshot({ path: (process.env.OUT || '.') + '/web-on-mobile.png' })

  // 웹 → 앱 복구
  const back = await p.evaluate(async () => {
    const el = document.querySelector('.top-nav-app-btn:not(.top-nav-theme-btn)')
    if (!el) return { btn: false }
    el.click()
    await new Promise(r => setTimeout(r, 1500))
    return { btn: true, appRoot: !!document.querySelector('.app-root'),
             viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '' }
  })
  if (back.appRoot && /device-width/.test(back.viewport)) ok('앱 모드 복구 + viewport 원복')
  else bad('앱 모드 복구 실패', JSON.stringify(back))

  await b.close()

  const fails = results.filter(r => !r).length
  console.log(`\n${'─'.repeat(56)}`)
  console.log(`  PASS ${results.length - fails} / ${results.length}`)
  console.log(`${'─'.repeat(56)}\n`)
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('오류:', e.message); process.exit(1) })

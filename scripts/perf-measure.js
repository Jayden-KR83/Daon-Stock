/* 성능 계측 — 최초 로딩 / 탭 전환 / API 지연을 수치로.
 * 사용: node scripts/perf-measure.js            (기본 https://daonwealth.com)
 *       BASE=http://127.0.0.1:8501 node scripts/perf-measure.js
 */
const puppeteer = require('puppeteer-core')
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE || 'https://daonwealth.com'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function paints(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {}
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    let lcp = 0
    for (const e of performance.getEntriesByType('largest-contentful-paint') || []) lcp = e.startTime
    return {
      ttfb: Math.round(nav.responseStart || 0),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      load: Math.round(nav.loadEventEnd || 0),
      fcp: Math.round(fcp ? fcp.startTime : 0),
      lcp: Math.round(lcp),
    }
  })
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox'] })

  // ── 1. 콜드 로딩 (캐시 없음, 모바일 4G 유사) ──
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844 })
  await p.setCacheEnabled(false)
  const res = []
  p.on('response', async r => {
    try {
      const h = r.headers()
      res.push({ url: r.url().split('/').pop().slice(0, 34), type: r.request().resourceType(),
                 size: Number(h['content-length'] || 0), status: r.status(),
                 cache: h['cache-control'] || '' })
    } catch {}
  })

  const t0 = Date.now()
  await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  const cold = await paints(p)
  console.log('\n══ 1. 콜드 로딩 (캐시 없음, 로그인 화면까지) ══')
  console.log(`  TTFB ${cold.ttfb}ms · FCP ${cold.fcp}ms · LCP ${cold.lcp}ms · DCL ${cold.domContentLoaded}ms · load ${cold.load}ms`)
  console.log(`  총 소요 ${Date.now() - t0}ms`)

  // 렌더 블로킹 자원
  const blocking = res.filter(r => /fonts\.googleapis|fonts\.gstatic/.test(r.url) || r.type === 'stylesheet')
  console.log('\n  ▸ 렌더 블로킹 후보')
  for (const r of blocking.slice(0, 6)) console.log(`      ${r.type.padEnd(11)} ${r.url}`)
  const byType = {}
  for (const r of res) { byType[r.type] = (byType[r.type] || 0) + (r.size || 0) }
  console.log('  ▸ 자원 크기(content-length 기준)')
  for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    if (v > 0) console.log(`      ${k.padEnd(12)} ${(v / 1024).toFixed(0)} KB`)
  }
  const js = res.filter(r => r.type === 'script' && r.size > 0)
    .sort((a, b) => b.size - a.size).slice(0, 5)
  console.log('  ▸ 큰 JS')
  for (const r of js) console.log(`      ${(r.size / 1024).toFixed(0).padStart(5)} KB  ${r.url}`)

  // ── 2. 로그인(데모) 후 첫 화면 ──
  await p.evaluate(() => localStorage.setItem('daon_last_seen_version', 'dismissed'))
  const tLogin = Date.now()
  for (const h of await p.$$('button')) {
    const t = (await p.evaluate(el => el.textContent || '', h)).trim()
    if (t.includes('데모')) { await h.click(); break }
  }
  await p.waitForSelector('.nav-strip, .side-nav-logo-area', { timeout: 40000 })
  const tNav = Date.now() - tLogin
  // 보유 금액이 실제로 채워질 때까지
  const tVal = Date.now()
  let filled = 0
  for (let i = 0; i < 60; i++) {
    filled = await p.evaluate(() => document.querySelectorAll('.holding-row').length)
    const priced = await p.evaluate(() =>
      [...document.querySelectorAll('.h-value-main')]
        .filter(e => /[0-9•]/.test(e.textContent)).length)   // 프라이버시 마스크(•)도 '채워짐'
    if (filled > 0 && priced >= filled * 0.8) break
    await sleep(500)
  }
  console.log('\n══ 2. 데모 로그인 → 보유 화면 ══')
  console.log(`  네비 렌더까지 ${tNav}ms`)
  console.log(`  보유 ${filled}종목 금액 채워질 때까지 ${Date.now() - tVal}ms`)

  // ── 3. 탭 전환 지연 ──
  console.log('\n══ 3. 탭 전환 (클릭 → 콘텐츠 표시) ══')
  const TABS = ['분석', '종목', '관심', '발굴', '시장', '포트폴리오']
  for (const name of TABS) {
    const t = Date.now()
    const ok = await p.evaluate(n => {
      const b = [...document.querySelectorAll('.nav-strip .nav-btn, .side-nav-btn')]
        .find(x => (x.textContent || '').includes(n))
      if (!b) return false
      b.click(); return true
    }, name)
    if (!ok) continue
    // LOADING 스피너가 사라지고 실제 콘텐츠가 나올 때까지
    let elapsed = 0
    for (let i = 0; i < 60; i++) {
      const loading = await p.evaluate(() => /LOADING/.test(document.body.innerText))
      const hasContent = await p.evaluate(() => document.body.innerText.length > 400)
      if (!loading && hasContent) break
      await sleep(250)
      elapsed = i
    }
    console.log(`  ${name.padEnd(7)} ${String(Date.now() - t).padStart(6)}ms`)
    await sleep(600)
  }

  // ── 4. 주요 API 지연 (워밍 상태) ──
  console.log('\n══ 4. API 지연 (앱이 실제로 부르는 것) ══')
  const apis = await p.evaluate(async () => {
    const tok = localStorage.getItem('authToken')
    const H = { Authorization: 'Bearer ' + tok }
    const out = []
    const urls = ['/api/portfolio', '/api/market', '/api/accounts', '/api/notifications?limit=20']
    for (const u of urls) {
      const t = performance.now()
      try { await fetch(u, { headers: H, cache: 'no-store' }) } catch {}
      out.push([u, Math.round(performance.now() - t)])
    }
    // 보유 티커 전체 시세
    const pf = await (await fetch('/api/portfolio', { headers: H })).json()
    const ts = [...new Set(Object.values(pf.portfolios || {}).flat().map(h => h.ticker))]
    const t2 = performance.now()
    await fetch('/api/prices?tickers=' + ts.join(','), { headers: H, cache: 'no-store' })
    out.push([`/api/prices (${ts.length}종목)`, Math.round(performance.now() - t2)])
    return out
  })
  for (const [u, ms] of apis) console.log(`  ${String(ms).padStart(6)}ms  ${u}`)

  // ── 5. 재방문 (Service Worker 워밍 = PWA 실사용 시나리오) ──
  const p2 = await browser.newPage()
  await p2.setViewport({ width: 390, height: 844 })
  await p2.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })   // SW 등록
  await sleep(2500)
  const t5 = Date.now()
  await p2.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const warm = await paints(p2)
  console.log('\n══ 5. 재방문 (SW 캐시 = PWA 여는 상황) ══')
  console.log(`  TTFB ${warm.ttfb}ms · FCP ${warm.fcp}ms · DCL ${warm.domContentLoaded}ms · 총 ${Date.now() - t5}ms`)

  await browser.close()
})().catch(e => { console.error('오류:', e.message); process.exit(1) })

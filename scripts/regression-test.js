#!/usr/bin/env node
/**
 * 다온 앱 자동 회귀 테스트
 * ────────────────────────────────────────────────────────────
 * 사용법:
 *   1) 임시 admin 세션 생성:
 *      ssh ubuntu@168.107.13.20 "python3 /tmp/create_session.py"
 *      → 출력된 TOKEN=... 값 복사
 *   2) 환경변수로 실행:
 *      DAON_TOKEN=TESTONLY_xxxxx node scripts/regression-test.js
 *      DAON_TOKEN=TESTONLY_xxxxx DAON_URL=http://168.107.13.20:8501 node scripts/regression-test.js
 *
 * 검증 항목:
 *   ✓ 10개 탭 모두 렌더링 (보유/관심/비중/차트/트렌드/추가/관리/설명서/여정/관리자)
 *   ✓ 차트 탭: 보유 종목 클릭 → Recharts 렌더링
 *   ✓ 비중 탭: NetWorthChart, HealthScoreCard, AlertsCard, BacktestSection, AI 위젯 모두 표시
 *   ✓ JS 페이지 에러 0건
 *   ✓ 콘솔 에러 0건 (외부 CDN 404 제외)
 *   ✓ 백엔드 API 4xx/5xx 0건
 *
 * 결과:
 *   - 모든 항목 PASS → exit code 0
 *   - 단 하나라도 FAIL → exit code 1
 *   - JSON 상세 결과 stdout에 출력 가능 (DAON_JSON=1)
 */

const puppeteer = require('puppeteer-core')

const URL   = process.env.DAON_URL   || 'http://168.107.13.20:8501'
const TOKEN = process.env.DAON_TOKEN
const CHROME_PATH = process.env.CHROME_PATH ||
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`
const JSON_OUT = process.env.DAON_JSON === '1'

if (!TOKEN) {
  console.error('❌ DAON_TOKEN 환경변수가 필요합니다.')
  console.error('   ssh ubuntu@168.107.13.20 "python3 /tmp/create_session.py" 로 세션 생성 후 사용.')
  process.exit(1)
}

const TABS = ['보유','관심','비중','차트','트렌드','추가','관리','설명서','여정','관리자']

// 외부 도메인 404는 무시 (로고 CDN 등)
const IGNORED_HOSTS = ['parqet.com','toss.im','alphasquare']
const isIgnoredUrl = (u) => IGNORED_HOSTS.some(h => u.includes(h)) || u.includes('favicon')

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--force-prefers-reduced-motion=no-preference'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  const pageErrors = []
  const consoleErrors = []
  const failedRequests = []
  page.on('pageerror', e => pageErrors.push({
    msg: e.message, stack: e.stack?.split('\n').slice(0, 3).join('\n'),
  }))
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text()
      if (!t.includes('404') && !IGNORED_HOSTS.some(h => t.includes(h))) {
        consoleErrors.push(t)
      }
    }
  })
  page.on('response', r => {
    if (r.status() >= 400 && !isIgnoredUrl(r.url())) {
      failedRequests.push({
        status: r.status(), method: r.request().method(),
        url: r.url().replace(URL, ''),
      })
    }
  })

  const log = (...args) => { if (!JSON_OUT) console.log(...args) }

  // 1. 토큰 주입 + 로그인
  log('🔌 토큰 주입 + 로그인…')
  await page.goto(URL + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(t => {
    localStorage.setItem('authToken', t)
    localStorage.setItem('appMode', 'web')
    // ChangelogModal 자동 열림 차단 (회귀 테스트는 모달 없이 진행)
    localStorage.setItem('daon_last_seen_version', 'v999.test')
  }, TOKEN)
  await page.goto(URL + '/', { waitUntil: 'networkidle0', timeout: 30_000 })
  await sleep(1500)

  const loginCheck = await page.evaluate(() => ({
    hasLogin: !!document.querySelector('input[type="email"]'),
    hasNav: !!document.querySelector('.side-nav, .bottom-nav'),
  }))
  if (loginCheck.hasLogin || !loginCheck.hasNav) {
    return finish(browser, false, 'LOGIN_FAILED', { loginCheck })
  }
  log('  ✅ 로그인 OK')

  // 2. 10개 탭 순회
  const tabResults = {}
  for (const name of TABS) {
    const t0 = Date.now()
    const clicked = await page.evaluate((n) => {
      const btns = Array.from(document.querySelectorAll('button'))
      const t = btns.find(b => b.querySelector('.side-nav-label')?.innerText === n)
      if (t) { t.click(); return true }
      return false
    }, name)
    if (!clicked) { tabResults[name] = { ok: false, reason: 'BUTTON_NOT_FOUND' }; continue }
    await sleep(700)
    const hasContent = await page.evaluate(() => {
      const m = document.querySelector('.web-main-col')
      return !!(m && m.innerText.trim().length > 5)
    })
    const elapsed = Date.now() - t0
    tabResults[name] = { ok: hasContent, ms: elapsed }
    log(`  ${hasContent ? '✅' : '⚠️'} [${name.padEnd(4)}] ${elapsed}ms`)
  }

  // 3. 차트 탭: 보유 탭의 첫 카드 클릭 → 차트로 이동 → Recharts 렌더링
  log('\n📊 차트 검증…')
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const t = btns.find(b => b.querySelector('.side-nav-label')?.innerText === '보유')
    if (t) t.click()
  })
  await sleep(800)
  // .holding-row 안의 LogoCircle (이미지) 클릭 — cursor:pointer 영역
  const clicked = await page.evaluate(() => {
    const rows = document.querySelectorAll('.holding-row')
    if (!rows[0]) return { clicked: false, reason: 'no_rows' }
    // 모든 cursor:pointer 또는 onClick 핸들러 있는 div 찾기
    const candidates = rows[0].querySelectorAll('div')
    for (const d of candidates) {
      const cs = window.getComputedStyle(d)
      if (cs.cursor === 'pointer') {
        d.click()
        return { clicked: true, text: d.innerText?.slice(0, 30) }
      }
    }
    rows[0].click()
    return { clicked: 'fallback', text: rows[0].innerText?.slice(0, 30) }
  })
  // Recharts 렌더 폴링 — 최대 25초 대기 (yfinance 느린 종목 대응)
  let rechartsCount = 0
  for (let i = 0; i < 50; i++) {
    rechartsCount = await page.evaluate(() =>
      document.querySelectorAll('.recharts-wrapper').length)
    if (rechartsCount >= 1) break
    await sleep(500)
  }
  const chartCheck = { rechartsCount, clicked }
  log(`  ${chartCheck.rechartsCount >= 1 ? '✅' : '❌'} Recharts: ${chartCheck.rechartsCount}개 (클릭: ${JSON.stringify(clicked)})`)

  // 4. 비중 탭: 신규 컴포넌트들 확인
  log('\n📈 비중 탭 신규 컴포넌트…')
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const t = btns.find(b => b.querySelector('.side-nav-label')?.innerText === '비중')
    if (t) t.click()
  })
  await sleep(1500)
  const allocCheck = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasNetWorth: text.includes('자산 추이'),
      hasHealthScore: text.includes('Portfolio Health Score'),
      hasAlerts: text.includes('자동 리밸런싱 경고'),
      hasBacktest: text.includes('백테스트'),
      hasAI: text.includes('Portfolio Strategy Report'),
      hasShimmer: !!document.querySelector('.shimmer-btn'),
    }
  })
  Object.entries(allocCheck).forEach(([k, v]) => log(`  ${v ? '✅' : '❌'} ${k}`))

  // 5. 결과 집계
  const allTabsOk = TABS.every(t => tabResults[t]?.ok)
  const allocOk = allocCheck.hasNetWorth && allocCheck.hasHealthScore
              && allocCheck.hasAlerts && allocCheck.hasBacktest && allocCheck.hasAI
  const noErrors = pageErrors.length === 0 && consoleErrors.length === 0
                && failedRequests.length === 0
  const allOk = allTabsOk && chartCheck.rechartsCount >= 1 && allocOk && noErrors

  await browser.close()
  return finish(null, allOk, allOk ? 'PASS' : 'FAIL', {
    tabResults, chartCheck, allocCheck,
    pageErrors, consoleErrors, failedRequests,
  })
}

function finish(browser, ok, status, details) {
  if (browser) browser.close()
  if (JSON_OUT) {
    console.log(JSON.stringify({ ok, status, ...details }, null, 2))
  } else {
    console.log('\n' + '═'.repeat(50))
    console.log(`결과: ${ok ? '✅ PASS' : '❌ FAIL'} (${status})`)
    if (details.pageErrors?.length) {
      console.log(`\n페이지 에러 ${details.pageErrors.length}건:`)
      details.pageErrors.forEach(e => console.log('  -', e.msg))
    }
    if (details.consoleErrors?.length) {
      console.log(`\n콘솔 에러 ${details.consoleErrors.length}건:`)
      details.consoleErrors.slice(0, 5).forEach(e => console.log('  -', e))
    }
    if (details.failedRequests?.length) {
      console.log(`\nAPI 실패 ${details.failedRequests.length}건:`)
      details.failedRequests.slice(0, 5).forEach(r => console.log(`  - ${r.status} ${r.url}`))
    }
    console.log('═'.repeat(50))
  }
  process.exit(ok ? 0 : 1)
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

main().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(2)
})

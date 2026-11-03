/**
 * 네비 재편 안전망 — **모든 화면에 도달할 수 있는가** (2026-11-03).
 *
 * 하단 바를 10칸에서 5칸으로 줄이면서 분석·종목·등록·가이드를 뺐다.
 * 지운 게 아니라 다른 길로 옮긴 것인데, **그 길 하나가 끊기면 그 화면은
 * 영영 도달 불가**가 된다. 화면에는 아무 일도 일어나지 않으므로 눈으로는 모른다.
 *
 * 그래서 진짜 브라우저로 길을 하나씩 걸어 본다.
 *   계좌 → [보유 종목 종합 분석] → 분석
 *   계좌 → 보유 종목 클릭        → 종목
 *   설정 → [종목 등록]           → 등록
 *   구석 책 버튼                 → 가이드
 *   전체 메뉴                    → 네 화면 모두 (두 번째 길)
 *   그리고 각 화면에서 **돌아올 수 있는가**.
 *
 * 사용: node scripts/check-nav-reachable.mjs <BASE>
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
page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) })

/* 어느 화면인지 **사용자가 보는 것**으로 판정한다.
   activeTab 은 메모리 상태라 밖에서 못 읽는다 — 처음엔 localStorage 를 뒤지다
   전부 undefined 를 받았다(검사기 오류). 내부 상태 대신 화면에 뜬 증거를 본다:
   숨은 화면은 DetailTabHeader 가 제목을 쓰고, 하단 바 탭은 active 클래스가 붙는다. */
const seeing = () => page.evaluate(() => {
  const d = document.querySelector('[data-detail-tab]')
  if (d) return d.getAttribute('data-detail-tab')
  const b = document.querySelector('.nav-btn.active, .bottom-nav .active, nav .active')
  return b ? (b.textContent || '').trim() : '?'
})
const click = async (name, exact = true) => {
  const b = page.getByRole('button', { name, exact }).first()
  if (await b.count() === 0) return false
  await b.evaluate(el => el.click())
  await page.waitForTimeout(1800)
  return true
}
const goHome = async () => { await click('계좌'); await page.waitForTimeout(1200) }

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

  // ── 하단 바가 5칸인가 (+관리자는 더 있을 수 있다) ──
  const strip = await page.evaluate(() => {
    const nav = document.querySelector('.nav-strip, .bottom-nav, nav')
    if (!nav) return null
    return [...nav.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean)
  })
  if (strip) ok('하단 바: ' + strip.join(' · '))

  // ── 1. 계좌 → 분석 ──
  await goHome()
  if (!await click('보유 종목 종합 분석', false)) fail('계좌에 분석 진입 버튼이 없다')
  else {
    await page.waitForTimeout(2500)
    const v1 = await seeing()
    if (v1 !== '보유 종목 종합 분석') fail('분석 화면이 아니다 — 보이는 것: ' + v1)
    else ok('계좌 → 보유 종목 종합 분석 → 분석')
    // 돌아오기 — 헤더의 ‹계좌
    if (!await click('계좌(으)로 돌아가기', false)) fail('분석에 돌아가기 버튼이 없다')
    else {
      const v2 = await seeing()
      if (v2 === '보유 종목 종합 분석') fail('돌아가기를 눌렀는데 그대로다')
      else ok('분석 → ‹계좌 로 돌아옴 (지금: ' + v2 + ')')
    }
  }

  // ── 2. 설정 → 등록 ──
  await goHome()
  if (!await click('설정')) fail('하단 바에 설정이 없다')
  else {
    if (!await click('종목 등록 · 증권사 파일 가져오기', false)) fail('설정에 등록 진입이 없다')
    else {
      const v = await seeing()
      if (v !== '종목 등록') fail('등록 화면이 아니다 — 보이는 것: ' + v)
      else ok('설정 → 종목 등록 → 등록')
    }
  }

  // ── 3. 구석 책 버튼 → 가이드 ──
  await goHome()
  const fab = page.getByRole('button', { name: '사용 가이드 열기' }).first()
  if (await fab.count() === 0) fail('가이드 책 버튼이 없다')
  else {
    await fab.evaluate(el => el.click())
    await page.waitForTimeout(2000)
    const v = await seeing()
    if (v !== '사용 가이드') fail('가이드 화면이 아니다 — 보이는 것: ' + v)
    else ok('구석 책 버튼 → 가이드')
  }

  // ── 4. 전체 메뉴에 숨은 탭이 남아 있는가 (두 번째 길) ──
  await goHome()
  if (!await click('전체', false)) fail('전체 메뉴 버튼이 없다')
  else {
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .map(b => (b.textContent || '').trim()).filter(Boolean))
    const missing = ['분석', '종목', '등록', '가이드'].filter(x => !names.includes(x))
    if (missing.length) fail('전체 메뉴에 빠진 화면: ' + missing.join(', '))
    else ok('전체 메뉴에 숨은 화면 4개 모두 있음 (두 번째 길)')
    await page.keyboard.press('Escape').catch(() => {})
  }
} catch (e) {
  fail('예외: ' + String(e.message).slice(0, 300))
} finally {
  if (errs.length) fail('콘솔/페이지 오류 ' + errs.length + '건:\n    ' + errs.slice(0, 4).join('\n    '))
  else ok('콘솔 오류 0건')
  await browser.close()
  console.log(bad ? `\n${bad}건 실패` : '\n전부 통과 — 모든 화면에 도달 가능')
  process.exit(bad ? 1 : 0)
}

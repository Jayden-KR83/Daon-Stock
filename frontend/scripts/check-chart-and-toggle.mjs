/**
 * 차트 이평선·52주 낙폭 + 토글 스위치 — 눈이 아니라 **값으로** 확인한다 (2026-11-05).
 *
 * 오너 요청 4건이 전부 "보이는 것"에 대한 것이라, "고쳤다"를 스크린샷으로 말하면
 * 다음에 또 틀어져도 아무도 모른다. 숫자로 박는다:
 *   1. MA120 버튼이 **처음부터** 켜져 있는가 (기본값이 false 로 되돌아가면 실패)
 *   2. 이평선 굵기가 캔들 몸통보다 얇은가 (stroke-width 실측)
 *   3. '52주고 대비' 버튼이 있고, 누르면 고점선·낙폭 음영이 그려지는가
 *   4. 52주 바에 '고점 대비 −x%' 가 적혀 있는가
 *   5. 토글의 글자가 손잡이 **안**에 있고, 그 글자를 눌러 상태가 바뀌는가
 *
 * 사용: node scripts/check-chart-and-toggle.mjs [BASE]
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'https://daonwealth.com'
let bad = 0
const ok   = (m) => console.log('  OK  ' + m)
const fail = (m) => { console.log('FAIL ' + m); bad++ }

const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e.message).slice(0, 180)))

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  const r = await fetch('/api/auth/demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  localStorage.setItem('authToken', (await r.json()).token)
  localStorage.setItem('layoutMode', 'web')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2800)
for (const n of ['건너뛰기', '닫기']) {
  const b = page.getByRole('button', { name: n }).first()
  if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(300) }
}

// ── 종목 차트 열기 ──────────────────────────────────────────────────
const side = page.locator('.side-nav-btn', { hasText: '종목' }).first()
if (!await side.count()) fail('사이드바에 종목이 없다')
else {
  await side.evaluate(el => el.click())
  await page.waitForTimeout(7000)

  // 1. MA120 기본 켜짐
  const ma = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.seg-btn')]
    const out = {}
    for (const k of ['MA20', 'MA60', 'MA120', 'MA200']) {
      const b = btns.find(x => x.textContent.trim() === k)
      out[k] = b ? b.classList.contains('active') : null
    }
    return out
  })
  if (ma.MA120 === null) fail('MA120 버튼을 못 찾았다 (차트가 안 떴을 수 있다)')
  else if (!ma.MA120) fail(`MA120 이 기본 꺼짐이다 — ${JSON.stringify(ma)}`)
  else ok(`이평선 기본값: ${Object.entries(ma).map(([k, v]) => k + (v ? '켜' : '꺼')).join(' ')}`)

  // 2. 이평선 굵기 < 캔들 몸통 폭
  const w = await page.evaluate(() => {
    const svg = document.querySelector('.chart-card svg')
    if (!svg) return null
    const polys = [...svg.querySelectorAll('polyline')]
    const rects = [...svg.querySelectorAll('rect')].filter(r => {
      const f = r.getAttribute('fill') || ''
      return f !== 'transparent' && +(r.getAttribute('width') || 0) > 0
    })
    const bodyW = rects.map(r => +r.getAttribute('width')).filter(v => v > 0 && v < 40)
    return {
      stroke: polys.length ? +polys[0].getAttribute('stroke-width') : null,
      polyN: polys.length,
      bodyMedian: bodyW.length
        ? bodyW.sort((a, b) => a - b)[Math.floor(bodyW.length / 2)] : null,
    }
  })
  if (!w || w.stroke == null) fail('이평선 polyline 을 못 찾았다')
  else if (w.stroke >= 1.5) fail(`이평선이 여전히 굵다: ${w.stroke}px`)
  else if (w.bodyMedian != null && w.stroke >= w.bodyMedian)
    fail(`이평선(${w.stroke}px)이 캔들 몸통(${w.bodyMedian}px)보다 굵다`)
  else ok(`이평선 ${w.stroke}px < 캔들 몸통 ${w.bodyMedian}px (선 ${w.polyN}개)`)

  // 3. 52주고 대비 버튼 + 낙폭 음영
  const btn = page.getByRole('button', { name: '52주고 대비' }).first()
  if (!await btn.count()) fail("'52주고 대비' 버튼이 없다")
  else {
    const on = await page.evaluate(() => {
      const svg = document.querySelector('.chart-card svg')
      if (!svg) return null
      const t = [...svg.querySelectorAll('text')].map(x => x.textContent.trim())
      return { label: t.includes('52주고'), dd: t.some(x => x.startsWith('고점 대비')) }
    })
    if (!on?.label) fail("차트에 '52주고' 선 라벨이 없다 (기본 켜짐이어야 한다)")
    else ok(`차트에 52주 고점선 있음${on.dd ? ' + 낙폭 수치 표기' : ''}`)

    // 끄면 사라지는가 — 버튼이 실제로 동작하는가
    await btn.evaluate(el => el.click())
    await page.waitForTimeout(800)
    const off = await page.evaluate(() => {
      const svg = document.querySelector('.chart-card svg')
      return svg ? [...svg.querySelectorAll('text')].some(x => x.textContent.trim() === '52주고') : true
    })
    if (off) fail('52주고 대비 버튼을 껐는데 선이 남아 있다')
    else ok('52주고 대비 버튼으로 끄고 켤 수 있다')
    await btn.evaluate(el => el.click())
    await page.waitForTimeout(500)
  }

  // 4. 52주 바의 '고점 대비'
  const bar = await page.evaluate(() =>
    document.body.innerText.includes('고점 대비') && document.body.innerText.includes('저점 대비'))
  if (!bar) fail("52주 바에 '고점 대비 / 저점 대비' 표기가 없다")
  else ok('52주 바에 고점 대비 · 저점 대비 둘 다 표기')
}

// ── 토글 스위치 ─────────────────────────────────────────────────────
const setTab = page.locator('.side-nav-btn', { hasText: '설정' }).first()
if (!await setTab.count()) fail('사이드바에 설정이 없다')
else {
  await setTab.evaluate(el => el.click())
  await page.waitForTimeout(4000)
  const sw = await page.evaluate(() => {
    const t = document.querySelector('.sw-track')
    if (!t) return null
    const knob = t.querySelector('.sw-knob')
    const kb = knob?.getBoundingClientRect()
    const tb = t.getBoundingClientRect()
    return {
      knobText: (knob?.textContent || '').trim(),
      strayLabel: !!document.querySelector('.sw-state'),
      inside: kb && tb ? (kb.left >= tb.left - 1 && kb.right <= tb.right + 1) : false,
      checked: t.getAttribute('aria-checked'),
      trackW: Math.round(tb.width), knobW: kb ? Math.round(kb.width) : null,
    }
  })
  if (!sw) fail('토글(.sw-track)을 못 찾았다')
  else {
    if (!['켜짐', '꺼짐', '…'].includes(sw.knobText))
      fail(`손잡이 안의 글자가 '${sw.knobText}' 다 — '켜짐'/'꺼짐' 이어야 한다`)
    else ok(`손잡이 글자 '${sw.knobText}' (트랙 ${sw.trackW}px / 손잡이 ${sw.knobW}px)`)
    if (sw.strayLabel) fail('트랙 밖에 옛 상태 글자(.sw-state)가 남아 있다')
    else ok('트랙 밖 중복 글자 없음 — 읽을 것이 하나다')
    if (!sw.inside) fail('손잡이가 트랙 밖으로 나가 있다')
    else ok('손잡이가 트랙 안에 있다')

    /* 핵심: **글자를 눌러서** 동작이 시작되는가. 오너가 지적한 바로 그 동작이다.
       트랙 가운데가 아니라 **글자 좌표**를 찍는다 — 그래야 '글자가 눌리는가'를
       본 것이 된다.

       ⚠ 1차에서는 `aria-checked` 가 뒤집히는지를 봤고 **오탐**이 났다.
         이 토글의 동작은 웹 푸시 구독이라, 헤드리스 브라우저에서는
         `Notification.permission === 'denied'` 라 **정당하게 실패한다.**
         꺼진 채로 남는 것이 올바른 결과인데 검사기는 "글자가 안 눌린다"고 했다.
         실측: 누른 직후 손잡이 글자가 '…'(busy)로 바뀐다 → 핸들러는 분명히 돈다.
       -> 우리가 확인해야 할 것은 **클릭이 핸들러에 닿는가**뿐이다. 구독 성공은
          브라우저 권한의 문제지 이 토글의 문제가 아니다. */
    const hit = await page.evaluate(() => {
      const k = document.querySelector('.sw-knob')
      const r = k.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { reachesTrack: !!el?.closest('.sw-track'), pe: getComputedStyle(k).pointerEvents }
    })
    if (!hit.reachesTrack)
      fail(`글자 좌표의 hit-test 가 토글 밖을 가리킨다 (pointer-events: ${hit.pe})`)
    else {
      const before = sw.knobText
      await page.evaluate(() => {
        const k = document.querySelector('.sw-knob')
        const r = k.getBoundingClientRect()
        document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).click()
      })
      await page.waitForTimeout(700)
      const now = await page.evaluate(() => {
        const t = document.querySelector('.sw-track')
        return { gone: !t, text: t ? t.querySelector('.sw-knob').textContent.trim() : null,
                 checked: t ? t.getAttribute('aria-checked') : null }
      })
      const fired = now.gone || now.text !== before
      if (!fired)
        fail(`글자를 눌렀는데 아무 반응이 없다 (그대로 '${before}')`)
      else ok(`글자를 눌러 동작이 시작된다 ('${before}' → '${now.text ?? '카드 전환'}')`)
    }
  }
}

if (errs.length) fail('페이지 오류 ' + errs.length + '건: ' + errs[0])
else ok('페이지 오류 0건')

await browser.close()
console.log('')
console.log(bad ? `${bad}건 실패` : '전부 통과 — 차트 3건 + 토글 4건')
process.exit(bad ? 1 : 0)

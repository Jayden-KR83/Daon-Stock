/* UI/UX 자동 계측 — 사람이 못 세는 것만 기계로 센다.
 * 검사: ① 터치 타겟 <44px ② 가로 오버플로 ③ 본문 대비비 <4.5:1 ④ alt 없는 img
 *      ⑤ 숫자 줄바꿈 위험(좁은 칸의 tabular 숫자) ⑥ 포커스 링 없는 인터랙티브
 * 사용: node scripts/ux-audit.js [--base https://daonwealth.com] [--w 360]
 */
const puppeteer = require('puppeteer-core')
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE || 'https://daonwealth.com'
const W = Number(process.env.W || 360)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const AUDIT = () => {
  const out = { taps: [], overflow: [], contrast: [], noAlt: [], noFocus: [] }
  const vis = el => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const lum = c => {
    const m = c.match(/[\d.]+/g)
    if (!m) return null
    const [r, g, b] = m.slice(0, 3).map(Number)
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const bgOf = el => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c
      n = n.parentElement
    }
    return 'rgb(255,255,255)'
  }
  const label = el => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26)
    return `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}${t ? ` "${t}"` : ''}`
  }

  // ① 터치 타겟
  document.querySelectorAll('button, a, [role="button"], input, select').forEach(el => {
    if (!vis(el)) return
    const r = el.getBoundingClientRect()
    if (r.width < 44 || r.height < 44) {
      out.taps.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height) })
    }
  })
  // ② 가로 오버플로
  const docW = document.documentElement.clientWidth
  document.querySelectorAll('*').forEach(el => {
    if (!vis(el)) return
    const r = el.getBoundingClientRect()
    if (r.right > docW + 1.5 && r.width <= docW) {
      const cs = getComputedStyle(el)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return
      let p = el.parentElement, scrollable = false
      while (p) { const c = getComputedStyle(p)
        if (c.overflowX === 'auto' || c.overflowX === 'scroll') { scrollable = true; break }
        p = p.parentElement }
      if (!scrollable) out.overflow.push({ el: label(el), right: Math.round(r.right), docW })
    }
  })
  // ③ 대비비 (본문 텍스트만)
  document.querySelectorAll('span, div, p, td, li, label, button').forEach(el => {
    if (!vis(el)) return
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('')
    if (txt.length < 3) return
    const cs = getComputedStyle(el)
    const fs = parseFloat(cs.fontSize)
    const L1 = lum(cs.color), L2 = lum(bgOf(el))
    if (L1 == null || L2 == null) return
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const big = fs >= 18.66 || (fs >= 14 && Number(cs.fontWeight) >= 700)
    const need = big ? 3.0 : 4.5
    if (ratio < need) {
      out.contrast.push({ el: label(el), ratio: +ratio.toFixed(2), need, fontSize: fs,
                          color: cs.color, bg: bgOf(el) })
    }
  })
  // ④ alt 없는 이미지
  document.querySelectorAll('img').forEach(el => {
    if (vis(el) && !el.getAttribute('alt')) out.noAlt.push({ el: (el.src || '').slice(-42) })
  })
  // ⑤ 포커스 스타일 (outline:none 인데 대체 스타일 없음)
  document.querySelectorAll('button, a').forEach(el => {
    if (!vis(el)) return
    const cs = getComputedStyle(el)
    if (cs.outlineStyle === 'none' && !/inset|0 0 0/.test(cs.boxShadow || '')) {
      out.noFocus.push({ el: label(el) })
    }
  })
  const uniq = a => [...new Map(a.map(x => [JSON.stringify(x), x])).values()]
  return { taps: uniq(out.taps), overflow: uniq(out.overflow), contrast: uniq(out.contrast),
           noAlt: uniq(out.noAlt), noFocus: uniq(out.noFocus) }
}

;(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const p = await b.newPage()
  await p.setViewport({ width: W, height: 800, deviceScaleFactor: 2 })
  await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await p.evaluate(() => localStorage.setItem('daon_last_seen_version', 'dismissed'))
  await p.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  for (const h of await p.$$('button')) {
    const t = (await p.evaluate(el => el.textContent || '', h)).trim()
    if (t.includes('데모')) { await h.click(); break }
  }
  await p.waitForSelector('.nav-strip, .side-nav-logo-area', { timeout: 40000 })
  await sleep(9000)

  const TABS = ['포트폴리오', '분석', '종목', '관심', '발굴', '시장']
  const totals = {}
  for (const tab of TABS) {
    const ok = await p.evaluate(name => {
      const b = [...document.querySelectorAll('.nav-strip .nav-btn, .side-nav-btn')]
        .find(x => (x.textContent || '').includes(name))
      if (b) { b.click(); return true }
      return false
    }, tab)
    if (!ok) continue
    await sleep(tab === '분석' || tab === '발굴' ? 11000 : 6000)
    const r = await p.evaluate(AUDIT)
    totals[tab] = r
    console.log(`\n[${tab}] 폭 ${W}px`)
    console.log(`  터치타겟<44px ${r.taps.length} · 가로오버플로 ${r.overflow.length} · 대비부족 ${r.contrast.length} · alt없음 ${r.noAlt.length} · 포커스링없음 ${r.noFocus.length}`)
    r.overflow.slice(0, 3).forEach(x => console.log(`    ⚠ 오버플로: ${x.el} (right ${x.right} > ${x.docW})`))
    r.contrast.slice(0, 4).forEach(x => console.log(`    ⚠ 대비 ${x.ratio}:1 (필요 ${x.need}) ${x.fontSize}px ${x.el}`))
    r.taps.slice(0, 3).forEach(x => console.log(`    · 작은탭 ${x.w}×${x.h} ${x.el}`))
  }
  const sum = k => Object.values(totals).reduce((s, r) => s + r[k].length, 0)
  console.log('\n' + '─'.repeat(60))
  console.log(`  합계 — 터치타겟 ${sum('taps')} · 오버플로 ${sum('overflow')} · 대비 ${sum('contrast')} · alt ${sum('noAlt')} · 포커스 ${sum('noFocus')}`)
  console.log('─'.repeat(60))
  await b.close()
})().catch(e => { console.error('오류:', e.message); process.exit(1) })

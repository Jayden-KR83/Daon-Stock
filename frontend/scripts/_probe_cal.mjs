import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chromium' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await ctx.newPage()
await page.goto('https://daonwealth.com/', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  const r = await fetch('/api/auth/demo', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
  localStorage.setItem('authToken', (await r.json()).token); localStorage.setItem('layoutMode','web')
})
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000)
for (const n of ['건너뛰기','닫기']) { const x = page.getByRole('button',{name:n}).first(); if (await x.count()) { await x.evaluate(e=>e.click()).catch(()=>{}); await page.waitForTimeout(300) } }
await page.getByRole('button',{name:'시장',exact:true}).first().evaluate(e=>e.click())
await page.waitForTimeout(9000)
console.log(JSON.stringify(await page.evaluate(() => {
  const cal = [...document.querySelectorAll('*')].find(e => e.children.length===0 && e.textContent.trim()==='실적 캘린더')
  const card = cal ? cal.closest('.mono-card') : null
  const logos = [...document.querySelectorAll('img,svg')].filter(x=>{const r=x.getBoundingClientRect();return r.width>20&&r.width<40})
  return { calHeight: card ? Math.round(card.getBoundingClientRect().height) : null,
           cells: [...document.querySelectorAll('div')].filter(d=>d.style.minHeight==='74px').map(d=>Math.round(d.getBoundingClientRect().height)).slice(0,10) }
}), null, 1))
await b.close()

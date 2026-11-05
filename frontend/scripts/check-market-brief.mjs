/**
 * 시황 카드 렌더 검사 — **AI 를 부르지 않고** 카드를 실제로 그려 본다 (2026-11-05).
 *
 * 왜 필요한가: 이 카드는 cron 이 하루 2번 만든 데이터가 있어야 내용이 보인다.
 * 배포 직후에는 늘 빈 상태라, "배포했다 → 화면 확인했다"가 **빈 카드만 본 것**이
 * 된다. 내용이 찬 상태는 영영 검사되지 않는다.
 *
 * 그래서 응답을 가로채(route intercept) 실제 모양의 데이터를 흘려 넣는다.
 * 돈이 들지 않고, 운영 데이터를 건드리지도 않는다.
 *
 * 무엇을 보는가 — 카드가 "그려졌다"가 아니라 **읽히는가**:
 *   1. 세 층(거시 해설 · 서버 계산 · AI 한 줄)이 전부 화면에 있는가
 *   2. 서버 계산분에 'AI 가 아니라'라는 출처 표시가 붙어 있는가
 *   3. 가로 넘침이 없는가 (390px 에서 긴 종목명이 밀어내지 않는가)
 *   4. 시황 카드가 실적 캘린더보다 **위**에 있는가 (순서가 설계의 전부다)
 *
 * 사용: node scripts/check-market-brief.mjs [BASE]
 */
import { chromium } from 'playwright-core'

const BASE = process.argv[2] || 'https://daonwealth.com'

/* 일부러 **불편한 값**을 넣는다. 짧고 예쁜 문장은 아무것도 증명하지 않는다.
   - 종목명 4개가 길게 이어지는 연결 줄
   - 소수점 둘째 자리 음수
   - 조회 실패(null) 가 섞인 시세 */
const FIXTURE = {
  ok: true, session: '2026-11-05:pre', fresh: true,
  brief: {
    ok: true, session: '2026-11-05:pre', searched: true, model: 'claude-sonnet-5-5',
    headline: '10년물이 4.21%로 +2.3% 오른 날, 나스닥이 1.8% 밀렸습니다.',
    movers: [
      { what: '미국 10년', number: '4.21% (+2.3%)',
        meaning: '국채 입찰 부진이 보도된 날 금리가 올랐습니다. 인과로 단정하기는 이릅니다.' },
      { what: '나스닥', number: '-1.82%',
        meaning: '금리에 민감한 대형 성장주 중심으로 하락 폭이 컸습니다.' },
      { what: '달러/원', number: '1,398원 (+1.1%)',
        meaning: '원화 약세로 미국 주식의 원화 환산 평가액은 주가 하락분을 일부 상쇄합니다.' },
    ],
    actions: [
      '보유 성장주의 비중이 금리 1%p 추가 상승을 견딜 수 있는 크기인지 확인해 보실 수 있습니다.',
      '환율 1,400원 부근에서 미국 비중을 더 늘릴지 미리 정해 두실 수 있습니다.',
    ],
    watch: '11월 7일 미국 고용지표 발표 — 금리 방향을 다시 정할 가능성이 있습니다.',
    facts: { cpi: '3.1% (9월)', policy_rate: '4.00~4.25%', next_event: '12월 10일 FOMC' },
    quotes: [
      { label: 'S&P500', ticker: '^GSPC', group: 'index', price: 5821.3, pct: -1.12 },
      { label: '나스닥', ticker: '^IXIC', group: 'index', price: 18422.1, pct: -1.82 },
      { label: 'VIX', ticker: '^VIX', group: 'index', price: 19.4, pct: 12.3 },
      { label: '코스닥', ticker: '^KQ11', group: 'index', price: null, pct: null },
      { label: '미국 10년', ticker: '^TNX', group: 'rate', price: 4.21, pct: 2.31 },
      { label: '달러/원', ticker: 'KRW=X', group: 'fx', price: 1398.2, pct: 1.07 },
      { label: 'WTI 유가', ticker: 'CL=F', group: 'commodity', price: 71.2, pct: -3.44 },
      { label: '비트코인', ticker: 'BTC-USD', group: 'crypto', price: 91200, pct: -5.6 },
    ],
    unmeasured: ['소비자물가(CPI)·기준금리는 발표값입니다'],
    created_at: Math.floor(Date.now() / 1000) - 3600,
  },
  links: [
    { key: 'rate_up', title: '금리가 올랐습니다', metric: '미국 10년 +2.31%',
      why: '할인율이 오르면 먼 미래 이익의 현재가치가 먼저 깎입니다.',
      scope: '기술 · 통신서비스 · 소비재', count: 5, weight: 61.4,
      names: ['엔비디아', '알파벳 클래스A', '마이크로소프트', '삼성전자우선주'],
      look: '내 성장주 비중이 감당할 수 있는 크기인지' },
    { key: 'fx', title: '달러/원이 크게 움직였습니다', metric: '달러/원 +1.07%',
      why: '미국 주식은 주가와 환율 두 가지로 평가액이 바뀝니다.',
      scope: '미국 보유', count: 6, weight: 48.2,
      names: ['엔비디아', '알파벳 클래스A', '테슬라', '애플'],
      look: '미국 비중이 환율 변동을 견딜 크기인지' },
  ],
  basis: { weight_basis: '시세가 조회된 보유 종목의 평가액 합 (예수금 제외)',
    holdings_counted: 13, fx_basis: 'USD/KRW 1시간 캐시 환율로 원화 환산' },
  note: '금리 쪽을 먼저 보시면 됩니다 — 보유의 61.4%가 금리 민감 업종입니다. '
      + '환율 상승분이 주가 하락을 가리고 있는지 확인해 보실 수 있습니다.',
  unmeasured: ['소비자물가(CPI)·기준금리는 시세가 아니라 발표값입니다',
    '실적 발표·가이던스 등 개별 기업 이벤트는 보지 않습니다',
    '수급과 옵션 만기는 포함되지 않습니다',
    '미국 2년물은 시세 제공처에 없어 13주·5년으로 대신 읽습니다'],
}

const browser = await chromium.launch({ channel: 'chromium' })
let bad = 0

for (const W of [390, 1440]) {
  const app = W <= 700
  const ctx = await browser.newContext({
    viewport: { width: W, height: 1100 },
    ...(app ? { isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } : {}),
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })

  await page.route('**/api/market/brief', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }))

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async (isApp) => {
    const r = await fetch('/api/auth/demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    localStorage.setItem('authToken', (await r.json()).token)
    localStorage.setItem('layoutMode', isApp ? 'app' : 'web')
  }, app)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2800)
  for (const n of ['건너뛰기', '닫기']) {
    const b = page.getByRole('button', { name: n }).first()
    if (await b.count()) { await b.evaluate(el => el.click()).catch(() => {}); await page.waitForTimeout(300) }
  }
  const tab = page.getByRole('button', { name: '시장', exact: true }).first()
  if (!(await tab.count())) { console.log(`FAIL ${W}: 시장 탭 버튼을 못 찾음`); bad++; await ctx.close(); continue }
  await tab.evaluate(el => el.click())
  await page.waitForTimeout(6000)

  const r = await page.evaluate(() => {
    const txt = document.body.innerText
    const find = (s) => [...document.querySelectorAll('*')]
      .find(e => e.children.length === 0 && e.textContent.trim() === s)
    const briefEl = [...document.querySelectorAll('*')]
      .find(e => e.children.length === 0 && e.textContent.trim() === '오늘의 시황')
    const calEl = [...document.querySelectorAll('*')]
      .find(e => e.children.length === 0 && e.textContent.trim() === '실적 캘린더')
    const card = briefEl ? briefEl.closest('.mono-card') : null

    // 카드 안에서 가로로 넘치는 요소 (Range 로 **그 요소가 직접 가진 글자**만 잰다)
    let over = 0
    if (card) {
      for (const el of card.querySelectorAll('div,span,b,li,button')) {
        const cs = getComputedStyle(el)
        if (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') continue
        if (!el.clientWidth) continue
        const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())
        if (!nodes.length) continue
        const box = el.getBoundingClientRect()
        const L = box.left + (parseFloat(cs.paddingLeft) || 0)
        const R = box.right - (parseFloat(cs.paddingRight) || 0)
        for (const n of nodes) {
          const rg = document.createRange(); rg.selectNodeContents(n)
          for (const rect of rg.getClientRects()) {
            if (rect.width && (rect.left < L - 4 || rect.right > R + 4)) { over++; break }
          }
        }
      }
    }
    return {
      hasCard: !!card,
      briefTop: briefEl ? Math.round(briefEl.getBoundingClientRect().top + window.scrollY) : null,
      calTop:   calEl   ? Math.round(calEl.getBoundingClientRect().top + window.scrollY) : null,
      headline: txt.includes('10년물이 4.21%'),
      movers:   txt.includes('국채 입찰 부진'),
      actions:  txt.includes('금리 1%p 추가 상승'),
      watch:    txt.includes('11월 7일 미국 고용지표'),
      myLinks:  txt.includes('내 보유에 비추면') && txt.includes('61.4%'),
      provenance: txt.includes('AI 가 아니라'),
      aiNote:   txt.includes('AI 한 줄'),
      quotes:   txt.includes('나스닥') && txt.includes('-1.82%'),
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
      over,
    }
  })

  const need = ['hasCard', 'headline', 'movers', 'actions', 'watch',
                'myLinks', 'provenance', 'aiNote', 'quotes']
  const missing = need.filter(k => !r[k])
  const orderOk = r.briefTop != null && r.calTop != null && r.briefTop < r.calTop

  if (missing.length) { console.log(`FAIL ${W}: 안 보이는 것 — ${missing.join(', ')}`); bad++ }
  else if (!orderOk)  { console.log(`FAIL ${W}: 시황(${r.briefTop})이 실적 캘린더(${r.calTop})보다 아래다`); bad++ }
  else if (r.over)    { console.log(`FAIL ${W}: 카드 안에서 글자가 넘친 요소 ${r.over}개`); bad++ }
  else console.log(`  OK  ${W}  카드폭 ${r.cardWidth} · 시황 top ${r.briefTop} < 캘린더 ${r.calTop} · 넘침 0`)

  if (errs.length) { console.log(`     콘솔 오류 ${errs.length}건: ${errs[0]}`); bad++ }
  await ctx.close()
}

await browser.close()
console.log('')
console.log(bad ? `${bad}건 실패` : '전부 통과 — 시황 카드 3층이 두 폭에서 모두 읽힌다')
process.exit(bad ? 1 : 0)

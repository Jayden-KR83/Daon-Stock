/**
 * 증권사 HTS 내보내기 파일 → 다온 보유 종목 행.
 *
 * 왜 별도 모듈인가: 증권사마다 열 이름·헤더 위치·인코딩이 다르고 앞으로 더 늘어난다.
 * 파싱을 React 밖으로 빼면 실제 내보내기 파일로 바로 검증할 수 있다(node 로 돌려본다).
 *
 * 설계 원칙 — 틀린 값을 채우는 것은 빈칸으로 두는 것보다 나쁘다.
 *   · 열 이름은 **정확히 일치**할 때만 인정한다. 부분 일치를 허용하면 키움의
 *     '손익분기매입가'가 '매입가'로 잡혀 수수료 포함 단가가 평단으로 들어간다.
 *   · 못 읽은 행은 조용히 버리지 않는다 — issues 로 올려 사람이 보게 한다.
 */

/* ── 1. 인코딩 ─────────────────────────────────────────────────
   HTS 내보내기는 거의 CP949(euc-kr)다. UTF-8 로 읽으면 종목명이 깨지고,
   깨진 이름은 티커 조회도 실패시킨다. BOM → 엄격 UTF-8 → euc-kr 순으로 본다.
   (WHATWG 의 'euc-kr' 디코더는 CP949 확장 영역까지 포함한다) */
export function decodeFileBytes(buf) {
  const bytes = new Uint8Array(buf)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('euc-kr').decode(bytes)
  }
}

/* ── 2. CSV ────────────────────────────────────────────────────
   직접 쓴 이유: 키움은 "106,934.50" 처럼 인용부호 안에 콤마를 넣는다.
   split(',') 로는 열이 어긋난다. */
export function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/* ── 3. 열 이름 사전 ──────────────────────────────────────────── */
const norm = (h) => String(h ?? '').replace(/\s+/g, '').replace(/[()[\]_·]/g, '').toLowerCase()

export const FIELD_ALIASES = {
  // 실측: 미래에셋 '종목번호', 키움 '코드'
  ticker:    ['종목번호', '종목코드', '코드', '단축코드', '티커', '티커명', 'symbol', 'ticker'],
  name:      ['종목명', '종목이름', '상품명', '종목', '펀드명', 'name', 'description'],
  // '가능수량'(키움)·'현재가'는 일부러 제외
  // 순서가 곧 우선순위다 — 한 파일에 여럿 있으면 앞의 것을 쓴다.
  // '매입수량'은 2026-10 키움 개편으로 '보유량'을 대체한 이름이다. 뒤에 두는 이유:
  // 다른 증권사에서 '보유량'과 '매입수량'이 함께 나오면 보유량이 현재 잔고다.
  quantity:  ['보유량', '보유수량', '잔고수량', '현재잔고', '결제보유수량',
              '체결보유수량', '주식수', '매입수량', '수량', 'qty', 'quantity', 'shares'],
  // ⚠ '손익분기매입가'(수수료 포함)는 평단이 아니다 — 정확 일치라 걸리지 않는다
  avgPrice:  ['평균단가', '매입단가', '매입가', '평단가', '평균매입단가', '매입평균단가',
              '평균취득가', 'avgprice', 'avgcost', 'averagecost', 'costbasis'],
  // 평단이 없는 파일(미래 퇴직연금)에서 평단을 유도하는 근거
  buyAmount: ['매입금액', '매입원금', '총매입금액', '매입원가', '투자원금', '취득금액'],
  currency:  ['통화', '통화코드', 'currency'],
  kind:      ['유형', '종목유형', '상품유형'],
  // 다온 자체 템플릿(계좌명·섹터가 행마다 있다)도 같은 파서를 타게 한다.
  // HTS 파일엔 이 두 열이 없고, 그때는 파일명이 계좌를 정한다.
  account:   ['계좌명', '계좌', 'account'],
  sector:    ['섹터', '업종', 'sector', 'industry'],
}

/** 헤더 행을 스스로 찾는다 — 키움은 0행이 Version=1.0 이고 헤더가 1행에 있다. */
export function findHeaderRow(aoa, limit = 20) {
  let best = { idx: -1, score: 0, map: null }
  for (let r = 0; r < Math.min(aoa.length, limit); r++) {
    const cells = (aoa[r] || []).map(norm)
    const map = {}
    for (const [field, names] of Object.entries(FIELD_ALIASES)) {
      // 별칭 순서대로 찾는다. 예전엔 cells.findIndex 로 **열 순서**가 이겨서
      // '매입수량'이 '보유량'보다 왼쪽에 있으면 우선순위가 뒤집혔다.
      for (const n of names) {
        const at = cells.indexOf(n)
        if (at >= 0) { map[field] = at; break }
      }
    }
    const score = Object.keys(map).length
    // 이름과 수량이 없으면 보유 종목 표가 아니다
    if (map.name == null || map.quantity == null) continue
    if (score > best.score) best = { idx: r, score, map }
  }
  return best
}

/* ── 4. 값 정제 ──────────────────────────────────────────────── */
export function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null
  let s = String(v ?? '').trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[(),\s'"%₩$]/g, '').replace(/원$/, '').replace(/^-/, '')
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = parseFloat(s)
  if (!isFinite(n)) return null
  return neg ? -n : n
}

/** A005490 → 005490 · 5930 → 005930. 다온은 한국 종목을 6자리 숫자로 쓴다. */
export function normalizeTicker(raw) {
  let t = String(raw ?? '').trim().toUpperCase()
  if (!t) return ''
  // 2026-10 키움 개편: 코드가 `'NDAAPL` 형태로 바뀌었다
  // (작은따옴표 = 엑셀 텍스트 강제, ND/NY/NA = 나스닥·뉴욕·아멕스).
  // 예전 파일의 `종목풀코드` 열에 있던 값이 이제 주 코드 자리로 왔다.
  // **작은따옴표가 붙어 있을 때만** 접두를 떼어낸다 — 그 표식이 없으면
  // NDAQ(나스닥 주식) 같은 멀쩡한 티커를 AQ 로 망가뜨린다.
  const kiwoom = t.match(/^'(?:ND|NY|NA|AM|BA)([A-Z][A-Z.]{0,5})$/)
  if (kiwoom) return kiwoom[1]
  if (t.startsWith("'")) t = t.slice(1)      // 따옴표만 붙은 경우
  if (/^A\d{6}$/.test(t)) return t.slice(1)
  if (/^\d{1,6}$/.test(t)) return t.padStart(6, '0')
  return t
}

/** 거래소에서 티커로 살 수 없는 줄 — 예수금·공모펀드·MMF. 이름으로만 판별된다.
 *
 *  두 군데서 쓰인다:
 *   ① 파일을 읽을 때 — 티커가 없고 '보유량'이 주수가 아니라 좌수·금액이라 가져오면 안 된다.
 *   ② 삭제 여부를 정할 때 — 이런 종목은 파일에 **있는데도** 못 읽은 것이므로
 *      "파일에 없음 → 삭제"에 휩쓸리면 안 된다. 오너가 다온에 손으로 넣어 둔 값을 지킨다.
 *  그래서 오너가 줄여 적은 이름('TDF2045')도 걸리게 'tdf'·'펀드'를 넣어 둔다. */
const NON_TRADABLE = ['현금성자산', '예수금', '투자신탁', 'tdf', '펀드', 'mmf', 'rp',
                      '발행어음', '예금', '보험', '연금저축']
export function isNonTradable(name) {
  const n = norm(name)
  return NON_TRADABLE.some(k => n.includes(k))
}

/* ── 5. 파일명에서 계좌·섹터를 읽는다 ──────────────────────────
   HTS 내보내기에는 계좌도 섹터도 없다. 매번 손으로 열을 붙이는 대신
   파일명에 적어 두면 파서가 읽는다. */
const ACCOUNT_TOKEN_ALIASES = {
  US:          ['미국', '해외', '해외주식', 'us', 'usa', '글로벌'],
  KR_RETIRE:   ['퇴직', '퇴직연금', '연금', 'irp', 'dc', 'retire', 'pension'],
  KR_ISA:      ['isa'],
  KR_PERSONAL: ['개별', '한국', '국내', '일반', '위탁', '개인', 'kr'],
}
const BROKERS = ['키움', '미래에셋', '미래', '한국투자', '한투', '삼성', 'nh', '신한', 'kb', '토스', '대신', 'ls']

export function tokenizeFilename(filename) {
  return String(filename || '').replace(/\.[^.]+$/, '')
    .split(/[_\-\s.()[\]]+/).map(t => t.trim()).filter(Boolean)
}

/**
 * 파일명 → 계좌 key. 확신이 없으면 고르지 않고 후보를 돌려준다.
 * @param accounts useAccounts() 의 [{key,label}] — 계좌는 사용자가 만들므로
 *                 레이블 일치를 먼저 보고, 그 다음 별칭표를 본다.
 */
export function accountFromFilename(filename, accounts = []) {
  const tokens = tokenizeFilename(filename)
  const keys = new Set(accounts.map(a => a.key))
  const hits = new Set()

  for (const a of accounts) {
    const lab = norm(a.label)
    if (lab && tokens.some(t => norm(t) === lab)) hits.add(a.key)
  }
  for (const [key, aliases] of Object.entries(ACCOUNT_TOKEN_ALIASES)) {
    if (keys.size && !keys.has(key)) continue
    if (tokens.some(t => aliases.includes(norm(t)))) hits.add(key)
  }
  const list = [...hits]
  return { key: list.length === 1 ? list[0] : null, candidates: list }
}

/** 섹터=반도체 / sector=Technology. 표식을 요구하는 이유는 parseHoldingsFile 주석 참고. */
export function sectorFromFilename(filename) {
  const m = String(filename || '').match(/(?:섹터|sector|sec)\s*=\s*([^_\-.]+)/i)
  return m ? m[1].trim() : ''
}

export function brokerFromFilename(filename) {
  const tokens = tokenizeFilename(filename).map(norm)
  return BROKERS.find(b => tokens.includes(norm(b))) || ''
}

/** 261008 → 2026-10-08. 미리보기에 기준일을 보여주기 위한 것. */
export function dateFromFilename(filename) {
  for (const t of tokenizeFilename(filename)) {
    if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}`
    if (/^\d{6}$/.test(t)) return `20${t.slice(0, 2)}-${t.slice(2, 4)}-${t.slice(4)}`
  }
  return ''
}

/* ── 6. 본체 ──────────────────────────────────────────────────── */
/**
 * @returns {{
 *   filename, broker, asOf, accountKey, accountCandidates, sectorHint,
 *   headerRow, headers, fields, rows, issues
 * }}
 *   rows:   { ticker, name, quantity, avgPrice, currency, derivedAvg, needsLookup, line }
 *   issues: { line, name, reason }  — 가져올 수 없는 행. 버리지 않고 사람에게 보인다.
 *
 * 섹터를 파일명에서만 받는 이유와 한계:
 *   한 파일에 여러 섹터가 섞인다(키움 미국 파일엔 NVDA 와 TLT 가 같이 있다).
 *   그래서 파일명 섹터는 **빈칸을 채우는 마지막 수단**으로만 쓴다.
 *   우선순위: 기존 다온 값 > 티커 조회 결과 > 파일명 힌트 > 빈칸.
 */
export function parseHoldingsFile({ filename, aoa, accounts = [] }) {
  const broker = brokerFromFilename(filename)
  const asOf = dateFromFilename(filename)
  const { key: accountKey, candidates: accountCandidates } = accountFromFilename(filename, accounts)
  const sectorHint = sectorFromFilename(filename)

  const head = findHeaderRow(aoa)
  if (head.idx < 0) {
    const seen = (aoa.find(r => (r || []).some(c => String(c).trim())) || []).filter(Boolean)
    return {
      filename, broker, asOf, accountKey, accountCandidates, sectorHint,
      headerRow: -1, headers: seen, fields: {}, rows: [],
      issues: [{ line: 0, name: '', reason: '보유 종목 표를 찾지 못했습니다(종목명·수량 열 필요)' }],
    }
  }

  const f = head.map
  const headers = (aoa[head.idx] || []).map(c => String(c).trim())
  const at = (row, i) => (i == null ? '' : row[i])

  const rows = [], issues = []
  for (let r = head.idx + 1; r < aoa.length; r++) {
    const row = aoa[r] || []
    if (!row.some(c => String(c ?? '').trim())) continue        // 꼬리 빈 행(미래에셋)

    const name = String(at(row, f.name) ?? '').trim()
    const ticker = normalizeTicker(at(row, f.ticker))
    if (!name && !ticker) continue

    const quantity = toNum(at(row, f.quantity))
    const line = r + 1

    if (isNonTradable(name)) {
      issues.push({ line, name, reason: '거래소 종목이 아닙니다(예수금·펀드) — 손으로 등록하세요' })
      continue
    }
    if (!(quantity > 0)) {
      issues.push({ line, name: name || ticker, reason: `수량을 읽을 수 없습니다: "${at(row, f.quantity)}"` })
      continue
    }

    // 평단이 없는 파일(미래 퇴직연금)은 매입금액 ÷ 수량으로 유도한다.
    let avgPrice = toNum(at(row, f.avgPrice))
    let derivedAvg = false
    if (!(avgPrice > 0)) {
      const amt = toNum(at(row, f.buyAmount))
      if (amt > 0) { avgPrice = amt / quantity; derivedAvg = true }
    }
    if (!(avgPrice > 0)) {
      issues.push({ line, name: name || ticker, reason: '평균단가·매입금액이 모두 없어 평단을 구할 수 없습니다' })
      continue
    }

    rows.push({
      ticker, name,
      quantity,
      // 유도한 평단은 소수가 길어진다 — 보기 좋은 자리에서 끊는다
      avgPrice: derivedAvg ? Math.round(avgPrice * 1e4) / 1e4 : avgPrice,
      currency: String(at(row, f.currency) ?? '').trim().toUpperCase(),
      derivedAvg,
      needsLookup: !ticker,      // 티커가 없으면 종목명으로 찾아야 가져올 수 있다
      line,
      // 다온 템플릿에서만 채워진다 — 있으면 파일명보다 이 값이 우선이다
      accountLabel: String(at(row, f.account) ?? '').trim(),
      sector: String(at(row, f.sector) ?? '').trim(),
    })
  }

  return {
    filename, broker, asOf, accountKey, accountCandidates, sectorHint,
    headerRow: head.idx, headers, fields: f, rows, issues,
  }
}

/* ── 7. 병합 ───────────────────────────────────────────────────
   React 밖에 두는 이유: 여기가 제일 위험한 코드다. 계좌 범위를 틀리면
   올리지 않은 계좌의 보유 종목이 사라진다. 실파일로 돌려볼 수 있어야 한다. */

export const nearEq = (a, b) => {
  const x = a === '' || a == null ? null : Number(a)
  const y = b === '' || b == null ? null : Number(b)
  if (x == null || y == null) return x === y
  // 평단은 유도값(매입금액÷수량)이 섞여 끝자리가 흔들린다 — 0.01% 안이면 같은 값으로 본다
  return Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 1e-4
}

/**
 * 파일 행 → 계좌별 다온 행. 우선순위를 코드로 못 박아 둔다:
 *   티커   파일 > 이름 조회
 *   종목명 기존 다온 값 > 파일 > 조회      (사람이 다듬어 둔 이름을 덮지 않는다)
 *   섹터   파일 > 기존 다온 값 > 조회 > 파일명 힌트
 *
 * @param found  { 'name:<종목명>'|'tkr:<티커>' → {ticker,name,sector} } 조회 결과 캐시
 * @param assign { 파일 index → 계좌 key } — 파일에 계좌명 열이 있으면 그 값이 이긴다
 */
export function buildImportRows({ files, assign = {}, found = {}, existingRows = [], accounts = [] }) {
  const labelToKey = Object.fromEntries(accounts.map(a => [a.label, a.key]))
  const existingByKey = {}
  for (const r of existingRows) existingByKey[`${r.account}:${String(r.ticker).toUpperCase()}`] = r

  const perAccount = {}, unresolved = [], dupes = []
  files.forEach((f, i) => {
    for (const r of f.rows) {
      const acc = labelToKey[r.accountLabel] || assign[i] || ''
      if (!acc) continue
      const hit = r.needsLookup ? found[`name:${r.name}`] : null
      const ticker = String(r.ticker || hit?.ticker || '').toUpperCase()
      if (!ticker) { unresolved.push({ file: f.filename, line: r.line, name: r.name }); continue }

      const prev = existingByKey[`${acc}:${ticker}`]
      const sector = r.sector || prev?.sector
        || (r.needsLookup ? hit?.sector : found[`tkr:${ticker}`]?.sector) || f.sectorHint || ''

      const list = (perAccount[acc] ||= [])
      if (list.some(x => x.ticker === ticker)) {
        dupes.push({ account: acc, ticker, file: f.filename }); continue
      }
      const row = {
        account: acc, ticker,
        name: (prev?.name || r.name || hit?.name || ticker).trim(),
        quantity: r.quantity, avg_price: r.avgPrice, sector,
        krw_avg_price: 0, krw_fx: 0,
        _src: f.filename, _derivedAvg: r.derivedAvg,
      }
      // 원화로 넣어 둔 평단 기록은 평단이 그대로일 때만 유효하다
      if (prev?.krw_avg_price > 0 && nearEq(prev.avg_price, row.avg_price)) {
        row.krw_avg_price = prev.krw_avg_price; row.krw_fx = prev.krw_fx
      }
      list.push(row)
    }
  })
  return { perAccount, unresolved, dupes }
}

/**
 * 계좌별 신규·변경·그대로·파일에 없음. 사람에게 보여줄 유일한 근거다.
 *
 * '파일에 없음'은 둘로 쪼갠다 — 둘의 뜻이 정반대이기 때문이다:
 *   missing    진짜 없다 → 그 사이 전량매도했을 수 있다 → 기본 삭제
 *   protected  예수금·펀드처럼 **파일에 있지만 못 읽은** 줄 → 기본 유지
 *              (오너가 손으로 넣어 둔 TDF·예수금이 갱신 때마다 사라지면 안 된다)
 */
export function diffAccounts({ perAccount, existingRows = [], order = [] }) {
  return Object.entries(perAccount).map(([acc, rows]) => {
    const byTicker = Object.fromEntries(rows.map(r => [r.ticker, r]))
    const mine = existingRows.filter(r => r.account === acc)
    const added = rows.filter(r => !mine.some(m => String(m.ticker).toUpperCase() === r.ticker))
    const changed = [], same = []
    for (const m of mine) {
      const r = byTicker[String(m.ticker).toUpperCase()]
      if (!r) continue
      ;(nearEq(m.quantity, r.quantity) && nearEq(m.avg_price, r.avg_price) ? same : changed)
        .push({ from: m, to: r })
    }
    const gone = mine.filter(m => !byTicker[String(m.ticker).toUpperCase()])
    return {
      acc, added, changed, same,
      missing:   gone.filter(m => !isNonTradable(m.name)),
      protected: gone.filter(m => isNonTradable(m.name)),
    }
  }).sort((a, b) => order.indexOf(a.acc) - order.indexOf(b.acc))
}

/**
 * 최종 행 목록. **업로드한 계좌만 교체하고 나머지는 그대로 둔다** —
 * 이 함수의 존재 이유이자, 계좌별 파일을 여러 개 올릴 수 있는 근거다.
 */
export function mergeImport({ perAccount, diff, existingRows = [],
                              dropMissing = true, dropProtected = false }) {
  const involved = new Set(Object.keys(perAccount))
  const next = existingRows.filter(r => !involved.has(r.account))
  for (const d of diff) {
    next.push(...perAccount[d.acc])
    if (!dropMissing) next.push(...d.missing)
    if (!dropProtected) next.push(...d.protected)
  }
  return next
}

/* ── 8. 증권사 표기 ───────────────────────────────────────────────
   'A005490' 은 KRX 의 공식 코드가 아니라 **증권사 내보내기 관례**다.
   KRX·네이버·야후가 쓰는 단축코드는 6자리 '005490' 이고, 시세·검색·중복 판정이
   전부 그 형태를 기준으로 돈다. 그래서 저장은 6자리로 하되,
   HTS 파일과 눈으로 대조하는 화면에서는 증권사가 쓰는 모습 그대로 보여 준다.
   (저장값에서 매번 만들어 내므로 둘이 어긋날 일이 없다) */
export function brokerTicker(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  return /^\d{6}$/.test(t) ? 'A' + t : t
}

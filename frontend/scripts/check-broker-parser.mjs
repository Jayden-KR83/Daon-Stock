/**
 * 증권사 파일 파서 회귀 검사 — 2026-10-22 사고의 재발 방지.
 *
 * 무슨 일이 있었나
 * ----------------
 * 키움이 보유 종목 내보내기 포맷을 **말없이 바꿨다**. 같은 메뉴, 같은 확장자인데
 * 열 이름이 달라졌다.
 *
 *   옛(10-08):  코드     · 매입가   · 보유량     · 티커 `NVDA`
 *   새(10-22):  종목코드 · 매입단가 · 매입수량   · 티커 `'NDAAPL`
 *
 * 파서는 "종목명 + 수량" 열이 둘 다 보여야 헤더로 인정하는데 `매입수량`을 몰라
 * **헤더 자체를 못 찾았다** → 미국 계좌 24종목이 0종목이 됐다. 화면에는
 * "헤더 못 찾음"만 떴고, 오너는 파일이 잘못된 줄 알았다.
 *
 * **외부 파일 포맷은 예고 없이 바뀐다.** 코드가 멀쩡해도 깨진다.
 * 그래서 실제 내보내기 파일을 리포에 두고 **매번 다시 읽어 본다.**
 *
 * 왜 실파일을 쓰나
 * ---------------
 * 손으로 만든 픽스처는 '내가 상상한 포맷'을 검사할 뿐이다. 이번 변경은
 * 상상 밖에서 왔다(아포스트로피 + 거래소 접두 `'ND`). 실파일만이 그걸 잡는다.
 * 금액·수량이 들어 있으므로 저장소가 공개로 바뀌면 data/ 를 함께 점검할 것.
 *
 * 사용: node scripts/check-broker-parser.mjs   (frontend 에서)
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import {
  decodeFileBytes, parseCsv, parseHoldingsFile, normalizeTicker, findHeaderRow,
} from '../src/utils/brokerImport.js'

let fail = 0
const eq = (got, want, label) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${ok ? '' : ` — ${got} (기대 ${want})`}`)
}

/* ── 1. 티커 정규화 ───────────────────────────────────────────── */
console.log('티커 정규화')
eq(normalizeTicker("'NDAAPL"), 'AAPL', "키움 나스닥 'NDAAPL")
eq(normalizeTicker("'NYBMNR"), 'BMNR', "키움 뉴욕 'NYBMNR")
eq(normalizeTicker("'NASPCX"), 'SPCX', "키움 아멕스 'NASPCX")
// ⚠ 접두 제거의 위험: 표식(작은따옴표) 없이 떼면 멀쩡한 티커가 망가진다
eq(normalizeTicker('NDAQ'), 'NDAQ', '접두 없는 NDAQ 는 건드리지 않는다')
eq(normalizeTicker('NYT'), 'NYT', '접두 없는 NYT 는 건드리지 않는다')
eq(normalizeTicker('A005490'), '005490', '미래에셋 A접두')
eq(normalizeTicker('0131V0'), '0131V0', '영숫자 한국 코드')

/* ── 2. 헤더 인식 (옛·새 포맷 모두) ───────────────────────────── */
console.log('\n헤더 인식')
const kiwoomNew = [['Version=1.0'],
  ['종목코드', '종목명', '매입금액', '평가금액', '손익', '수익률', '매입단가',
   '현재가', '전일대비', '', '등락률', '거래량', '매입수량']]
const hNew = findHeaderRow(kiwoomNew)
eq(hNew.idx, 1, '새 키움 헤더행')
eq(hNew.map.quantity, 12, '  수량 = 매입수량 열')
eq(hNew.map.avgPrice, 6, '  평단 = 매입단가 열')

const kiwoomOld = [['Version=1.0'],
  ['', '코드', '종목명', '평가손익', '평가수익률', '매입가', '보유량']]
const hOld = findHeaderRow(kiwoomOld)
eq(hOld.idx, 1, '옛 키움 헤더행 (하위호환)')
eq(hOld.map.quantity, 6, '  수량 = 보유량 열')

// 둘 다 있으면 '보유량'(현재 잔고)이 이겨야 한다. 열 순서가 아니라 별칭 순서로.
eq(findHeaderRow([['종목명', '매입수량', '보유량']]).map.quantity, 2,
   '보유량·매입수량 공존 시 보유량 우선')

/* ── 3. 실제 내보내기 파일 ────────────────────────────────────── */
const ACC = [{ key: 'US', label: '미국' }, { key: 'KR_RETIRE', label: '퇴직' },
             { key: 'KR_PERSONAL', label: '개별' }, { key: 'KR_ISA', label: 'ISA' }]

// cwd 가 아니라 이 파일 위치 기준 — 어디서 돌려도 같은 결과여야 한다
const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = (d) => resolve(HERE, '..', '..', 'data', d)

/** 보관해 둔 실파일 — 폴더별 '이 파일은 최소 몇 종목이 읽혀야 한다' */
const FIXTURES = [
  { dir: DATA('261008'), min: { 'US': 24, 'KR_RETIRE': 13, 'KR_PERSONAL': 6, 'KR_ISA': 3 } },
  { dir: DATA('261022'), min: { 'US': 24, 'KR_RETIRE': 13, 'KR_PERSONAL': 9, 'KR_ISA': 4 } },
]

for (const fx of FIXTURES) {
  console.log(`\n실파일 — ${fx.dir}`)
  if (!existsSync(fx.dir)) { console.log('  (폴더 없음 — 건너뜀)'); continue }
  const got = {}
  for (const fn of readdirSync(fx.dir)) {
    if (!/\.(csv|xls|xlsx|txt)$/i.test(fn)) continue
    const b = readFileSync(`${fx.dir}/${fn}`)
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
    const aoa = /\.(csv|txt)$/i.test(fn)
      ? parseCsv(decodeFileBytes(ab))
      : XLSX.utils.sheet_to_json(
          XLSX.read(ab, { type: 'array' }).Sheets[XLSX.read(ab, { type: 'array' }).SheetNames[0]],
          { header: 1, defval: '', raw: true })
    const r = parseHoldingsFile({ filename: fn, aoa, accounts: ACC })
    if (r.accountKey) got[r.accountKey] = (got[r.accountKey] || 0) + r.rows.length
  }
  for (const [acc, min] of Object.entries(fx.min)) {
    const n = got[acc] || 0
    const ok = n >= min
    if (!ok) fail++
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${acc} ${n}종목${ok ? '' : ` (최소 ${min} 기대 — 포맷이 또 바뀌었나?)`}`)
  }
}

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과')
process.exit(fail ? 1 : 0)

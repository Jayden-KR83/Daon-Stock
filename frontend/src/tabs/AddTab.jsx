import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, savePortfolio, getUsdKrw, resolveTicker, resolveByName } from '../api'
import { useAccounts } from '../utils/accounts'
import * as XLSX from 'xlsx'
import BrokerImportSheet from '../components/BrokerImportSheet'
import SectorSelect from '../components/SectorSelect'
import { decodeFileBytes, parseCsv, parseHoldingsFile, brokerTicker } from '../utils/brokerImport'

/**
 * 등록 탭 — 엑셀식 인라인 편집기 + 엑셀 파일 가져오기/내보내기.
 * 모든 계좌의 보유 종목을 한 표에서 직접 편집하고, 엑셀 업로드 시 그리드에 채워 검토 후
 * '저장'하면 savePortfolio(전체 교체 + 자동 백업)로 앱 전체에 즉시 반영.
 */
let _uid = 0
const KR_RE = /^A?\d[0-9A-Z]{5}$/
const TEMPLATE_COLS = ['종목명', '티커명', '평균단가', '수량', '계좌명', '섹터']
const TEMPLATE_SAMPLE = [
  ['Apple Inc.', 'AAPL', 180.50, 10, '미국', 'Technology'],
  ['삼성전자', '005930', 71000, 50, '개별', 'IT·반도체'],
]

/* ── 숫자 입력칸 — 보이는 값에는 콤마, 저장되는 값은 순수 숫자 ──────────
   지인 피드백 2: "평균단가 금액에 콤마를 추가해 주십쇼".
   `type="number"` 로는 콤마를 넣을 수 없다(브라우저가 값을 거부한다).
   그래서 텍스트 입력으로 바꾸고 표시만 포맷한다.

   ⚠ 편집 중에는 포맷하지 않는다. 타이핑 도중 콤마가 끼어들면 커서가 튀어
     '1,00,0' 같은 값이 만들어진다. 포커스가 빠질 때만 정돈한다.
   ⚠ 소수점 입력(0.5주, $12.34)을 막지 않는다 — 암호화폐·해외주식에 필요하다. */
function fmtWithComma(v) {
  const n = Number(v)
  if (v === '' || v === null || v === undefined || !isFinite(n)) return String(v ?? '')
  const [i, d] = String(v).split('.')
  const head = Number(i || 0).toLocaleString()
  return d !== undefined ? `${head}.${d}` : head
}

function NumCell({ value, onChange, placeholder }) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const shown = editing ? draft : fmtWithComma(value)
  return (
    <input
      type="text" inputMode="decimal" placeholder={placeholder}
      value={shown}
      style={{ minWidth: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
      onFocus={() => { setDraft(value === '' || value == null ? '' : String(value)); setEditing(true) }}
      onChange={e => {
        // 숫자·소수점·마이너스만 통과시킨다. 콤마는 여기서 걷어낸다.
        const raw = e.target.value.replace(/[^\d.\-]/g, '')
        setDraft(raw)
        onChange(raw)
      }}
      onBlur={() => setEditing(false)}
    />
  )
}

function rowsFromPortfolio(pf) {
  const out = []
  for (const acc of Object.keys(pf?.portfolios || {})) {
    for (const h of (pf.portfolios[acc] || [])) {
      out.push({
        _k: ++_uid, account: acc,
        ticker: h.ticker || '', name: h.name || '',
        quantity: h.quantity ?? '', avg_price: h.avg_price ?? '',
        sector: h.sector || '',
        // 원화 평단 입력 기록(있으면) — 저장 때 그대로 되돌려줘야 재편집이 된다
        krw_avg_price: h.krw_avg_price || 0, krw_fx: h.krw_fx || 0,
      })
    }
  }
  return out
}

export default function AddTab() {
  const qc = useQueryClient()
  const { accounts, accountKeys: ACCOUNTS, accLabels: ACC_LABELS } = useAccounts()
  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })
  const { data: fx } = useQuery({ queryKey: ['usdkrw'], queryFn: getUsdKrw, staleTime: 5 * 60_000 })
  const nowRate = Number(fx?.rate) || 0

  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)   // { type:'ok'|'err', text }
  const [dirty, setDirty] = useState(false)
  // 원화 평단 환산기 — 열려 있는 행 하나만. { _k, krw, rate }
  const [fxEdit, setFxEdit] = useState(null)
  // 티커 조회 중인 행 { [_k]: true } — 행마다 따로 표시해야 어디가 도는지 보인다
  const [resolving, setResolving] = useState({})
  // 증권사 파일 검토 시트 — 파싱 결과 배열이 들어오면 열린다
  const [importFiles, setImportFiles] = useState(null)
  const loadedRef = useRef(false)
  const fileRef = useRef(null)

  // 서버 포트폴리오 최초 1회 동기화 (이후엔 로컬 편집이 소스 — 저장/되돌리기로만 재동기화)
  useEffect(() => {
    if (portfolio && !loadedRef.current) {
      setRows(rowsFromPortfolio(portfolio))
      loadedRef.current = true
    }
  }, [portfolio])

  function reloadFromServer() {
    setRows(rowsFromPortfolio(portfolio))
    setDirty(false); setMsg(null)
  }
  function setCell(k, field, value) {
    setRows(rs => rs.map(r => {
      if (r._k !== k) return r
      // 평단가를 손으로 고치면 '원화로 넣었다'는 기록은 더 이상 사실이 아니다 → 흔적 제거
      const drop = field === 'avg_price' ? { krw_avg_price: 0, krw_fx: 0 } : null
      return { ...r, [field]: value, ...(drop || {}) }
    }))
    setDirty(true); setMsg(null)
  }
  function addRow() {
    const k = ++_uid
    setRows(rs => [...rs, {
      _k: k, account: accounts[0]?.key || ACCOUNTS[0] || '',
      ticker: '', name: '', quantity: '', avg_price: '', sector: '',
      krw_avg_price: 0, krw_fx: 0,
    }])
    setDirty(true); setMsg(null)
    /* 추가한 행이 화면 밖이면 아무 일도 안 일어난 것처럼 보인다(지인 피드백 7).
       렌더가 끝난 뒤 새 행으로 스크롤하고 티커 칸에 커서를 둔다 —
       바로 타이핑을 시작할 수 있어야 '추가'가 완결된다. */
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-rowkey="${k}"] input`)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus({ preventScroll: true })
    })
  }

  /* ── 티커 → 종목명·섹터 자동 조회 (피드백 1·9) ──────────────────────
     사람이 이미 아는 것을 컴퓨터가 다시 묻는 건 폼의 실패다.
     ⚠ 사용자가 직접 적은 값은 덮어쓰지 않는다 — 비어 있을 때만 채운다.
        자동화가 사람이 쓴 것을 지우기 시작하면 신뢰를 잃는다. */
  async function resolveRow(k, rawTicker) {
    const t = String(rawTicker || '').trim()
    if (!t) return
    setResolving(v => ({ ...v, [k]: true }))
    try {
      const d = await resolveTicker(t)
      setRows(rs => rs.map(r => {
        if (r._k !== k) return r
        const next = { ...r }
        if (!String(r.name).trim() && d.name) next.name = d.name
        if (!String(r.sector).trim() && d.sector) next.sector = d.sector
        // 'BTC' → 'BTC-USD' 처럼 정규화된 티커가 오면 그걸로 맞춘다
        if (d.ticker && d.ticker !== r.ticker.trim().toUpperCase()) next.ticker = d.ticker
        return next
      }))
      setDirty(true)
    } catch { /* 조회 실패는 조용히 넘긴다 — 손으로 적으면 그만이다 */ }
    finally { setResolving(v => ({ ...v, [k]: false })) }
  }

  /* ── 종목명 → 티커 (역방향) ────────────────────────────────────
     티커를 외우고 있는 사람은 드물다. '디즈니'라고 적으면 DIS 가 들어와야 한다.
     서버는 확실할 때만 답을 준다(후보가 여럿이면 404) — 엉뚱한 종목을 대신
     넣는 것은 빈칸으로 두는 것보다 나쁘기 때문이다. */
  async function resolveRowByName(k, rawName) {
    const nm = String(rawName || '').trim()
    if (!nm) return
    let skip = false
    setRows(rs => {                       // 최신 행 상태에서 티커 유무를 본다
      const row = rs.find(r => r._k === k)
      if (row && String(row.ticker).trim()) skip = true
      return rs
    })
    if (skip) return                      // 티커가 이미 있으면 건드리지 않는다
    setResolving(v => ({ ...v, [k]: true }))
    try {
      const d = await resolveByName(nm)
      setRows(rs => rs.map(r => {
        if (r._k !== k) return r
        const next = { ...r }
        if (d.ticker && !String(r.ticker).trim()) next.ticker = d.ticker
        if (d.sector && !String(r.sector).trim()) next.sector = d.sector
        return next
      }))
      setDirty(true)
    } catch { /* 못 찾으면 사용자가 적은 이름을 그대로 둔다 */ }
    finally { setResolving(v => ({ ...v, [k]: false })) }
  }
  /* ── 원화 평단 → 달러 평단 환산 ──────────────────────────────
     왜 필요한가: 업비트는 원화로 매수하는데 앱은 BTC-USD(달러 표시)로 시세를 받는다.
     오너가 매번 손으로 나눠 넣던 것을 폼이 대신한다.
     왜 '매수 시점' 환율인가: 현재 환율로 나누면 환율이 움직일 때마다 과거 매수 원가가
     따라 흔들린다. 매수 시점 환율로 한 번 확정하면 avg_price(달러)는 그대로 고정된다.
     — 이건 앱이 이미 미국 주식을 다루는 방식과 같다(원가는 달러, 평가만 현재 환율). */
  function openFx(r) {
    setFxEdit({
      _k: r._k,
      krw:  r.krw_avg_price > 0 ? String(r.krw_avg_price) : '',
      rate: String(r.krw_fx > 0 ? r.krw_fx : (nowRate || '')),
    })
  }
  function applyFx() {
    const krw = parseFloat(fxEdit?.krw), rate = parseFloat(fxEdit?.rate)
    if (!(krw > 0) || !(rate > 0)) {
      setMsg({ type: 'err', text: '원화 평단과 환율을 모두 0보다 큰 값으로 입력하세요.' }); return
    }
    // 8자리: 사토시 단위(1e-8) 자산에서 반올림 손실이 보이지 않을 만큼
    const usd = Math.round((krw / rate) * 1e8) / 1e8
    setRows(rs => rs.map(r => r._k === fxEdit._k
      ? { ...r, avg_price: usd, krw_avg_price: krw, krw_fx: rate } : r))
    setFxEdit(null); setDirty(true)
    setMsg({ type: 'ok', text: `원화 ${krw.toLocaleString()}원 ÷ ${rate.toLocaleString()} = $${usd.toLocaleString(undefined, { maximumFractionDigits: 8 })} 로 평단가를 채웠습니다. 아래 저장을 누르세요.` })
  }

  function removeRow(k) {
    setRows(rs => rs.filter(r => r._k !== k))
    setDirty(true); setMsg(null)
  }

  async function handleSave() {
    // 1) 검증 + 정리 (빈 행은 조용히 무시)
    const cleaned = []
    const seen = new Set()
    for (const r of rows) {
      const ticker = String(r.ticker || '').trim().toUpperCase()
      const blank = !ticker && !r.name && r.quantity === '' && r.avg_price === '' && !r.sector
      if (blank) continue
      if (!ticker) { setMsg({ type: 'err', text: '티커가 비어 있는 행이 있습니다.' }); return }
      if (!r.account || !ACC_LABELS[r.account]) {
        setMsg({ type: 'err', text: `${ticker}: 계좌를 지정하세요.` }); return
      }
      const qty = parseFloat(r.quantity), avg = parseFloat(r.avg_price)
      if (!(qty > 0)) { setMsg({ type: 'err', text: `${ticker}: 수량을 확인하세요.` }); return }
      if (!(avg > 0)) { setMsg({ type: 'err', text: `${ticker}: 평균단가를 확인하세요.` }); return }
      const dupKey = r.account + ':' + ticker
      if (seen.has(dupKey)) {
        setMsg({ type: 'err', text: `${ACC_LABELS[r.account]} · ${ticker}: 같은 계좌에 중복된 종목이 있습니다.` }); return
      }
      seen.add(dupKey)
      const rec = {
        account: r.account, ticker,
        name: String(r.name || '').trim() || ticker,
        quantity: qty, avg_price: avg, sector: String(r.sector || '').trim(),
      }
      if (r.krw_avg_price > 0 && r.krw_fx > 0) {
        rec.krw_avg_price = Number(r.krw_avg_price); rec.krw_fx = Number(r.krw_fx)
      }
      cleaned.push(rec)
    }

    // 2) 계좌별 그룹핑 (모든 계좌 키 포함 — 비운 계좌는 [])
    const portfolios = Object.fromEntries(ACCOUNTS.map(k => [k, []]))
    for (const c of cleaned) {
      const { account, ...rest } = c
      if (!portfolios[account]) portfolios[account] = []
      portfolios[account].push(rest)
    }

    setSaving(true); setMsg(null)
    try {
      await savePortfolio({ portfolios, watchlist: portfolio?.watchlist || [] })
      await qc.refetchQueries({ queryKey: ['portfolio'] })
      setDirty(false)
      setMsg({ type: 'ok', text: `${cleaned.length}종목 저장 완료 — 전체 앱에 반영되었습니다.` })
    } catch (e) {
      setMsg({ type: 'err', text: '저장 실패: ' + (e.response?.data?.detail || e.message) })
    } finally {
      setSaving(false)
    }
  }

  /* ── 엑셀 템플릿 다운로드 (현재 그리드 데이터 포함) ── */
  function downloadTemplate() {
    const filled = rows.filter(r => String(r.ticker || '').trim())
    const dataRows = filled.length > 0
      ? filled.map(r => [r.name || '', String(r.ticker).toUpperCase(),
          parseFloat(r.avg_price) || '', parseFloat(r.quantity) || '',
          ACC_LABELS[r.account] || '', r.sector || ''])
      : TEMPLATE_SAMPLE
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLS, ...dataRows])
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 16 }]
    // 티커 열(B)을 텍스트로 강제 → 005930 앞 0 보존
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let R = 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: 1 })
      if (ws[addr]) { ws[addr].t = 's'; ws[addr].v = String(ws[addr].v) }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '포트폴리오')
    const guide = XLSX.utils.aoa_to_sheet([
      ['항목', '설명', '예시'],
      ['종목명', '종목의 정식 이름', 'Apple Inc. / 삼성전자'],
      ['티커명', '종목 코드 (미국: 알파벳, 한국: 6자리 숫자)', 'AAPL / 005930'],
      ['평균단가', '매입 평균 단가 (미국: USD, 한국: KRW)', '180.50 / 71000'],
      ['수량', '보유 수량 (주)', '10 / 50'],
      ['계좌명', accounts.map(a => a.label).join(' / ') + ' 중 1개', accounts[0]?.label || '개별'],
      ['섹터', '종목 섹터 (선택)', 'Technology / IT·반도체'],
    ])
    guide['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, guide, '작성 가이드')
    XLSX.writeFile(wb, '다온_포트폴리오_템플릿.xlsx')
  }

  /* ── 증권사 내보내기 파일 업로드 → 검토 시트 ──────────────────
     이전 구현은 다온 템플릿의 6개 열이 1행에 정확히 있어야만 읽었고,
     읽으면 표 **전체**를 덮어썼다. HTS 내보내기는 ① 헤더가 1행이 아니고
     ② 계좌 열이 없고 ③ 계좌 하나짜리 스냅샷이라 셋 다 걸렸다.
     이제 파싱은 utils/brokerImport 가, 계좌 배정·범위 결정은 검토 시트가 한다. */
  async function fileToAoa(file) {
    const buf = await file.arrayBuffer()
    if (/\.(csv|txt|tsv)$/i.test(file.name)) return parseCsv(decodeFileBytes(buf))
    // xlsx 는 SheetJS 가 인코딩까지 처리한다
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
  }

  async function handleFiles(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setMsg(null)
    try {
      const parsed = []
      for (const file of files) {
        const aoa = await fileToAoa(file)
        parsed.push(parseHoldingsFile({ filename: file.name, aoa, accounts }))
      }
      const got = parsed.reduce((n, p) => n + p.rows.length, 0)
      if (!got) {
        setMsg({ type: 'err', text: `읽을 종목이 없습니다. 첫 파일에서 본 열: ${parsed[0]?.headers.slice(0, 10).join(', ') || '(없음)'}` })
        return
      }
      setImportFiles(parsed)
    } catch (err) {
      setMsg({ type: 'err', text: '파일 파싱 오류: ' + err.message })
    }
  }

  /** 검토 시트가 만든 행으로 표를 교체 — 업로드한 계좌만 바뀌고 나머지는 그대로다. */
  function applyImport(nextRows, info) {
    setRows(nextRows.map(r => ({ ...r, _k: ++_uid })))
    setDirty(true)
    setImportFiles(null)
    const accNames = info.accounts.map(k => ACC_LABELS[k] || k).join(' · ')
    setMsg({ type: 'ok', text: `${accNames} 계좌를 갱신했습니다 — 총 ${info.total}종목`
      + (info.dropped ? ` (파일에 없던 ${info.dropped}종목 삭제)` : '')
      + (info.kept ? ` (예수금·펀드 ${info.kept}건은 그대로 유지)` : '')
      + '. 확인 후 아래 저장을 누르세요.' })
  }

  const filledCount = rows.filter(r => String(r.ticker || '').trim()).length
  const fxRow = fxEdit ? rows.find(r => r._k === fxEdit._k) : null

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>보유 종목 편집</div>
          <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)', lineHeight: 1.5 }}>
            엑셀처럼 셀을 직접 편집하세요. 계좌 지정·수량·평단가 변경 후 <strong>저장</strong>하면 전체 앱에 즉시 반영됩니다.
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
          {filledCount}종목
        </div>
      </div>

      {/* 엑셀식 그리드 — 세로 스크롤 시 헤더 고정(sticky) */}
      <div style={{ overflow: 'auto', maxHeight: 'min(70vh, 560px)',
        border: '1px solid var(--clr-border-md)', borderRadius: 4 }}>
        <table className="xls-editor">
          <thead>
            <tr>
              <th style={{ minWidth: 96 }}>계좌</th>
              <th style={{ minWidth: 92 }}>티커</th>
              <th style={{ minWidth: 120 }}>종목명</th>
              <th style={{ minWidth: 72 }}>수량</th>
              <th style={{ minWidth: 96 }}>평균단가</th>
              <th style={{ minWidth: 110 }}>섹터</th>
              <th className="del"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '20px 12px', textAlign: 'center',
                  color: 'var(--clr-text-muted)', fontSize: 12, border: '1px solid var(--clr-border)' }}>
                  아래 <strong>＋ 행 추가</strong> 또는 엑셀 업로드로 종목을 등록하세요.
                </td>
              </tr>
            ) : rows.map((r, ri) => (
              /* ⚠ placeholder 는 첫 행에만. 두 번째 행부터도 '삼성전자·10·150' 이 흐리게
                 남아 있으면 이미 입력한 값인지 예시인지 헷갈린다(지인 피드백 3). */
              <tr key={r._k} data-rowkey={r._k}>
                <td>
                  <select value={r.account} onChange={e => setCell(r._k, 'account', e.target.value)}>
                    {ACCOUNTS.map(k => <option key={k} value={k}>{ACC_LABELS[k]}</option>)}
                  </select>
                </td>
                <td>
                  {/* 암호화폐도 받는다 — 'BTC' 를 넣으면 저장 시 'BTC-USD' 로 정규화된다.
                      한국 종목은 'A005490'(증권사 표기)으로 넣어도 받는다 — 저장은 KRX
                      단축코드 6자리로 통일하고, 증권사 표기는 아래에 같이 보여 준다.
                      같은 종목이 두 형태로 갈라지면 시세 조회도 배분 집계도 두 번 돈다
                      (2026-10-11 운영 DB 9건 정리). */}
                  <input value={r.ticker} placeholder={ri === 0 ? 'AAPL · 005930 · BTC' : ''}
                    title="미국 티커(AAPL) · 한국 6자리 코드(005930, A005490 도 가능) · 암호화폐(BTC)"
                    onChange={e => setCell(r._k, 'ticker', e.target.value)}
                    onBlur={e => resolveRow(r._k, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                  {KR_RE.test(String(r.ticker || '').trim()) && (
                    <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 2 }}
                      title="증권사 HTS 엑셀이 쓰는 표기입니다. KRX 공식 코드는 6자리입니다.">
                      증권사 표기 {brokerTicker(r.ticker)}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ position: 'relative' }}>
                    {/* 이름에서 티커로도 간다. 사람은 '디즈니'는 알아도 DIS 는 모른다. */}
                    <input value={r.name} placeholder={resolving[r._k] ? '조회 중…' : (ri === 0 ? '자동으로 채워집니다' : '')}
                      onChange={e => setCell(r._k, 'name', e.target.value)}
                      onBlur={e => resolveRowByName(r._k, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                  </div>
                </td>
                <td className="num">
                  <NumCell value={r.quantity} placeholder={ri === 0 ? '10' : ''}
                    onChange={v => setCell(r._k, 'quantity', v)} />
                </td>
                <td className="num">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <NumCell value={r.avg_price} placeholder={ri === 0 ? '150' : ''}
                      onChange={v => setCell(r._k, 'avg_price', v)} />
                    {/* 달러 표시 종목(암호화폐·해외주식)만 — 한국 종목은 이미 원화라 필요 없다 */}
                    {!KR_RE.test(String(r.ticker).trim().toUpperCase()) && String(r.ticker).trim() && (
                      <button type="button" onClick={() => openFx(r)}
                        title={r.krw_fx > 0
                          ? `원화 ${Number(r.krw_avg_price).toLocaleString()}원 ÷ 환율 ${Number(r.krw_fx).toLocaleString()} 으로 입력함 — 눌러서 수정`
                          : '원화 평단으로 입력하기 (업비트 등)'}
                        style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, padding: 0,
                          border: '1px solid var(--clr-border-md)', cursor: 'pointer',
                          background: r.krw_fx > 0 ? 'var(--clr-pos-bg-soft)' : 'transparent',
                          color: r.krw_fx > 0 ? 'var(--clr-pos-darker)' : 'var(--clr-text-muted)',
                          fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit', lineHeight: 1 }}>
                        ₩
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  {/* 섹터는 티커를 넣으면 자동으로 채워진다. 직접 고를 수도 있다.
                      "섹터는 필요 없다"는 피드백의 진짜 뜻은 '타이핑하기 싫다' 였다 —
                      데이터는 분석 탭의 섹터 비중·집중도 진단이 쓰므로 유지한다.
                      2026-10-11: 자유 입력 → 목록 선택. 손으로 적으면 같은 섹터가
                      철자만 다른 여러 칸으로 갈라진다(실제로 52건이 31종으로 쪼개졌다). */}
                  <SectorSelect value={r.sector}
                    onChange={v => setCell(r._k, 'sector', v)} />
                </td>
                <td className="del">
                  <button type="button" title="행 삭제" onClick={() => removeRow(r._k)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 원화 평단 환산기 — 표 바깥에 둔다(표는 가로 스크롤 컨테이너) */}
      {fxRow && (
        <div className="card" style={{ marginTop: 8, background: 'var(--m-surface-variant)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 6 }}>
                원화 평단으로 입력 — {String(fxRow.ticker).trim().toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ flex: '1 1 130px', minWidth: 0, fontSize: 11, color: 'var(--clr-text-muted)' }}>
                  원화 평균단가 (₩)
                  <input type="number" step="any" inputMode="decimal" placeholder="89,000,000"
                    value={fxEdit.krw}
                    onChange={e => setFxEdit(f => ({ ...f, krw: e.target.value }))}
                    style={{ width: '100%', marginTop: 3, padding: '7px 8px', borderRadius: 4,
                      border: '1px solid var(--clr-border-md)', background: 'var(--clr-bg-card)',
                      color: 'var(--clr-text)', fontSize: 12.5, fontFamily: 'inherit' }} />
                </label>
                <label style={{ flex: '1 1 130px', minWidth: 0, fontSize: 11, color: 'var(--clr-text-muted)' }}>
                  매수 시점 환율 (₩/$)
                  <input type="number" step="any" inputMode="decimal" placeholder={String(nowRate || 1380)}
                    value={fxEdit.rate}
                    onChange={e => setFxEdit(f => ({ ...f, rate: e.target.value }))}
                    style={{ width: '100%', marginTop: 3, padding: '7px 8px', borderRadius: 4,
                      border: '1px solid var(--clr-border-md)', background: 'var(--clr-bg-card)',
                      color: 'var(--clr-text)', fontSize: 12.5, fontFamily: 'inherit' }} />
                </label>
              </div>
              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--clr-text-sub)' }}>
                환산 평단가{' '}
                <strong style={{ color: 'var(--clr-text-strong)' }}>
                  {(parseFloat(fxEdit.krw) > 0 && parseFloat(fxEdit.rate) > 0)
                    ? '$' + (parseFloat(fxEdit.krw) / parseFloat(fxEdit.rate))
                        .toLocaleString(undefined, { maximumFractionDigits: 8 })
                    : '—'}
                </strong>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn-primary" onClick={applyFx}
                  style={{ width: 'auto', padding: '7px 16px', fontSize: 12.5 }}>
                  적용
                </button>
                <button type="button" className="btn-secondary" onClick={() => setFxEdit(null)}>
                  취소
                </button>
                {nowRate > 0 && (
                  <button type="button" className="btn-secondary"
                    onClick={() => setFxEdit(f => ({ ...f, rate: String(nowRate) }))}>
                    오늘 환율 {nowRate.toLocaleString()}
                  </button>
                )}
              </div>
              <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--clr-text-muted)',
                marginTop: 8, lineHeight: 1.65 }}>
                앱은 이 종목을 달러 시세로 받기 때문에 평단가도 달러로 저장합니다.<br />
                매수 시점 환율로 나누면 원가가 그때 값으로 고정되어, 이후 환율이 움직여도 흔들리지 않습니다.<br />
                환율을 모르면 오늘 환율을 써도 되지만, 그만큼 원가가 실제와 달라집니다.
              </div>
        </div>
      )}

      {/* 행 추가 — 표 아래에 두면 종목이 많을 때 화면 밖으로 밀려난다.
          종목이 많은 사람일수록 더 자주 누르는 버튼인데, 많을수록 멀어지는
          구조였다. 화면 아래에 붙여 둔다(sticky). */}
      <div className="addtab-addrow-bar">
        <button type="button" onClick={addRow} className="addtab-addrow-btn">
          ＋ 행 추가
        </button>
      </div>

      {/* 메시지 */}
      {msg && (
        <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 4, fontSize: 12.5, lineHeight: 1.5,
          whiteSpace: 'pre-line',
          background: msg.type === 'ok' ? 'var(--clr-pos-bg-soft)' : 'var(--clr-neg-bg-soft)',
          color: msg.type === 'ok' ? 'var(--clr-pos-darker)' : 'var(--clr-neg-dark)' }}>
          {msg.type === 'ok' ? '✓ ' : '⚠ '}{msg.text}
        </div>
      )}

      {/* 저장 / 되돌리기 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button className="btn-primary" disabled={saving || !dirty}
          onClick={handleSave}
          style={{ flex: 1, opacity: (saving || !dirty) ? 0.5 : 1 }}>
          {saving ? '저장 중...' : dirty ? '저장 (전체 앱 반영)' : '변경 없음'}
        </button>
        <button type="button" disabled={saving || !dirty} onClick={reloadFromServer}
          style={{ padding: '0 16px', height: 44, borderRadius: 4, flexShrink: 0,
            background: 'transparent', border: '1px solid var(--clr-border-md)',
            color: 'var(--clr-text-sub)', fontSize: 12.5, fontWeight: 700,
            cursor: (saving || !dirty) ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: (saving || !dirty) ? 0.5 : 1 }}>
          되돌리기
        </button>
      </div>

      {/* ── 엑셀 파일 가져오기 / 내보내기 ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 8 }}>
          엑셀 파일로 한 번에
        </div>
        <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.csv,.txt"
          style={{ display: 'none' }} onChange={handleFiles} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={downloadTemplate}
            style={{ flex: '1 1 140px', padding: '9px', borderRadius: 4, background: 'transparent',
              border: '1px solid var(--clr-border-md)', color: 'var(--clr-text-sub)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ⬇ 템플릿 다운로드 {filledCount > 0 ? '(현재 데이터)' : '(샘플)'}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{ flex: '1 1 140px', padding: '9px', borderRadius: 4, background: 'transparent',
              border: '1px solid var(--clr-border-md)', color: 'var(--clr-text-sub)',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ⬆ 파일 업로드 (여러 개 가능)
          </button>
        </div>
        <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--clr-text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          증권사 HTS에서 내보낸 <strong>보유 종목 엑셀·CSV를 그대로</strong> 올리세요 — 열 이름·헤더 위치를
          스스로 찾습니다(키움·미래에셋 실파일로 검증). 계좌별 파일을 <strong>한 번에 여러 개</strong> 올려도 됩니다.<br />
          <strong>계좌는 파일명에서 읽습니다</strong> — 파일명에 {accounts.map(a => a.label).join(' · ')} 중
          하나(또는 미국·퇴직연금·한국·ISA)가 들어 있으면 자동으로 배정되고, 못 읽으면 직접 고르면 됩니다.
          섹터를 파일명에 넣고 싶으면 <code>섹터=반도체</code> 형태로 적으세요(빈칸만 채웁니다).<br />
          업로드하면 <strong>무엇이 바뀌는지 먼저 보여주고</strong>, 표에 반영 후 <strong>저장</strong>을
          눌러야 서버에 들어갑니다(저장 직전 자동 백업).
        </div>
      </div>

      {importFiles && (
        <BrokerImportSheet
          files={importFiles} accounts={accounts} accLabels={ACC_LABELS}
          existingRows={rows}
          onApply={applyImport} onClose={() => setImportFiles(null)} />
      )}
    </div>
  )
}

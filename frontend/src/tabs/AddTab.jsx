import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, savePortfolio, getUsdKrw } from '../api'
import { useAccounts } from '../utils/accounts'
import * as XLSX from 'xlsx'

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
  const ACC_NAME_TO_KEY = React.useMemo(
    () => Object.fromEntries(accounts.map(a => [a.label, a.key])), [accounts])
  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })
  const { data: fx } = useQuery({ queryKey: ['usdkrw'], queryFn: getUsdKrw, staleTime: 5 * 60_000 })
  const nowRate = Number(fx?.rate) || 0

  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)   // { type:'ok'|'err', text }
  const [dirty, setDirty] = useState(false)
  // 원화 평단 환산기 — 열려 있는 행 하나만. { _k, krw, rate }
  const [fxEdit, setFxEdit] = useState(null)
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
    setRows(rs => [...rs, {
      _k: ++_uid, account: accounts[0]?.key || ACCOUNTS[0] || '',
      ticker: '', name: '', quantity: '', avg_price: '', sector: '',
      krw_avg_price: 0, krw_fx: 0,
    }])
    setDirty(true); setMsg(null)
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

  /* ── 엑셀 업로드 → 그리드에 채움 (검토 후 저장) ── */
  function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (aoa.length < 2) { setMsg({ type: 'err', text: '데이터가 없습니다.' }); return }
        const header = aoa[0].map(h => String(h).trim())
        const idx = {}; TEMPLATE_COLS.forEach(c => { idx[c] = header.indexOf(c) })
        const missing = TEMPLATE_COLS.filter(c => idx[c] === -1)
        if (missing.length) { setMsg({ type: 'err', text: `누락된 열: ${missing.join(', ')}` }); return }

        const parsed = []; const errors = []
        aoa.slice(1).forEach((row, i) => {
          if (row.every(c => c === '' || c == null)) return
          const name = String(row[idx['종목명']] || '').trim()
          let ticker = String(row[idx['티커명']] || '').trim().toUpperCase()
          if (/^\d+$/.test(ticker) && ticker.length < 6) ticker = ticker.padStart(6, '0')
          else if (/^A\d+$/.test(ticker) && ticker.length < 7) ticker = 'A' + ticker.slice(1).padStart(6, '0')
          const accName = String(row[idx['계좌명']] || '').trim()
          const accKey = ACC_NAME_TO_KEY[accName]
          if (!ticker) { errors.push(`행 ${i + 2}: 티커 누락`); return }
          if (!accKey) { errors.push(`행 ${i + 2} (${ticker}): 계좌명 '${accName}' 없음`); return }
          parsed.push({
            _k: ++_uid, account: accKey, ticker, name,
            quantity: row[idx['수량']] !== '' ? Number(row[idx['수량']]) : '',
            avg_price: row[idx['평균단가']] !== '' ? Number(row[idx['평균단가']]) : '',
            sector: String(row[idx['섹터']] || '').trim(),
          })
        })
        if (errors.length) { setMsg({ type: 'err', text: errors.slice(0, 6).join('\n') }); return }
        if (!parsed.length) { setMsg({ type: 'err', text: '유효한 데이터 행이 없습니다.' }); return }
        setRows(parsed); setDirty(true)
        setMsg({ type: 'ok', text: `엑셀 ${parsed.length}종목을 불러왔습니다. 확인 후 아래 저장을 누르세요.` })
      } catch (err) {
        setMsg({ type: 'err', text: '파일 파싱 오류: ' + err.message })
      }
    }
    reader.readAsArrayBuffer(file)
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
            ) : rows.map(r => (
              <tr key={r._k}>
                <td>
                  <select value={r.account} onChange={e => setCell(r._k, 'account', e.target.value)}>
                    {ACCOUNTS.map(k => <option key={k} value={k}>{ACC_LABELS[k]}</option>)}
                  </select>
                </td>
                <td>
                  <input value={r.ticker} placeholder="AAPL"
                    onChange={e => setCell(r._k, 'ticker', e.target.value)} />
                </td>
                <td>
                  <input value={r.name} placeholder={KR_RE.test(String(r.ticker).trim()) ? '삼성전자' : '애플'}
                    onChange={e => setCell(r._k, 'name', e.target.value)} />
                </td>
                <td className="num">
                  <input value={r.quantity} type="number" step="any" inputMode="decimal" placeholder="10"
                    onChange={e => setCell(r._k, 'quantity', e.target.value)} />
                </td>
                <td className="num">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <input value={r.avg_price} type="number" step="any" inputMode="decimal" placeholder="150"
                      style={{ minWidth: 0 }}
                      onChange={e => setCell(r._k, 'avg_price', e.target.value)} />
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
                  <input value={r.sector} placeholder="AI·빅테크"
                    onChange={e => setCell(r._k, 'sector', e.target.value)} />
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

      {/* 행 추가 */}
      <button type="button" onClick={addRow}
        style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 4,
          background: 'transparent', border: '1px dashed var(--clr-border-strong)',
          color: 'var(--clr-text-sub)', fontSize: 12.5, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit' }}>
        ＋ 행 추가
      </button>

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
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
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
            ⬆ 엑셀 업로드
          </button>
        </div>
        <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--clr-text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          업로드하면 위 표에 채워집니다 — 확인 후 <strong>저장</strong>을 눌러야 반영됩니다(자동 백업).<br />
          필수 열: 종목명·티커명·평균단가·수량·계좌명·섹터 / 계좌명: {accounts.map(a => a.label).join(' · ')}
        </div>
      </div>
    </div>
  )
}

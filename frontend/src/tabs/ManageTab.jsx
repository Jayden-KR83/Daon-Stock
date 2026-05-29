import React, { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, deleteHolding, deleteWatchlist, savePortfolio, saveApiKey, authLogout,
         updateProfile, listUsers, getBackup, restoreBackup, authMe,
         getAdminStatus, adminUnlock, adminLock, adminSetPassword,
         getAccounts, addAccount, updateAccount, deleteAccount } from '../api'
import { useStore } from '../store'
import { useAccounts } from '../utils/accounts'
import * as XLSX from 'xlsx'

const TEMPLATE_COLS = ['종목명', '티커명', '평균단가', '수량', '계좌명', '섹터']
const TEMPLATE_SAMPLE = [
  ['Apple Inc.', 'AAPL', 180.50, 10, '미국', 'Technology'],
  ['삼성전자', '005930', 71000, 50, '개별', 'IT·반도체'],
  ['TIGER 2차전지', '305720', 15000, 30, 'ISA', '2차전지'],
]

export default function ManageTab() {
  const qc = useQueryClient()
  const usdKrw          = useStore(s => s.usdKrw)
  const hasAnthropicKey    = useStore(s => s.hasAnthropicKey)
  const setHasAnthropicKey = useStore(s => s.setHasAnthropicKey)
  const currentUser     = useStore(s => s.currentUser)
  const setAuth         = useStore(s => s.setAuth)
  const adminStatus     = useStore(s => s.adminStatus)
  const setAdminStatus  = useStore(s => s.setAdminStatus)
  // 동적 계좌 — 기존 ACCOUNTS/ACC_LABELS/ACC_NAME_TO_KEY/ACC_KEY_TO_NAME 대체
  const { accounts: dynAccounts, accountKeys: ACCOUNTS, accLabels: ACC_LABELS } = useAccounts()
  const ACC_NAME_TO_KEY = React.useMemo(() => Object.fromEntries(dynAccounts.map(a => [a.label, a.key])), [dynAccounts])
  const ACC_KEY_TO_NAME = React.useMemo(() => Object.fromEntries(dynAccounts.map(a => [a.key, a.label])), [dynAccounts])
  const ACC_OPTIONS = dynAccounts.map(a => a.label)
  const fileInputRef = useRef(null)
  const [importPreview, setImportPreview] = useState(null)  // parsed rows
  const [importError,   setImportError]   = useState('')
  const [saving, setSaving] = useState(false)
  const [keyInput,   setKeyInput]  = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [keySaving,  setKeySaving] = useState(false)
  const [keySaved,   setKeySaved]  = useState(false)

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })

  const totalVal = React.useMemo(() => {
    if (!portfolio) return 0
    // 각 계좌의 currency를 기준으로 KRW 환산 (USD → ×usdKrw, 기타 외화는 1:1 임시 — 추후 환율 확장 가능)
    return dynAccounts.reduce((sum, a) => {
      const mul = a.currency === 'USD' ? usdKrw : 1
      return sum + (portfolio.portfolios?.[a.key] || []).reduce((s, h) =>
        s + h.quantity * h.avg_price * mul, 0)
    }, 0)
  }, [portfolio, usdKrw, dynAccounts])

  /* ── 템플릿 다운로드 ── */
  function downloadTemplate() {
    // 현재 보유 종목 포함 (있는 경우)
    const rows = []
    if (portfolio) {
      for (const acc of ACCOUNTS) {
        for (const h of portfolio.portfolios?.[acc] || []) {
          rows.push([h.name || '', h.ticker, h.avg_price, h.quantity, ACC_KEY_TO_NAME[acc], h.sector || ''])
        }
      }
    }
    const data = [TEMPLATE_COLS, ...(rows.length > 0 ? rows : TEMPLATE_SAMPLE)]
    const ws = XLSX.utils.aoa_to_sheet(data)
    // 컬럼 너비 설정
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 16 }]
    // 티커 열(B)을 텍스트 타입으로 강제 설정 → 005930 등 앞 0 보존
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let R = 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: 1 })
      if (ws[addr]) { ws[addr].t = 's'; ws[addr].v = String(ws[addr].v) }
    }
    // 헤더 스타일 (가이드용 주석 시트)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '포트폴리오')

    // 가이드 시트 추가
    const guide = XLSX.utils.aoa_to_sheet([
      ['항목', '설명', '예시'],
      ['종목명', '종목의 정식 이름', 'Apple Inc. / 삼성전자'],
      ['티커명', '종목 코드 (미국: 알파벳, 한국: 6자리 숫자)', 'AAPL / 005930'],
      ['평균단가', '매입 평균 단가 (미국: USD, 한국: KRW)', '180.50 / 71000'],
      ['수량', '보유 수량 (주)', '10 / 50'],
      ['계좌명', '미국 / 퇴직 / 개별 / ISA 중 1개', '개별'],
      ['섹터', '종목 섹터 (선택)', 'Technology / IT·반도체'],
    ])
    guide['!cols'] = [{ wch: 10 }, { wch: 36 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, guide, '작성 가이드')

    XLSX.writeFile(wb, '다온_포트폴리오_템플릿.xlsx')
  }

  /* ── 엑셀 업로드 파싱 ── */
  function handleFileChange(e) {
    setImportError('')
    setImportPreview(null)
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) { setImportError('데이터가 없습니다.'); return }

        // 헤더 확인
        const header = rows[0].map(h => String(h).trim())
        const idxMap = {}
        TEMPLATE_COLS.forEach(col => { idxMap[col] = header.indexOf(col) })
        const missing = TEMPLATE_COLS.filter(c => idxMap[c] === -1)
        if (missing.length > 0) {
          setImportError(`누락된 열: ${missing.join(', ')}`)
          return
        }

        const parsed = []
        const errors = []
        rows.slice(1).forEach((row, i) => {
          if (row.every(c => c === '' || c == null)) return  // 빈 행 무시
          const name    = String(row[idxMap['종목명']] || '').trim()
          // Excel이 005930 같은 한국 종목코드를 숫자(5930)로 읽을 수 있으므로 6자리로 패딩
          // A003670 → KRX A접두사도 그대로 유지
          let ticker = String(row[idxMap['티커명']] || '').trim().toUpperCase()
          if (/^\d+$/.test(ticker) && ticker.length < 6) ticker = ticker.padStart(6, '0')
          else if (/^A\d+$/.test(ticker) && ticker.length < 7) ticker = 'A' + ticker.slice(1).padStart(6, '0')
          const avgP    = parseFloat(row[idxMap['평균단가']]) || 0
          const qty     = parseFloat(row[idxMap['수량']]) || 0
          const accName = String(row[idxMap['계좌명']] || '').trim()
          const sector  = String(row[idxMap['섹터']] || '').trim()
          const accKey  = ACC_NAME_TO_KEY[accName]

          if (!ticker) { errors.push(`행 ${i+2}: 티커명 누락`); return }
          if (avgP <= 0) { errors.push(`행 ${i+2} (${ticker}): 평균단가 오류`); return }
          if (qty <= 0)  { errors.push(`행 ${i+2} (${ticker}): 수량 오류`); return }
          if (!accKey)   { errors.push(`행 ${i+2} (${ticker}): 계좌명 오류 (미국/퇴직/개별/ISA 중 1개)`); return }

          parsed.push({ ticker, name, avg_price: avgP, quantity: qty, account: accKey, sector })
        })

        if (errors.length > 0) { setImportError(errors.join('\n')); return }
        if (parsed.length === 0) { setImportError('유효한 데이터 행이 없습니다.'); return }
        setImportPreview(parsed)
      } catch (err) {
        setImportError('파일 파싱 오류: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''  // reset
  }

  /* ── 일괄 저장 ── */
  async function handleImportSave() {
    if (!importPreview) return
    setSaving(true)
    try {
      // 기존 포트폴리오 기반으로 새 구조 생성 — 동적 계좌 키로 초기화
      const newPortfolios = Object.fromEntries(ACCOUNTS.map(k => [k, []]))
      for (const h of importPreview) {
        const { account, ...rest } = h
        if (!newPortfolios[account]) newPortfolios[account] = []
        newPortfolios[account].push(rest)
      }
      await savePortfolio({
        portfolios: newPortfolios,
        watchlist: portfolio?.watchlist || [],
      })
      // v5: refetchQueries로 즉시 강제 재조회
      await qc.refetchQueries({ queryKey: ['portfolio'] })
      setImportPreview(null)
      alert(`✅ ${importPreview.length}종목 업데이트 완료!`)
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      {/* 프로필 관리 */}
      {currentUser && (
        <ProfileCard
          user={currentUser}
          onSaved={async () => {
            try {
              const me = await authMe()
              setAuth(localStorage.getItem('authToken'), me)
            } catch (_) {}
          }}
          onLogout={async () => {
            try { await authLogout() } catch (_) {}
            setAuth(null, null)
          }}
        />
      )}

      {/* 테마 전환 */}
      <ThemeToggleCard />

      {/* 관리자 모드 (is_admin인 경우에만 노출) + 잠금 해제된 경우에만 admin 카드들 표시 */}
      <AdminSection qc={qc} />

      {/* 계좌 관리 (모든 사용자) */}
      <AccountsSection />

      {/* Overview */}
      <div className="hero-card" style={{ marginBottom: 16 }}>
        <div className="hero-app-name">포트폴리오 요약</div>
        <div className="hero-label">총 투자금</div>
        <div className="hero-value">₩{Math.round(totalVal).toLocaleString()}</div>
      </div>

      {/* ── AI API Key 설정 (admin만 접근 가능 — AdminSection 내부에서 렌더) ── */}
      {false && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 4 }}>
          ◆ Anthropic API Key
        </div>
        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
          서버에 저장되어 <strong style={{ color: 'var(--clr-info)' }}>모든 기기에서 공유</strong>됩니다.
          한 번만 입력하면 PC·노트북·모바일 어디서든 AI 분석을 바로 사용할 수 있습니다.<br />
          발급: console.anthropic.com → API Keys → Create Key
        </div>
        {hasAnthropicKey && (
          <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginBottom: 8 }}>
            ✓ API Key가 서버에 저장되어 있습니다
          </div>
        )}
        {/* 입력란 + 눈 토글 + 저장 버튼 */}
        <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              className="input"
              type={keyVisible ? 'text' : 'password'}
              placeholder={hasAnthropicKey ? '새 키 입력 시 덮어씁니다' : 'sk-ant-api03-...'}
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setKeySaved(false) }}
              style={{ fontSize: 12, width: '100%', paddingRight: 36, boxSizing: 'border-box' }}
            />
            <button
              onClick={() => setKeyVisible(v => !v)}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--clr-text-muted)', padding: 0 }}
              title={keyVisible ? '숨기기' : '보기'}
            >
              {keyVisible ? '🙈' : '👁'}
            </button>
          </div>
          <button
            className="btn-primary"
            style={{ whiteSpace: 'nowrap', padding: '0 20px', width: 'auto', opacity: keySaving ? 0.6 : 1, flexShrink: 0 }}
            disabled={keySaving || !keyInput.trim()}
            onClick={async () => {
              setKeySaving(true)
              try {
                await saveApiKey(keyInput.trim())
                setHasAnthropicKey(true)
                setKeyInput('')
                setKeyVisible(false)
                setKeySaved(true)
              } finally {
                setKeySaving(false)
              }
            }}
          >
            {keySaving ? '저장 중...' : '저장'}
          </button>
        </div>
        {keySaved && (
          <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginTop: 6 }}>
            ✓ 저장 완료 — 모든 기기에서 즉시 적용됩니다
          </div>
        )}
      </div>
      )}
      {/* 기존 API Key 카드는 AdminSection 내부로 이동 */}

      {/* ── 엑셀 가져오기/내보내기 ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 12 }}>
          데이터 관리
        </div>

        {/* 템플릿 다운로드 */}
        <button className="btn-primary" style={{ marginBottom: 8 }} onClick={downloadTemplate}>
          ⬇️ 템플릿 다운로드 {portfolio ? '(현재 데이터 포함)' : '(샘플 포함)'}
        </button>

        {/* 업로드 */}
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
          style={{ display: 'none' }} onChange={handleFileChange} />
        <button className="btn-secondary" style={{ width: '100%' }}
          onClick={() => fileInputRef.current?.click()}>
          ⬆️ 엑셀 업로드 (일괄 데이터 업데이트)
        </button>

        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          필수 열: <strong>종목명, 티커명, 평균단가, 수량, 계좌명, 섹터</strong><br />
          계좌명: 미국 / 퇴직 / 개별 / ISA 중 1개 입력<br />
          ⚠️ 업로드 시 기존 보유 데이터가 업로드 파일로 <strong>전체 교체</strong>됩니다.
        </div>

        {/* 오류 표시 */}
        {importError && (
          <div style={{ marginTop: 10, background: 'var(--clr-neg-bg-soft)', borderRadius: 8, padding: 10,
            fontSize: 12, color: 'var(--clr-neg-dark)', whiteSpace: 'pre-line' }}>
            ⚠️ {importError}
          </div>
        )}

        {/* 미리보기 */}
        {importPreview && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 8 }}>
              미리보기 ({importPreview.length}종목)
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--clr-border-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--clr-bg)' }}>
                    {['티커', '종목명', '단가', '수량', '계좌', '섹터'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left',
                        color: 'var(--clr-text-sub)', fontWeight: 600, borderBottom: '1px solid var(--clr-border-md)',
                        whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 20).map((row, i) => {
                    const rKr = /^A?\d{6}$/.test(row.ticker)
                    return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--clr-border)' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--clr-text-strong)' }}>
                        {rKr && row.name ? row.name : row.ticker}
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--clr-text-mid)', maxWidth: 100,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rKr && row.name ? row.ticker : row.name}
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--clr-text-strong)' }}>{row.avg_price.toLocaleString()}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--clr-text-strong)' }}>{row.quantity}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--clr-info)', fontWeight: 600 }}>{ACC_KEY_TO_NAME[row.account]}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--clr-text-sub)' }}>{row.sector}</td>
                    </tr>
                    )
                  })}
                  {importPreview.length > 20 && (
                    <tr><td colSpan={6} style={{ padding: '6px 8px', color: 'var(--clr-text-muted)', fontSize: 11 }}>
                      ... 외 {importPreview.length - 20}종목
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-primary" style={{ flex: 1 }}
                disabled={saving} onClick={handleImportSave}>
                {saving ? '저장 중...' : `✅ ${importPreview.length}종목 저장`}
              </button>
              <button className="btn-secondary" onClick={() => setImportPreview(null)}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* Per account */}
      {ACCOUNTS.map(acc => {
        const holdings = portfolio?.portfolios?.[acc] || []
        if (holdings.length === 0) return null
        const accVal = holdings.reduce((s, h) => s + h.quantity * h.avg_price * (acc === 'US' ? usdKrw : 1), 0)
        return (
          <div key={acc} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{ACC_LABELS[acc]}</span>
              <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>{holdings.length}종목 · ₩{Math.round(accVal).toLocaleString()}</span>
            </div>
            {holdings.map(h => {
              const isKr = /^A?\d{6}$/.test(h.ticker)
              const mainLabel = isKr && h.name ? h.name : h.ticker
              const subLabel  = isKr && h.name ? h.ticker : h.name
              return (
              <div key={h.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0', borderBottom: '1px solid var(--clr-border)' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-strong)' }}>{mainLabel}</span>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginLeft: 6 }}>{subLabel}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>{h.quantity}주 · {h.avg_price.toLocaleString()}</span>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--clr-neg-dark)', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
                  onClick={async () => {
                    if (confirm(`${h.ticker} 삭제?`)) {
                      await deleteHolding(acc, h.ticker)
                      qc.invalidateQueries({ queryKey: ['portfolio'] })
                    }
                  }}>🗑️</button>
              </div>
              )
            })}
          </div>
        )
      })}

      {/* (watchlist 섹션 유지) */}
      {(portfolio?.watchlist?.length || 0) > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>관심 종목</span>
            <button className="btn-secondary" style={{ fontSize: 11 }}
              onClick={async () => {
                if (confirm('관심 종목 전체 삭제?')) {
                  for (const w of portfolio.watchlist) await deleteWatchlist(w.ticker)
                  qc.invalidateQueries({ queryKey: ['portfolio'] })
                }
              }}>전체 삭제</button>
          </div>
          {portfolio.watchlist.map(w => {
            const isKr = /^A?\d{6}$/.test(w.ticker)
            const mainLabel = isKr && w.name ? w.name : w.ticker
            const subLabel  = isKr && w.name ? w.ticker : w.name
            return (
            <div key={w.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0', borderBottom: '1px solid var(--clr-border)' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{mainLabel}</span>
                <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginLeft: 6 }}>{subLabel}</span>
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--clr-neg-dark)', cursor: 'pointer', fontSize: 14 }}
                onClick={async () => {
                  await deleteWatchlist(w.ticker)
                  qc.invalidateQueries({ queryKey: ['portfolio'] })
                }}>🗑️</button>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────
   프로필 카드 (닉네임 수정)
   ────────────────────────────────────────────────────── */
function ProfileCard({ user, onSaved, onLogout }) {
  const [nick, setNick] = useState(user.nickname || user.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = nick.trim() !== (user.nickname || user.name || '')

  async function save() {
    if (!nick.trim()) return
    setSaving(true); setSaved(false)
    try {
      await updateProfile(nick.trim())
      await onSaved?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert(e.response?.data?.detail || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>사용자 정보</div>
        <button
          onClick={onLogout}
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-neg)',
            background: 'var(--clr-neg-bg-soft)', border: '1px solid #FECACA',
            borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
          로그아웃
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 2 }}>이메일</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-strong)', marginBottom: 10 }}>
        {user.email}
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 4 }}>
        닉네임 <span style={{ fontSize: 10 }}>— 보유 탭 상단에 표시됩니다</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={nick} onChange={e => setNick(e.target.value)}
          placeholder="닉네임 입력" maxLength={30}
          style={{ flex: 1, fontSize: 13 }} />
        <button className="btn-primary"
          disabled={saving || !dirty || !nick.trim()}
          onClick={save}
          style={{ whiteSpace: 'nowrap', padding: '0 18px', width: 'auto', flexShrink: 0,
            opacity: (saving || !dirty || !nick.trim()) ? 0.5 : 1 }}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
      {saved && (
        <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginTop: 6 }}>✓ 닉네임이 저장되었습니다</div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────
   사용자 관리 카드
   ────────────────────────────────────────────────────── */
function UserListCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: listUsers,
    staleTime: 60_000,
    retry: 0,
  })

  if (isLoading) return null
  if (error) return null

  const users    = data?.users || []
  const isAdmin  = !!data?.is_admin

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
          사용자 관리
          <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', fontWeight: 500, marginLeft: 6 }}>
            {isAdmin ? `· admin · ${users.length}명` : '· 본인 정보'}
          </span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--clr-bg)', borderBottom: '1px solid var(--clr-border-md)' }}>
              {['이메일', '닉네임', '보유', '관심', '가입일'].map(h => (
                <th key={h} style={{ padding: '7px 8px', textAlign: 'left', color: 'var(--clr-text-sub)',
                  fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} style={{ borderBottom: '1px solid var(--clr-border)' }}>
                <td style={{ padding: '7px 8px', color: 'var(--clr-text-strong)', fontWeight: 600,
                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.email}
                  {u.is_admin && (
                    <span style={{ fontSize: 9, background: '#F59E0B', color: '#fff',
                      padding: '1px 5px', borderRadius: 4, marginLeft: 4, fontWeight: 700 }}>
                      ADMIN
                    </span>
                  )}
                </td>
                <td style={{ padding: '7px 8px', color: 'var(--clr-text-strong)' }}>
                  {u.nickname}
                </td>
                <td style={{ padding: '7px 8px', color: 'var(--clr-text-sub)', textAlign: 'right' }}>{u.holdings}</td>
                <td style={{ padding: '7px 8px', color: 'var(--clr-text-sub)', textAlign: 'right' }}>{u.watchlist}</td>
                <td style={{ padding: '7px 8px', color: 'var(--clr-text-muted)', fontSize: 10, whiteSpace: 'nowrap' }}>
                  {String(u.created_at || '').slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isAdmin && (
        <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 6 }}>
          전체 사용자 조회는 관리자 권한이 필요합니다
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────
   백업/원복 카드
   ────────────────────────────────────────────────────── */
function BackupRestoreCard({ onRestored }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['portfolio-backup'],
    queryFn: getBackup,
    staleTime: 30_000,
  })
  const [restoring, setRestoring] = useState(false)

  async function restore() {
    if (!confirm('현재 데이터를 최근 백업으로 원복합니다. 계속할까요?\n(현재 데이터는 새로운 백업으로 저장됩니다)')) return
    setRestoring(true)
    try {
      await restoreBackup()
      await onRestored?.()
      await refetch()
      alert('✓ 원복이 완료되었습니다')
    } catch (e) {
      alert(e.response?.data?.detail || '원복 실패')
    } finally {
      setRestoring(false)
    }
  }

  const hasBackup = data?.has_backup
  const savedAt   = data?.saved_at
  const bkHoldings = hasBackup
    ? Object.values(data.portfolios || {}).reduce((s, arr) => s + (arr?.length || 0), 0)
    : 0
  const bkWatch   = hasBackup ? (data.watchlist?.length || 0) : 0

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 10 }}>
        자동 백업 & 원복
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        엑셀 업로드 등 일괄 저장 직전의 데이터가 자동으로 백업됩니다.<br />
        이상 발생 시 아래 버튼으로 직전 상태로 즉시 원복할 수 있습니다.
      </div>
      <div style={{ background: 'var(--clr-bg)', border: '1px solid var(--clr-border-md)', borderRadius: 10,
        padding: '10px 12px', marginBottom: 10, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--clr-text-sub)', marginBottom: 2 }}>최근 백업</div>
          {isLoading ? (
            <div style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>불러오는 중...</div>
          ) : hasBackup ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
                {savedAt ? new Date(savedAt * 1000).toLocaleString('ko-KR') : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 2 }}>
                보유 {bkHoldings}종목 · 관심 {bkWatch}개
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>백업 없음</div>
          )}
        </div>
        <button
          disabled={!hasBackup || restoring}
          onClick={restore}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid',
            borderColor: hasBackup ? '#F59E0B' : '#CBD5E1',
            background: hasBackup ? '#FFFBEB' : '#F8FAFC',
            color: hasBackup ? '#B45309' : '#94A3B8',
            fontSize: 12, fontWeight: 700, cursor: hasBackup ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          {restoring ? '원복 중...' : '↩ 백업으로 원복'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   AdminSection — 관리자 모드 (절대 권한)
   is_admin 사용자에게만 노출. 암호 해제 전에는 민감 정보 모두 숨김.
   ══════════════════════════════════════════════════════ */
function AdminSection({ qc }) {
  const setHasAnthropicKey = useStore(s => s.setHasAnthropicKey)
  const hasAnthropicKey    = useStore(s => s.hasAnthropicKey)

  const { data: status, refetch, isLoading } = useQuery({
    queryKey: ['admin-status'],
    queryFn: getAdminStatus,
    staleTime: 30_000,
    retry: 0,
  })

  const [pwInput, setPwInput]   = useState('')
  const [busy,    setBusy]      = useState(false)
  const [err,     setErr]       = useState('')
  const [showSetPw,  setShowSetPw]  = useState(false)
  const [setPwNew,   setSetPwNew]   = useState('')
  const [setPwCurr,  setSetPwCurr]  = useState('')

  // is_admin이 아닌 일반 사용자 → 아예 렌더링 안 함 (존재 자체를 노출 안 함)
  if (isLoading) return null
  if (!status?.is_admin) return null

  const unlocked     = !!status?.unlocked
  const passwordSet  = !!status?.password_set

  async function doUnlock() {
    setBusy(true); setErr('')
    try {
      await adminUnlock(pwInput)
      setPwInput('')
      await refetch()
      // API Key 존재 여부도 새로 가져와야 함 (admin만 GET 가능)
      qc.invalidateQueries({ queryKey: ['apikey'] })
    } catch (e) {
      setErr(e.response?.data?.detail || '잠금 해제 실패')
    } finally {
      setBusy(false)
    }
  }
  async function doLock() {
    setBusy(true)
    try { await adminLock(); await refetch() }
    finally { setBusy(false) }
  }
  async function doSetPw() {
    if (setPwNew.length < 6) { setErr('새 암호는 6자 이상'); return }
    setBusy(true); setErr('')
    try {
      await adminSetPassword(setPwCurr, setPwNew)
      setSetPwNew(''); setSetPwCurr(''); setShowSetPw(false)
      await refetch()
    } catch (e) {
      setErr(e.response?.data?.detail || '암호 설정 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* ── 관리자 모드 상태 카드 ── */}
      <div className="card" style={{ marginBottom: 16, border: '1px solid #0EA5E9',
        background: unlocked ? '#F0F9FF' : '#F8FAFC' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--clr-text-strong)',
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{unlocked ? '🔓' : '🔒'}</span>
              관리자 모드
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
                background: unlocked ? '#DCFCE7' : '#F1F5F9',
                color: unlocked ? '#15803D' : '#64748B', fontWeight: 700 }}>
                {unlocked ? '해제됨' : '잠김'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-sub)', marginTop: 4 }}>
              API Key · 사용자 목록 등 민감 기능은 관리자 암호를 입력해야 접근할 수 있습니다
            </div>
          </div>
          {unlocked && (
            <button onClick={doLock} disabled={busy}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--clr-border-md)',
                background: 'var(--clr-surface)', color: 'var(--clr-text-sub)', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit' }}>
              잠그기
            </button>
          )}
        </div>

        {/* 암호 미설정 → 설정 유도 */}
        {!passwordSet && (
          <div style={{ padding: 10, background: 'var(--clr-warn-bg)', border: '1px solid #FDE68A',
            borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--clr-warn-dark)', lineHeight: 1.6 }}>
            관리자 암호가 아직 설정되지 않았습니다. 아래에서 최초 암호를 설정하세요.
          </div>
        )}

        {/* 해제 UI */}
        {passwordSet && !unlocked && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              type="password"
              placeholder="관리자 암호"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setErr('') }}
              onKeyDown={e => e.key === 'Enter' && doUnlock()}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button className="btn-primary" disabled={busy || !pwInput}
              onClick={doUnlock}
              style={{ whiteSpace: 'nowrap', padding: '0 18px', width: 'auto', flexShrink: 0,
                opacity: busy || !pwInput ? 0.5 : 1 }}>
              {busy ? '확인 중...' : '잠금 해제'}
            </button>
          </div>
        )}

        {/* 해제 완료 상태 */}
        {unlocked && (
          <div style={{ fontSize: 11, color: 'var(--clr-pos-darker)' }}>
            ✓ 관리자 모드가 해제되어 있습니다 (자동 잠금: 1시간)
          </div>
        )}

        {err && (
          <div style={{ marginTop: 8, padding: 8, background: 'var(--clr-neg-bg-soft)', borderRadius: 6,
            fontSize: 11, color: 'var(--clr-neg-dark)' }}>⚠ {err}</div>
        )}

        {/* 암호 설정 토글 */}
        <div style={{ marginTop: 10, borderTop: '1px solid var(--clr-border-md)', paddingTop: 10 }}>
          <button onClick={() => { setShowSetPw(v => !v); setErr('') }}
            style={{ background: 'none', border: 'none', color: 'var(--clr-info)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}>
            {showSetPw ? '설정 취소' : (passwordSet ? '암호 변경' : '최초 암호 설정')}
          </button>
          {showSetPw && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {passwordSet && (
                <input className="input" type="password" placeholder="현재 암호"
                  value={setPwCurr} onChange={e => setSetPwCurr(e.target.value)}
                  style={{ fontSize: 12 }} />
              )}
              <input className="input" type="password" placeholder="새 암호 (6자 이상)"
                value={setPwNew} onChange={e => setSetPwNew(e.target.value)}
                style={{ fontSize: 12 }} />
              <button className="btn-primary" disabled={busy || setPwNew.length < 6}
                onClick={doSetPw}
                style={{ width: '100%', opacity: busy || setPwNew.length < 6 ? 0.5 : 1 }}>
                {busy ? '저장 중...' : '암호 저장'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 암호 해제 상태일 때만 보이는 민감 카드들 ── */}
      {unlocked && (
        <>
          <AdminApiKeyCard
            hasKey={hasAnthropicKey}
            onSaved={() => {
              setHasAnthropicKey(true)
              qc.invalidateQueries({ queryKey: ['apikey-status'] })
            }}
          />
          <UserListCard />
        </>
      )}
    </>
  )
}

/* ──────────────────────────────────────────────────────
   테마 전환 카드 — Light / Dark / Pro 3종
   ────────────────────────────────────────────────────── */
function ThemeToggleCard() {
  const theme    = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)

  const themes = [
    { key: 'light', label: '화이트', icon: '☀️', desc: '밝고 깔끔한 기본 테마',
      preview: { bg: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', accent: '#16A34A' } },
    { key: 'dark',  label: '다크',   icon: '🌙', desc: '어두운 배경, 눈의 피로 감소',
      preview: { bg: '#0B1120', surface: '#111C2D', text: '#F1F5F9', accent: '#34D399' } },
    { key: 'pro',   label: '프로',   icon: '📈', desc: '주식 전문 터미널 — 미드나잇 차콜',
      preview: { bg: '#0D1117', surface: '#161B22', text: '#F0F6FC', accent: '#58A6FF' } },
  ]

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 4 }}>
        테마 모드
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        앱 전체 색상을 즉시 전환합니다. 기기별로 저장됩니다.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {themes.map(t => {
          const active = theme === t.key
          return (
            <button key={t.key}
              onClick={() => setTheme(t.key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
                padding: 10,
                borderRadius: 10,
                border: '2px solid',
                borderColor: active ? 'var(--clr-info)' : 'var(--clr-border-md)',
                background: active ? 'var(--clr-info-bg)' : 'var(--clr-surface)',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all .15s',
                textAlign: 'left',
              }}>
              {/* 미리보기 색상 칩 */}
              <div style={{
                position: 'relative', height: 38, borderRadius: 7, overflow: 'hidden',
                background: t.preview.bg,
                border: '1px solid rgba(255,255,255,.08)',
              }}>
                <div style={{
                  position: 'absolute', left: 4, top: 4, right: 4, bottom: 16,
                  background: t.preview.surface, borderRadius: 4,
                }} />
                <div style={{
                  position: 'absolute', left: 8, bottom: 4,
                  fontSize: 8, fontWeight: 800, color: t.preview.text,
                  letterSpacing: '-.02em',
                }}>Aa</div>
                <div style={{
                  position: 'absolute', right: 6, top: 6,
                  width: 6, height: 6, borderRadius: '50%',
                  background: t.preview.accent, boxShadow: `0 0 4px ${t.preview.accent}`,
                }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13 }}>{t.icon}</span>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: active ? 'var(--clr-info-dark)' : 'var(--clr-text-strong)',
                  letterSpacing: '-.01em',
                }}>{t.label}</span>
                {active && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, padding: '1px 5px', borderRadius: 4,
                    background: 'var(--clr-pos-bg)', color: 'var(--clr-pos-dark)', fontWeight: 800,
                  }}>✓</span>
                )}
              </div>
              <div style={{
                fontSize: 9, color: 'var(--clr-text-muted)', lineHeight: 1.4, fontWeight: 500,
              }}>{t.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── API Key 카드 (admin 전용) ── */
function AdminApiKeyCard({ hasKey, onSaved }) {
  const [keyInput, setKeyInput] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    if (!keyInput.trim()) return
    setSaving(true)
    try {
      await saveApiKey(keyInput.trim())
      setKeyInput(''); setKeyVisible(false); setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert(e.response?.data?.detail || 'API Key 저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 4 }}>
        ◆ Anthropic API Key
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        서버 저장 — 모든 기기에서 공유됩니다. 앱 전체 사용자가 이 키로 AI 분석을 이용합니다.<br />
        발급: console.anthropic.com → API Keys → Create Key
      </div>
      {hasKey && (
        <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginBottom: 8 }}>
          ✓ API Key가 서버에 저장되어 있습니다
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input className="input"
            type={keyVisible ? 'text' : 'password'}
            placeholder={hasKey ? '새 키 입력 시 덮어씁니다' : 'sk-ant-api03-...'}
            value={keyInput}
            onChange={e => { setKeyInput(e.target.value); setSaved(false) }}
            style={{ fontSize: 12, width: '100%', paddingRight: 36, boxSizing: 'border-box' }}
          />
          <button onClick={() => setKeyVisible(v => !v)}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
              color: 'var(--clr-text-muted)', padding: 0 }}
            title={keyVisible ? '숨기기' : '보기'}>
            {keyVisible ? '🙈' : '👁'}
          </button>
        </div>
        <button className="btn-primary"
          disabled={saving || !keyInput.trim()}
          onClick={save}
          style={{ whiteSpace: 'nowrap', padding: '0 20px', width: 'auto',
            opacity: saving ? 0.6 : 1, flexShrink: 0 }}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
      {saved && (
        <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginTop: 6 }}>
          ✓ 저장 완료 — 모든 기기에서 즉시 적용됩니다
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   AccountsSection — 사용자별 동적 계좌 관리 (단일 통합·브라질 등 자유 추가)
   ───────────────────────────────────────────────────────────────────── */
function AccountsSection() {
  const qc = useQueryClient()
  const setAccounts = useStore(s => s.setAccounts)
  const dynAccounts = useStore(s => s.accounts)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: '', currency: 'KRW' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  async function reload() {
    try {
      const r = await getAccounts()
      if (r?.accounts) setAccounts(r.accounts)
    } catch {}
  }

  async function handleAdd(e) {
    e.preventDefault()
    setErr('')
    const label = form.label.trim()
    if (!label) { setErr('계좌 이름을 입력하세요'); return }
    // key 자동 생성 — label 영문화. 간단한 규칙: 영문은 대문자, 한글은 timestamp suffix
    let key = label.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()
    if (!key || /^_+$/.test(key)) {
      key = 'ACC_' + Date.now().toString(36).toUpperCase()
    }
    setBusy('add')
    try {
      await addAccount({ key, label, currency: form.currency, sort_order: dynAccounts.length })
      await reload()
      setForm({ label: '', currency: 'KRW' })
      setAdding(false)
    } catch (e) {
      setErr(e.response?.data?.detail || '추가 실패')
    } finally {
      setBusy('')
    }
  }

  async function handleDelete(key, label) {
    if (!window.confirm(`'${label}' 계좌를 삭제합니다. (보유 종목이 없어야 가능)`)) return
    setBusy('del:' + key)
    try {
      await deleteAccount(key)
      await reload()
      qc.invalidateQueries({ queryKey: ['portfolio'] })
    } catch (e) {
      alert(e.response?.data?.detail || '삭제 실패')
    } finally {
      setBusy('')
    }
  }

  async function handleRename(a) {
    const newLabel = window.prompt(`'${a.label}'의 새 이름을 입력하세요`, a.label)
    if (!newLabel || newLabel.trim() === a.label) return
    setBusy('edit:' + a.key)
    try {
      await updateAccount(a.key, {
        key: a.key, label: newLabel.trim(),
        currency: a.currency, sort_order: a.sort_order
      })
      await reload()
    } catch (e) {
      alert(e.response?.data?.detail || '수정 실패')
    } finally {
      setBusy('')
    }
  }

  const currencyOptions = ['KRW', 'USD', 'EUR', 'JPY', 'BRL', 'GBP', 'CNY', 'HKD', 'INR']

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 4 }}>
        ◆ 계좌 관리
      </div>
      <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        본인 자산구조에 맞게 계좌를 추가·수정·삭제할 수 있습니다.
        통합 계좌 하나만 쓰거나, 브라질 등 해외 증권사 계좌도 추가 가능합니다.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {dynAccounts.map(a => (
          <div key={a.key} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', background: 'var(--clr-bg)',
            border: '1px solid var(--clr-border-md)', borderRadius: 8,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
                {a.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>
                ID {a.key} · {a.currency}
              </div>
            </div>
            <button onClick={() => handleRename(a)} disabled={busy === 'edit:' + a.key}
              style={miniBtnStyle('outlined')}>이름 수정</button>
            <button onClick={() => handleDelete(a.key, a.label)} disabled={busy === 'del:' + a.key}
              style={miniBtnStyle('danger-outlined')}>삭제</button>
          </div>
        ))}
      </div>

      {adding ? (
        <form onSubmit={handleAdd} style={{
          padding: 12, background: 'var(--clr-bg)',
          border: '1px solid var(--clr-info-border)', borderRadius: 10,
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="input" placeholder="계좌 이름 (예: 브라질 메인)"
              value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              autoFocus style={{ flex: 2 }} />
            <select value={form.currency}
              onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
              className="input" style={{ flex: 1, fontFamily: 'inherit' }}>
              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {err && <div style={{ fontSize: 11, color: 'var(--clr-neg-dark)', marginBottom: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" disabled={busy === 'add'}
              style={{ ...miniBtnStyle('primary'), flex: 1 }}>
              {busy === 'add' ? '추가 중...' : '추가'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setErr(''); setForm({ label: '', currency: 'KRW' }) }}
              style={miniBtnStyle('outlined')}>취소</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ ...miniBtnStyle('outlined'), width: '100%', padding: '8px 12px' }}>
          + 새 계좌 추가
        </button>
      )}
    </div>
  )
}

function miniBtnStyle(variant) {
  const v = {
    primary:           { bg: 'var(--clr-info)', fg: '#fff', bd: 'var(--clr-info)' },
    outlined:          { bg: 'transparent', fg: 'var(--clr-text-sub)', bd: 'var(--clr-border-md)' },
    'danger-outlined': { bg: 'transparent', fg: 'var(--clr-neg-dark)', bd: '#FCA5A5' },
  }[variant]
  return {
    padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
    background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }
}

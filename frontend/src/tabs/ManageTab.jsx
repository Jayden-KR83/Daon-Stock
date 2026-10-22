import React, { useState } from 'react'
import { usePrivacy } from '../utils/privacy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, authLogout, updateProfile, getBackup, restoreBackup, authMe,
         getAccounts, addAccount, updateAccount, deleteAccount } from '../api'
import { useStore, THEME_ORDER, THEME_META } from '../store'
import { useAccounts } from '../utils/accounts'
import TwoFactorCard from '../components/TwoFactorCard'
import AccountCashCard from '../components/AccountCashCard'
import PushSetupCard from '../components/PushSetupCard'
import AppVersionCard from '../components/AppVersionCard'

export default function ManageTab() {
  const qc = useQueryClient()
  const usdKrw       = useStore(s => s.usdKrw)
  const currentUser  = useStore(s => s.currentUser)
  const setAuth      = useStore(s => s.setAuth)
  const { accounts: dynAccounts } = useAccounts()

  const { data: portfolio } = useQuery({ queryKey: ['portfolio'], queryFn: getPortfolio })

  const totalVal = React.useMemo(() => {
    if (!portfolio) return 0
    // 각 계좌 통화 기준 KRW 환산 (USD → ×usdKrw, 기타 외화는 1:1 임시)
    return dynAccounts.reduce((sum, a) => {
      const mul = a.currency === 'USD' ? usdKrw : 1
      return sum + (portfolio.portfolios?.[a.key] || []).reduce((s, h) =>
        s + h.quantity * h.avg_price * mul, 0)
    }, 0)
  }, [portfolio, usdKrw, dynAccounts])

  return (
    <div style={{ paddingTop: 8 }}>
      {/* 2026-10-11: 관리자 기능(분석 관리·API 키·사용자 목록·관리자 모드)은 전부
          관리자 탭으로 옮겼다. 설정 탭은 '내 설정'만 담는다 — 두 탭에 같은 기능이
          흩어져 있으면 어디서 고쳐야 하는지 매번 헷갈린다(실측: 겹친 API 호출 3개). */}

      {/* 2단계 인증 — 로그인 잠금(무차별 대입 차단)과 짝이 되는 계정 방어선 */}
      {currentUser && <TwoFactorCard />}

      {/* 프로필 관리 (총 투자금 통합) */}
      {currentUser && (
        <ProfileCard
          user={currentUser}
          totalVal={totalVal}
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

      {/* 휴대폰 알림 — Web Push 는 예전부터 있었지만 켜는 곳이 알림 벨 시트 안쪽뿐이라
          기능이 있는지조차 몰랐다. 설정 탭 상단으로 꺼낸다. */}
      {currentUser && <PushSetupCard />}

      {/* 계좌별 예수금 — 총자산·현금비중의 입력원 */}
      {currentUser && <AccountCashCard />}

      {/* 앱 사용 안내 다시 보기 — 최초 로그인 때 한 번 자동으로 뜨는 그 투어 */}
      <TourCard />

      {/* 테마 전환 */}
      <ThemeToggleCard />

      {/* 앱 버전 — "고쳤다는데 내 폰은 그대로" 를 스스로 확인·해결할 수 있게 */}
      <AppVersionCard />

      {/* 계좌 관리 (모든 사용자) */}
      <AccountsSection />

      {/* 포트폴리오 백업·원복 — 2026-10-11 되살림.
          이 카드는 **정의만 있고 어디에서도 렌더되지 않았다.** 가이드 탭은
          "관리 탭에서 한 번의 클릭으로 원복 가능"이라고 안내하는데 실제로는 버튼이 없었다.
          증권사 파일 일괄 업로드의 안전망이 바로 이것이라 설정 탭에 노출한다
          (관리자 기능이 아니라 **내 데이터**를 되돌리는 기능이다). */}
      {currentUser && (
        <BackupRestoreCard onRestored={async () => {
          await qc.invalidateQueries({ queryKey: ['portfolio'] })
        }} />
      )}

    </div>
  )
}

/* ──────────────────────────────────────────────────────
   프로필 카드 (닉네임 수정)
   ────────────────────────────────────────────────────── */
function ProfileCard({ user, totalVal = 0, onSaved, onLogout }) {
  const priv = usePrivacy()   // 총 투자금도 개인 금액이다 — 발표 중 설정 탭에서 노출됐다
  const [nick, setNick] = useState(user.nickname || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = nick.trim() !== (user.nickname || '')

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--clr-border)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 2 }}>이메일</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-strong)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 2 }}>총 투자금</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--clr-text-strong)',
            letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
            {priv.won(totalVal)}
          </div>
        </div>
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
      <div style={{ background: 'var(--clr-bg)', border: '1px solid var(--clr-border-md)', borderRadius: 4,
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


/* ──────────────────────────────────────────────────────
   테마 전환 카드 — Light / Dark / Pro 3종
   ────────────────────────────────────────────────────── */
function ThemeToggleCard() {
  const theme    = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)

  /* 목록을 여기서 따로 적지 않는다 — 상단 알약 순환(THEME_ORDER)과 어긋나면
     '순환에는 있는데 설정에는 없는' 테마가 다시 생긴다. */
  const themes = THEME_ORDER.map(key => ({ key, ...THEME_META[key] }))

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 4 }}>
        테마 모드
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        앱 전체 색상을 즉시 전환합니다. 기기별로 저장됩니다.
      </div>
      {/* 4개가 되면서 390px 에서 한 줄에 넣으면 카드가 너무 좁다 → 좁으면 2×2 로 접힌다 */}
      <div style={{ display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        {themes.map(t => {
          const active = theme === t.key
          return (
            <button key={t.key}
              onClick={() => setTheme(t.key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
                padding: 10,
                borderRadius: 4,
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
  const [dragIdx, setDragIdx] = useState(null)   // 드래그 중인 행
  const [overIdx, setOverIdx] = useState(null)   // 드롭 대상 행

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

  // 드래그로 재배열된 배열을 전체 순차 sort_order로 저장 (중복/0 값 방어)
  async function persistOrder(arr) {
    setBusy('move')
    try {
      await Promise.all(arr.map((a, i) =>
        updateAccount(a.key, { key: a.key, label: a.label, currency: a.currency, sort_order: i })))
      await reload()
      // 계좌 순서는 보유/등록/요약 등 모든 탭의 표시 순서에 영향 → 의존 쿼리 갱신
      qc.invalidateQueries({ queryKey: ['portfolio'] })
    } catch (e) {
      alert(e.response?.data?.detail || '순서 변경 실패')
    } finally {
      setBusy('')
    }
  }

  function handleDrop() {
    const from = dragIdx, to = overIdx
    setDragIdx(null); setOverIdx(null)
    if (from == null || to == null || from === to) return
    const arr = [...dynAccounts]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    persistOrder(arr)
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

      <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--clr-text-muted)', marginBottom: 6 }}>
        ⠿ 손잡이를 마우스로 끌어 순서를 바꿀 수 있습니다.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {dynAccounts.map((a, idx) => (
          <div key={a.key}
            onDragOver={e => { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx) }}
            onDrop={handleDrop}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--clr-bg)',
              border: '1px solid', borderColor: overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? 'var(--clr-info)' : 'var(--clr-border-md)',
              borderRadius: 8,
              opacity: dragIdx === idx ? 0.4 : 1,
              transition: 'border-color .12s',
            }}>
            {/* 드래그 손잡이 */}
            <div draggable={busy !== 'move'}
              onDragStart={() => setDragIdx(idx)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
              title="끌어서 순서 변경"
              style={{ flexShrink: 0, cursor: busy === 'move' ? 'wait' : 'grab', padding: '2px 4px',
                fontSize: 15, color: 'var(--clr-text-muted)', lineHeight: 1, userSelect: 'none',
                touchAction: 'none' }}>
              ⠿
            </div>
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
          border: '1px solid var(--clr-info-border)', borderRadius: 4,
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

/* ──────────────────────────────────────────────────────
   앱 사용 안내(온보딩 투어) 다시 보기
   최초 로그인 시 1회 자동 실행되며, 건너뛴 뒤에도 여기서 다시 볼 수 있다.
   ────────────────────────────────────────────────────── */
function TourCard() {
  const openTour = useStore(s => s.openTour)
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 6 }}>
        앱 사용 안내
      </div>
      {/* R6 — 문장마다 줄바꿈 */}
      <div className="ko-keep" style={{ fontSize: 12, color: 'var(--clr-text-muted)',
        lineHeight: 1.6, marginBottom: 10 }}>
        <div>화면을 하나씩 짚어가며 어디에 뭐가 있는지 알려줍니다.</div>
        <div>주식이 처음인 분께 먼저 권합니다.</div>
      </div>
      <button className="btn-primary" style={{ fontSize: 13, padding: '8px 14px' }}
        onClick={openTour}>
        안내 다시 보기
      </button>
    </div>
  )
}

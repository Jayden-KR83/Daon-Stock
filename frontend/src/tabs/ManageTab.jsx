import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, saveApiKey, authLogout,
         updateProfile, listUsers, getBackup, restoreBackup, authMe,
         getAdminStatus, adminUnlock, adminLock, adminSetPassword,
         getAccounts, addAccount, updateAccount, deleteAccount } from '../api'
import { useStore } from '../store'
import { useAccounts } from '../utils/accounts'

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

      {/* 테마 전환 */}
      <ThemeToggleCard />

      {/* 관리자 모드 (is_admin인 경우에만 노출) + 잠금 해제된 경우에만 admin 카드들 표시 */}
      <AdminSection qc={qc} />

      {/* 계좌 관리 (모든 사용자) */}
      <AccountsSection />

    </div>
  )
}

/* ──────────────────────────────────────────────────────
   프로필 카드 (닉네임 수정)
   ────────────────────────────────────────────────────── */
function ProfileCard({ user, totalVal = 0, onSaved, onLogout }) {
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
            ₩{Math.round(totalVal).toLocaleString()}
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
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4,
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

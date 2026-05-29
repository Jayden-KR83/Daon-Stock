import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { useStore } from '../store'
import {
  listUsers, adminApproveUser, adminRejectUser, adminSuspendUser, adminReinstateUser,
  adminToggleAi, adminPromoteUser, adminDeleteUser, adminGetStats, adminGetAuditLog,
  adminUnlock, adminSetPassword,
} from '../api'

/**
 * 관리자 탭 — 앱 사용자 종합 관리 + 사용 현황 모니터링.
 * - 가입 승인 대기 사용자 (Pending) 승인/거부
 * - 전체 사용자: AI 권한 / 정지 / 관리자 승격 / 삭제
 * - 사용 현황: 총 사용자 / 활동 사용자 / 가입 추이 / AI 호출 추이
 * - 활동 로그: 최근 50개
 */
export default function AdminTab() {
  const qc = useQueryClient()
  const currentUser = useStore(s => s.currentUser)
  const adminStatus = useStore(s => s.adminStatus)

  // is_admin 체크 — 일반 사용자는 접근 불가 메시지
  if (!currentUser?.is_admin) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div className="emoji-mute" style={{ fontSize: 48, marginBottom: 10 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 6 }}>
          관리자 권한이 필요합니다
        </div>
        <div className="ko-keep" style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
          이 탭은 앱 사용자 및 사용 현황 관리 전용입니다.
        </div>
      </div>
    )
  }

  // 관리자 모드 잠금 해제 (별도 화면)
  if (!adminStatus.unlocked) {
    return <AdminUnlockPanel />
  }

  return <AdminDashboard />
}

/* ── 관리자 잠금 해제 패널 ── */
function AdminUnlockPanel() {
  const qc = useQueryClient()
  const adminStatus = useStore(s => s.adminStatus)
  const setAdminStatus = useStore(s => s.setAdminStatus)
  const [password, setPassword] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleUnlock(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await adminUnlock(password)
      qc.invalidateQueries({ queryKey: ['admin-status'] })
      setAdminStatus({ ...adminStatus, unlocked: true })
    } catch (e) {
      setErr(e.response?.data?.detail || '암호가 일치하지 않습니다')
    } finally {
      setBusy(false)
    }
  }
  async function handleSetPw(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    if (newPw.length < 6) { setErr('6자 이상 입력하세요'); setBusy(false); return }
    if (newPw !== confirmPw) { setErr('확인 비밀번호가 일치하지 않습니다'); setBusy(false); return }
    try {
      await adminSetPassword('', newPw)
      qc.invalidateQueries({ queryKey: ['admin-status'] })
      setAdminStatus({ ...adminStatus, password_set: true, unlocked: true })
    } catch (e) {
      setErr(e.response?.data?.detail || '설정 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '24px 16px', maxWidth: 420, margin: '0 auto' }}>
      <div className="emoji-mute" style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>🛡</div>
      <div style={{ fontSize: 18, fontWeight: 800, textAlign: 'center',
        color: 'var(--clr-text-strong)', marginBottom: 6, letterSpacing: '-.02em' }}>
        관리자 모드
      </div>
      <div className="ko-keep" style={{ fontSize: 12, color: 'var(--clr-text-muted)',
        textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
        사용자 승인 · AI 권한 부여 등 민감한 작업을 수행합니다. <br/>
        세션은 1시간 동안 유지됩니다.
      </div>

      {adminStatus.password_set ? (
        <form onSubmit={handleUnlock}>
          <label style={lblStyle}>관리자 암호</label>
          <input className="input" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" required autoFocus />
          {err && <div style={errStyle}>{err}</div>}
          <button type="submit" disabled={busy} style={btnStyle}>
            {busy ? '확인 중...' : '잠금 해제'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSetPw}>
          <div style={{ padding: '10px 12px', background: 'var(--clr-warn-bg)',
            border: '1px solid var(--clr-warn-border, #FED7AA)', borderRadius: 8,
            fontSize: 11, color: 'var(--clr-warn-dark, #9A3412)', lineHeight: 1.6, marginBottom: 14 }}>
            <strong>최초 설정</strong> — 관리자 암호를 설정해주세요. 이 암호는 사용자 관리 기능 접근 시마다 필요합니다.
          </div>
          <label style={lblStyle}>새 관리자 암호 (6자 이상)</label>
          <input className="input" type="password" value={newPw}
            onChange={e => setNewPw(e.target.value)} placeholder="••••••••" required />
          <label style={{ ...lblStyle, marginTop: 10 }}>암호 확인</label>
          <input className="input" type="password" value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" required />
          {err && <div style={errStyle}>{err}</div>}
          <button type="submit" disabled={busy} style={btnStyle}>
            {busy ? '설정 중...' : '관리자 암호 설정'}
          </button>
        </form>
      )}
    </div>
  )
}

/* ── 관리자 대시보드 (잠금 해제 후) ── */
function AdminDashboard() {
  const qc = useQueryClient()
  const [section, setSection] = useState('users') // 'users' | 'stats' | 'audit'
  const [filter,  setFilter]  = useState('all')   // 'all' | 'pending' | 'approved' | 'suspended'

  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: listUsers,
    refetchInterval: 30_000,
  })
  const users = usersData?.users || []
  const pendingCount = users.filter(u => u.status === 'pending').length

  const filteredUsers = filter === 'all' ? users : users.filter(u => u.status === filter)

  return (
    <div style={{ paddingTop: 8 }}>
      {/* 헤더 + 섹션 토글 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--clr-text-strong)',
            letterSpacing: '-.03em' }}>다온 관리자</div>
          <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
            사용자 · AI 권한 · 사용 현황을 관리합니다
          </div>
        </div>
        <div className="seg-ctrl" style={{ flex: 'none' }}>
          {[
            ['users', '사용자', pendingCount > 0 ? pendingCount : null],
            ['stats', '사용 현황', null],
            ['audit', '활동 로그', null],
          ].map(([key, lbl, badge]) => (
            <button key={key}
              className={`seg-btn ${section === key ? 'active' : ''}`}
              onClick={() => setSection(key)} style={{ position: 'relative' }}>
              {lbl}
              {badge != null && (
                <span style={{
                  display: 'inline-block', marginLeft: 4,
                  background: 'var(--clr-neg)', color: '#fff',
                  fontSize: 9, fontWeight: 800, padding: '0 5px',
                  borderRadius: 8, lineHeight: '14px',
                }}>{badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {section === 'users' && (
          <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* 상태 필터 */}
            <div className="seg-ctrl" style={{ marginBottom: 10 }}>
              {[
                ['all',       `전체 (${users.length})`],
                ['pending',   `승인대기 (${pendingCount})`],
                ['approved',  `승인됨 (${users.filter(u => u.status === 'approved').length})`],
                ['suspended', `정지 (${users.filter(u => u.status === 'suspended').length})`],
              ].map(([k, lbl]) => (
                <button key={k}
                  className={`seg-btn ${filter === k ? 'active' : ''}`}
                  onClick={() => setFilter(k)} style={{ fontSize: 11 }}>
                  {lbl}
                </button>
              ))}
            </div>

            {filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40,
                color: 'var(--clr-text-muted)', fontSize: 12 }}>
                해당 상태의 사용자가 없습니다
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredUsers.map(u => (
                  <UserCard key={u.user_id} user={u}
                    onChange={() => qc.invalidateQueries({ queryKey: ['admin-users'] })} />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {section === 'stats' && (
          <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StatsPanel />
          </motion.div>
        )}

        {section === 'audit' && (
          <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AuditLogPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── 사용자 카드 ── */
function UserCard({ user, onChange }) {
  const currentUser = useStore(s => s.currentUser)
  const isSelf = user.user_id === currentUser?.user_id
  const [busy, setBusy] = useState('')
  const [err,  setErr]  = useState('')

  async function safe(fn, key) {
    setErr(''); setBusy(key)
    try { await fn(); onChange() }
    catch (e) { setErr(e.response?.data?.detail || '실패') }
    finally { setBusy('') }
  }
  const statusColor = {
    pending:   { bg: 'var(--clr-warn-bg)',   fg: 'var(--clr-warn-dark)',  text: '승인 대기' },
    approved:  { bg: 'var(--clr-pos-bg-soft)', fg: 'var(--clr-pos-darker)', text: '승인됨' },
    rejected:  { bg: 'var(--clr-neg-bg-soft)', fg: 'var(--clr-neg-dark)',   text: '거부됨' },
    suspended: { bg: '#FEF3C7', fg: '#92400E', text: '정지' },
  }[user.status] || { bg: 'var(--clr-bg)', fg: 'var(--clr-text-muted)', text: user.status }
  const lastSeen = user.last_seen_at
    ? new Date(user.last_seen_at * 1000).toLocaleString('ko-KR',
        { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border-md)',
      borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--clr-text-strong)' }}>
              {user.nickname || user.name}
            </span>
            {user.is_admin && (
              <span style={{ padding: '1px 6px', background: 'var(--clr-ai)', color: '#fff',
                fontSize: 9, fontWeight: 800, borderRadius: 4 }}>관리자</span>
            )}
            {isSelf && (
              <span style={{ padding: '1px 6px', background: 'var(--clr-info-bg)',
                color: 'var(--clr-info-dark)', fontSize: 9, fontWeight: 800, borderRadius: 4 }}>본인</span>
            )}
            <span style={{ padding: '1px 7px', background: statusColor.bg, color: statusColor.fg,
              fontSize: 9, fontWeight: 800, borderRadius: 4 }}>{statusColor.text}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 2 }}>
            {user.email} · ID {user.user_id}
          </div>
          <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 4 }}>
            보유 {user.holdings}종 · 관심 {user.watchlist}종 · 로그인 {user.login_count}회 ·
            AI 호출 {user.ai_call_count}회 · 마지막 접속 {lastSeen}
          </div>
        </div>
      </div>

      {err && <div style={{ fontSize: 11, color: 'var(--clr-neg-dark)', marginBottom: 6 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {user.status === 'pending' && (
          <>
            <SmallBtn variant="primary" busy={busy === 'approve'}
              onClick={() => safe(() => adminApproveUser(user.user_id), 'approve')}>
              승인
            </SmallBtn>
            <SmallBtn variant="danger" busy={busy === 'reject'}
              onClick={() => safe(() => adminRejectUser(user.user_id), 'reject')}>
              거부
            </SmallBtn>
          </>
        )}
        {user.status === 'approved' && !isSelf && (
          <SmallBtn variant="warn" busy={busy === 'suspend'}
            onClick={() => safe(() => adminSuspendUser(user.user_id), 'suspend')}>
            정지
          </SmallBtn>
        )}
        {(user.status === 'suspended' || user.status === 'rejected') && (
          <SmallBtn variant="primary" busy={busy === 'reinstate'}
            onClick={() => safe(() => adminReinstateUser(user.user_id), 'reinstate')}>
            복원
          </SmallBtn>
        )}
        {user.status === 'approved' && (
          <SmallBtn variant={user.ai_enabled ? 'enabled' : 'outlined'} busy={busy === 'ai'}
            onClick={() => safe(() => adminToggleAi(user.user_id, !user.ai_enabled), 'ai')}>
            AI {user.ai_enabled ? '권한 회수' : '권한 부여'}
          </SmallBtn>
        )}
        {!isSelf && user.status === 'approved' && (
          <SmallBtn variant={user.is_admin ? 'enabled' : 'outlined'} busy={busy === 'promote'}
            onClick={() => safe(() => adminPromoteUser(user.user_id, !user.is_admin), 'promote')}>
            {user.is_admin ? '관리자 회수' : '관리자 승격'}
          </SmallBtn>
        )}
        {!isSelf && (
          <SmallBtn variant="danger-outlined" busy={busy === 'delete'}
            onClick={() => {
              if (window.confirm(`${user.email} 계정을 완전히 삭제합니다. 되돌릴 수 없습니다.`)) {
                safe(() => adminDeleteUser(user.user_id), 'delete')
              }
            }}>
            삭제
          </SmallBtn>
        )}
      </div>
    </div>
  )
}

function SmallBtn({ children, busy, variant = 'outlined', ...props }) {
  const styles = {
    primary:        { bg: 'var(--clr-pos)',          fg: '#fff', bd: 'var(--clr-pos)' },
    danger:         { bg: 'var(--clr-neg)',          fg: '#fff', bd: 'var(--clr-neg)' },
    'danger-outlined': { bg: 'transparent', fg: 'var(--clr-neg-dark)', bd: 'var(--clr-neg-dark)' },
    warn:           { bg: 'var(--clr-warn, #F59E0B)',fg: '#fff', bd: 'var(--clr-warn, #F59E0B)' },
    enabled:        { bg: 'var(--clr-info)',         fg: '#fff', bd: 'var(--clr-info)' },
    outlined:       { bg: 'transparent', fg: 'var(--clr-text-sub)', bd: 'var(--clr-border-md)' },
  }[variant]
  return (
    <button {...props} disabled={!!busy}
      style={{
        padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700,
        background: styles.bg, color: styles.fg, border: `1px solid ${styles.bd}`,
        cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
        opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap',
      }}>
      {busy ? '...' : children}
    </button>
  )
}

/* ── 사용 현황 패널 ── */
function StatsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminGetStats,
    refetchInterval: 60_000,
  })
  if (isLoading || !data) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--clr-text-muted)' }}>로딩 중...</div>
  }
  const t = data.totals || {}
  return (
    <div>
      {/* 핵심 지표 4개 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
        <StatTile label="전체 사용자" value={t.total_users} sub={`승인 ${t.approved_users || 0} · 대기 ${t.pending_users || 0}`} />
        <StatTile label="AI 권한 부여" value={t.ai_enabled_users} sub={`관리자 ${t.admin_users || 0}명 포함`} />
        <StatTile label="활성 (24h)" value={data.active_24h} sub={`7일 ${data.active_7d || 0}명`} />
        <StatTile label="총 AI 호출" value={t.total_ai_calls} sub={`로그인 ${t.total_logins || 0}회`} />
      </div>

      {/* 가입 추이 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>최근 30일 가입 추이</div>
        <DailyBarChart data={data.signup_trend} barColor="var(--clr-info)" />
      </div>

      {/* AI 호출 추이 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>최근 7일 AI 호출</div>
        <DailyBarChart data={data.ai_call_trend} barColor="var(--clr-ai)" />
      </div>
    </div>
  )
}

function StatTile({ label, value, sub }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', fontWeight: 700,
        letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--clr-text-strong)',
        letterSpacing: '-.02em', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? 0}
      </div>
      <div className="ko-keep" style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function DailyBarChart({ data = [], barColor = 'var(--clr-info)' }) {
  if (!data.length) {
    return <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', padding: '10px 0' }}>
      데이터가 아직 없습니다
    </div>
  }
  const maxV = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70, marginTop: 8 }}>
      {data.map(d => {
        const h = Math.round((d.count / maxV) * 60)
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 2 }} title={`${d.date}: ${d.count}`}>
            <div style={{ width: '100%', height: h, background: barColor, borderRadius: 2,
              minHeight: d.count > 0 ? 2 : 0 }} />
            <div style={{ fontSize: 8, color: 'var(--clr-text-muted)' }}>
              {d.date.slice(5)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 활동 로그 패널 ── */
function AuditLogPanel() {
  const [eventType, setEventType] = useState('')
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-audit', eventType],
    queryFn: () => adminGetAuditLog({ limit: 80, event_type: eventType }),
  })
  const events = data?.events || []
  const eventTypeLabels = {
    'register':           '🆕 가입',
    'login':              '🔐 로그인',
    'login_fail':         '⛔ 로그인 실패',
    'login_blocked':      '🚫 로그인 차단',
    'ai_call':            '◆ AI 호출',
    'admin_approve_user': '✓ 사용자 승인',
    'admin_reject_user':  '✗ 사용자 거부',
    'admin_suspend_user': '⏸ 사용자 정지',
    'admin_reinstate_user': '↻ 사용자 복원',
    'admin_ai_toggle':    '◆ AI 권한 변경',
    'admin_promote':      '⬆ 관리자 변경',
    'admin_delete_user':  '🗑 사용자 삭제',
  }

  return (
    <div>
      <div className="seg-ctrl" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        {[['', '전체'], ['login', '로그인'], ['ai_call', 'AI 호출'],
          ['register', '가입'], ['admin_approve_user', '승인']].map(([k, lbl]) => (
          <button key={k}
            className={`seg-btn ${eventType === k ? 'active' : ''}`}
            onClick={() => setEventType(k)} style={{ fontSize: 11 }}>
            {lbl}
          </button>
        ))}
        <button onClick={() => refetch()} className="seg-btn" style={{ fontSize: 11 }}>↻</button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--clr-text-muted)' }}>로딩 중...</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40,
          color: 'var(--clr-text-muted)', fontSize: 12 }}>이벤트가 없습니다</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.map(ev => (
            <div key={ev.id} style={{
              background: 'var(--clr-surface)', border: '1px solid var(--clr-border)',
              borderRadius: 8, padding: '7px 10px',
              fontSize: 11, fontFamily: 'Manrope, system-ui',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--clr-text-strong)' }}>
                  <span className="emoji-mute" style={{ marginRight: 4 }}>
                    {(eventTypeLabels[ev.event_type] || ev.event_type).split(' ')[0]}
                  </span>
                  {(eventTypeLabels[ev.event_type] || ev.event_type).split(' ').slice(1).join(' ')
                    || ev.event_type}
                </span>
                <span style={{ fontSize: 10, color: 'var(--clr-text-muted)',
                  fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(ev.ts * 1000).toLocaleString('ko-KR',
                    { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--clr-text-muted)',
                marginTop: 2 }}>
                {ev.email || ev.user_id || 'system'}
                {Object.keys(ev.details || {}).length > 0 && (
                  <span style={{ marginLeft: 6, color: 'var(--clr-text-sub)' }}>
                    · {Object.entries(ev.details).map(([k, v]) =>
                        `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── styles ── */
const lblStyle = { fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)',
  display: 'block', marginBottom: 5, letterSpacing: '.04em', marginTop: 10 }
const errStyle = { background: 'var(--clr-neg-bg-soft)', borderRadius: 8,
  padding: '8px 10px', fontSize: 11, color: 'var(--clr-neg-dark)', marginTop: 8 }
const btnStyle = { width: '100%', padding: '11px', borderRadius: 10,
  background: 'var(--clr-info)', color: '#fff', border: 'none',
  fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginTop: 14 }
const cardStyle = { background: 'var(--clr-surface)',
  border: '1px solid var(--clr-border-md)', borderRadius: 12,
  padding: '12px 14px', marginBottom: 10 }
const cardTitleStyle = { fontSize: 11, fontWeight: 800, color: 'var(--clr-text-sub)',
  letterSpacing: '.05em', textTransform: 'uppercase' }

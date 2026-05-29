import React, { useState } from 'react'
import { authLogin, authRegister } from '../api'
import { useStore } from '../store'

export default function LoginPage() {
  const setAuth = useStore(s => s.setAuth)
  const [mode,     setMode]     = useState('login')   // 'login' | 'register'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [pwShow,   setPwShow]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [pendingMessage, setPendingMessage] = useState('')  // 회원가입 후 안내

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setPendingMessage('')
    setLoading(true)
    try {
      const body = { email, password, ...(mode === 'register' ? { name } : {}) }
      const res  = mode === 'login' ? await authLogin(body) : await authRegister(body)
      // 회원가입 + pending 상태 — 토큰이 없는 경우
      if (mode === 'register' && (!res.token || res.status === 'pending')) {
        setPendingMessage(res.message || '가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.')
        setMode('login')
        setPassword('')
        setName('')
        return
      }
      setAuth(res.token, res.user)
    } catch (err) {
      setError(err?.response?.data?.detail || '오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--clr-border)', padding: '20px', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* 로고 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--clr-text-strong)',
            letterSpacing: '-0.04em', marginBottom: 6 }}>
            다온 <span style={{ color: 'var(--clr-info)' }}>·</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', letterSpacing: '0.06em' }}>
            개인 AI 주식 포트폴리오
          </div>
        </div>

        {/* 카드 */}
        <div style={{ background: 'var(--clr-surface)', borderRadius: 16, padding: '28px 24px',
          boxShadow: '0 4px 24px rgba(0,0,0,.08)', border: '1px solid var(--clr-border-md)' }}>

          {/* 탭 전환 */}
          <div style={{ display: 'flex', marginBottom: 24, background: 'var(--clr-bg)',
            borderRadius: 8, padding: 3 }}>
            {[['login', '로그인'], ['register', '계정 만들기']].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '7px 0', borderRadius: 6,
                background: mode === m ? 'var(--clr-surface)' : 'transparent',
                border: mode === m ? '1px solid var(--clr-border-md)' : '1px solid transparent',
                color: mode === m ? 'var(--clr-text-strong)' : 'var(--clr-text-muted)',
                fontSize: 13, fontWeight: mode === m ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.06)' : 'none',
                transition: 'all .15s',
              }}>{label}</button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {/* 이름 (회원가입만) */}
            {mode === 'register' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)',
                  display: 'block', marginBottom: 5, letterSpacing: '0.04em' }}>
                  이름
                </label>
                <input
                  type="text" placeholder="홍길동"
                  value={name} onChange={e => setName(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {/* 이메일 */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)',
                display: 'block', marginBottom: 5, letterSpacing: '0.04em' }}>
                이메일
              </label>
              <input
                type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email"
                style={inputStyle}
              />
            </div>

            {/* 비밀번호 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)',
                display: 'block', marginBottom: 5, letterSpacing: '0.04em' }}>
                비밀번호 {mode === 'register' && <span style={{ color: 'var(--clr-border-strong)', fontWeight: 400 }}>(6자 이상)</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={pwShow ? 'text' : 'password'} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <button type="button" onClick={() => setPwShow(v => !v)} style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 15, color: 'var(--clr-text-muted)', padding: 0,
                }}>
                  {pwShow ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* 가입 승인 안내 (회원가입 직후) */}
            {pendingMessage && (
              <div style={{ background: 'var(--clr-info-bg)', border: '1px solid var(--clr-info-border)',
                borderRadius: 8, padding: '10px 12px', marginBottom: 14,
                fontSize: 12, color: 'var(--clr-info-dark)', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 800, marginBottom: 3 }}>✓ 가입 신청 완료</div>
                {pendingMessage}
              </div>
            )}

            {/* 오류 메시지 */}
            {error && (
              <div style={{ background: 'var(--clr-neg-bg-soft)', border: '1px solid var(--clr-neg-border)',
                borderRadius: 8, padding: '9px 12px', marginBottom: 14,
                fontSize: 12, color: 'var(--clr-neg-dark)', lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            {/* 제출 버튼 */}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', borderRadius: 10,
              background: loading ? 'var(--clr-info-dark)' : 'var(--clr-info)',
              opacity: loading ? .6 : 1,
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'background .15s',
              letterSpacing: '0.02em',
            }}>
              {loading
                ? (mode === 'login' ? '로그인 중...' : '계정 생성 중...')
                : (mode === 'login' ? '로그인' : '계정 만들기')}
            </button>
          </form>
        </div>

        {/* 하단 안내 */}
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: 'var(--clr-border-strong)' }}>
          포트폴리오 데이터는 Oracle Cloud 서버에 안전하게 저장됩니다
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--clr-border-md)', fontSize: 13, color: 'var(--clr-text-strong)',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color .15s',
  background: 'var(--clr-bg)',
}

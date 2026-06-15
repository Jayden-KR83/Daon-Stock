import React, { useState, useRef } from 'react'
import { authLogin, authRegister, authDemo } from '../api'
import { useStore } from '../store'
import './LoginPage.css'

/* ── 인라인 SVG 아이콘 (Material Symbols 폰트 의존 제거) ── */
const I = {
  brand: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-6 4 4 6-8" /><path d="M3 21h18" />
    </svg>
  ),
  arrow: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
    </svg>
  ),
}

export default function LoginPage() {
  const setAuth = useStore(s => s.setAuth)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [pwShow, setPwShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingMessage, setPendingMessage] = useState('')
  const authRef = useRef(null)

  function gotoAuth(register) {
    if (register) setMode('register')
    authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setPendingMessage(''); setLoading(true)
    try {
      const body = { email, password, ...(mode === 'register' ? { name, invite_code: inviteCode } : {}) }
      const res = mode === 'login' ? await authLogin(body) : await authRegister(body)
      if (mode === 'register' && (!res.token || res.status === 'pending')) {
        setPendingMessage(res.message || '가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.')
        setMode('login'); setPassword(''); setName(''); setInviteCode('')
        return
      }
      setAuth(res.token, res.user)
    } catch (err) {
      setError(err?.response?.data?.detail || '오류가 발생했습니다. 다시 시도해주세요.')
    } finally { setLoading(false) }
  }

  async function handleDemo() {
    setError(''); setPendingMessage(''); setLoading(true)
    try {
      const res = await authDemo()
      setAuth(res.token, res.user)
    } catch (err) {
      setError(err?.response?.data?.detail || '데모 진입에 실패했습니다.')
    } finally { setLoading(false) }
  }

  return (
    <div className="daon-landing">
      {/* ── Nav ── */}
      <header className="dl-nav">
        <nav className="dl-nav-in">
          <div className="dl-brand">
            <span className="dl-brand-mark">{I.brand}</span>
            <span className="dl-brand-name">다온</span>
          </div>
          <button className="dl-btn dl-btn-navy dl-btn-sm" onClick={() => gotoAuth(false)}>시작하기</button>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="dl-hero">
          <div>
            <div className="dl-badge">
              <span className="dl-badge-dot" />
              <span className="dl-badge-txt">AI 종목 발굴 에이전트</span>
            </div>
            <h1 className="dl-h1">
              우상향을 믿는 투자,<br /><em>경제적 자유</em>로.
            </h1>
            <p className="dl-sub">
              AI가 종목을 발굴하고 심층 분석해, 당신만의 포트폴리오 전략을 제안합니다.
              장기 투자와 우상향의 믿음으로 자산을 키우세요.
            </p>
            <div className="dl-cta-row">
              <button className="dl-btn dl-btn-green dl-btn-lg" onClick={() => gotoAuth(true)}>
                시작하기 {I.arrow}
              </button>
              <button className="dl-btn dl-btn-ghost dl-btn-lg" onClick={handleDemo} disabled={loading}>
                데모 둘러보기
              </button>
            </div>
          </div>

          {/* 우측: 실제 인증 카드 */}
          <div className="dl-auth" ref={authRef}>
            <div className="dl-auth-head">
              <div className="dl-auth-title">{mode === 'login' ? '다시 오신 걸 환영해요' : '계정 만들기'}</div>
              <div className="dl-auth-desc">이메일로 다온에 접속하세요</div>
            </div>

            <div className="dl-tabs">
              {[['login', '로그인'], ['register', '계정 만들기']].map(([m, lb]) => (
                <button key={m} type="button" className={`dl-tab ${mode === m ? 'on' : ''}`}
                  onClick={() => { setMode(m); setError('') }}>{lb}</button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              {mode === 'register' && (
                <div className="dl-field">
                  <label className="dl-label">이름</label>
                  <input className="dl-input" type="text" placeholder="홍길동"
                    value={name} onChange={e => setName(e.target.value)} />
                </div>
              )}
              <div className="dl-field">
                <label className="dl-label">이메일</label>
                <input className="dl-input" type="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="dl-field" style={{ marginBottom: 18 }}>
                <label className="dl-label">
                  비밀번호 {mode === 'register' && <span style={{ color: 'var(--outline)', fontWeight: 400 }}>(6자 이상)</span>}
                </label>
                <div className="dl-pw-wrap">
                  <input className="dl-input" type={pwShow ? 'text' : 'password'} placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    style={{ paddingRight: 40 }} />
                  <button type="button" className="dl-pw-toggle" onClick={() => setPwShow(v => !v)}>
                    {pwShow ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <div className="dl-field" style={{ marginBottom: 18 }}>
                  <label className="dl-label">초대 코드</label>
                  <input className="dl-input" type="text" placeholder="관리자에게 받은 코드"
                    value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                    autoComplete="off" />
                </div>
              )}

              {pendingMessage && (
                <div className="dl-msg dl-msg-ok">
                  <strong>✓ 가입 신청 완료</strong><br />{pendingMessage}
                </div>
              )}
              {error && <div className="dl-msg dl-msg-err">{error}</div>}

              <button type="submit" className="dl-btn dl-btn-navy" disabled={loading}
                style={{ width: '100%', padding: '13px' }}>
                {loading ? (mode === 'login' ? '로그인 중...' : '생성 중...') : (mode === 'login' ? '로그인' : '계정 만들기')}
              </button>
            </form>

            <div className="dl-auth-demo">
              <button type="button" className="dl-btn dl-btn-ghost" onClick={handleDemo} disabled={loading}
                style={{ width: '100%', padding: '11px' }}>
                🔍 로그인 없이 데모 둘러보기
              </button>
              <div className="dl-demo-cap">샘플 포트폴리오로 전체 UI 체험 (실데이터 아님)</div>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="dl-footer">
        <div className="dl-footer-in">
          <div>
            <div className="dl-brand">
              <span className="dl-brand-mark">{I.brand}</span>
              <span className="dl-brand-name" style={{ fontSize: 19 }}>다온</span>
            </div>
            <div className="dl-footer-copy">© 2026 DAON · 모든 거래에 정밀함을</div>
          </div>
          <div className="dl-footer-links">
            <a href="#" onClick={e => { e.preventDefault(); gotoAuth(false) }}>로그인</a>
            <a href="mailto:support@daonwealth.com">문의</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { totpStatus, totpSetup, totpEnable, totpDisable } from '../api'

/**
 * 2단계 인증(TOTP) 관리 카드.
 *
 * 설계상 중요한 두 가지:
 * 1) 켜기 전에 코드 1회를 반드시 맞혀야 한다. 인증 앱에 제대로 등록됐는지 확인하지 않고
 *    켜면 그 자리에서 자기 계정에 잠긴다.
 * 2) 복구 코드는 이 화면에서 딱 한 번만 보인다. 오너는 2026-07 GitHub 2FA 분실로
 *    3주간 푸시가 막힌 전례가 있다 — 그래서 저장을 강하게 유도한다.
 *
 * QR 대신 키를 글자로 보여준다: QR 이미지를 외부 서비스로 만들면 시크릿이 제3자에게
 * 넘어가고, 로컬 QR 라이브러리를 넣으면 의존성이 는다. 인증 앱은 모두 수동 입력을 지원한다.
 */
export default function TwoFactorCard() {
  const qc = useQueryClient()
  const { data: st } = useQuery({ queryKey: ['totp-status'], queryFn: totpStatus })

  const [setup, setSetup] = useState(null)   // { secret, otpauth_uri }
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [codes, setCodes] = useState(null)   // 발급 직후 1회 노출
  const [msg, setMsg] = useState(null)       // { type, text }
  const [busy, setBusy] = useState(false)

  const fail = e => setMsg({ type: 'err', text: e?.response?.data?.detail || '실패했습니다.' })

  async function start() {
    setBusy(true); setMsg(null)
    try { setSetup(await totpSetup()) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  async function enable() {
    setBusy(true); setMsg(null)
    try {
      const r = await totpEnable({ code })
      setCodes(r.recovery_codes); setSetup(null); setCode('')
      qc.invalidateQueries({ queryKey: ['totp-status'] })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  async function disable() {
    setBusy(true); setMsg(null)
    try {
      await totpDisable({ code, password: pw })
      setCode(''); setPw(''); setCodes(null)
      setMsg({ type: 'ok', text: '2단계 인증을 껐습니다.' })
      qc.invalidateQueries({ queryKey: ['totp-status'] })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const input = {
    width: '100%', padding: '8px 10px', borderRadius: 4, fontSize: 13,
    border: '1px solid var(--clr-border-md)', background: 'var(--clr-bg-card)',
    color: 'var(--clr-text)', fontFamily: 'inherit', marginTop: 4,
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
          2단계 인증
        </div>
        <span style={{ fontSize: 11, fontWeight: 700,
          color: st?.enabled ? 'var(--clr-pos-darker)' : 'var(--clr-text-muted)' }}>
          {st?.enabled ? '켜짐' : '꺼짐'}
        </span>
        {st?.enabled && (
          <span style={{ fontSize: 10.5, color: 'var(--clr-text-muted)', marginLeft: 'auto' }}>
            남은 복구 코드 {st.recovery_left}개
          </span>
        )}
      </div>

      <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--clr-text-muted)',
        lineHeight: 1.65, marginBottom: 10 }}>
        비밀번호가 유출돼도 인증 앱의 6자리 코드가 없으면 로그인할 수 없습니다.<br />
        Google Authenticator, 1Password 등 어떤 인증 앱이든 됩니다.
      </div>

      {codes && (
        <div style={{ padding: 10, borderRadius: 4, marginBottom: 10,
          background: 'var(--clr-neg-bg-soft)', border: '1px solid var(--clr-border-md)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--clr-neg-dark)', marginBottom: 6 }}>
            복구 코드 — 지금 옮겨 적으세요
          </div>
          <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-sub)',
            lineHeight: 1.6, marginBottom: 8 }}>
            이 화면을 벗어나면 다시 볼 수 없습니다.<br />
            폰을 잃어버렸을 때 이 코드가 유일한 복구 수단입니다. 각 코드는 1회만 씁니다.
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.9,
            color: 'var(--clr-text-strong)' }}>
            {codes.map(c => <div key={c}>{c}</div>)}
          </div>
        </div>
      )}

      {!st?.enabled && !setup && !codes && (
        <button className="btn-primary" onClick={start} disabled={busy}
          style={{ width: 'auto', padding: '8px 16px', fontSize: 12.5 }}>
          2단계 인증 켜기
        </button>
      )}

      {setup && (
        <div>
          <div className="ko-keep" style={{ fontSize: 12, color: 'var(--clr-text-sub)',
            lineHeight: 1.7, marginBottom: 6 }}>
            인증 앱에서 <strong>수동 입력(키 직접 입력)</strong>을 고르고 아래 키를 넣으세요.
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: '.06em',
            padding: '8px 10px', borderRadius: 4, wordBreak: 'break-all',
            background: 'var(--m-surface-variant)', border: '1px solid var(--clr-border-md)',
            color: 'var(--clr-text-strong)' }}>
            {setup.secret}
          </div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 10 }}>
            앱에 표시된 6자리
            <input style={input} value={code} inputMode="numeric" placeholder="000000"
              onChange={e => setCode(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-primary" onClick={enable} disabled={busy || code.length < 6}
              style={{ width: 'auto', padding: '8px 16px', fontSize: 12.5 }}>
              확인하고 켜기
            </button>
            <button className="btn-secondary" onClick={() => { setSetup(null); setCode('') }}>
              취소
            </button>
          </div>
        </div>
      )}

      {st?.enabled && (
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--clr-text-muted)' }}>
            비밀번호
            <input style={input} type="password" value={pw} onChange={e => setPw(e.target.value)} />
          </label>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 8 }}>
            인증 코드 또는 복구 코드
            <input style={input} value={code} onChange={e => setCode(e.target.value)} />
          </label>
          <button className="btn-secondary" onClick={disable} disabled={busy || !pw || !code}
            style={{ marginTop: 10 }}>
            2단계 인증 끄기
          </button>
        </div>
      )}

      {msg && (
        <div className="ko-keep" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 4,
          fontSize: 12, lineHeight: 1.6,
          background: msg.type === 'ok' ? 'var(--clr-pos-bg-soft)' : 'var(--clr-neg-bg-soft)',
          color: msg.type === 'ok' ? 'var(--clr-pos-darker)' : 'var(--clr-neg-dark)' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import changelog from '../changelog.json'

/* ══════════════════════════════════════════════════════════════
   앱 버전 · 업데이트 확인
   ══════════════════════════════════════════════════════════════
   2026-08-28: "고쳤다는데 내 폰에서는 그대로다" 라는 질문이 나왔다.
   서비스워커는 skipWaiting 이라 새로고침 한 번이면 갱신되지만,
   홈 화면 앱은 사용자가 완전히 닫기 전까지 이전 버전 화면을 계속 들고 있다.
   문제는 **지금 무슨 버전을 보고 있는지 알 방법이 없었다**는 것이다.
   그래서 ① 버전을 숫자로 보여주고 ② 강제로 갱신하는 버튼을 둔다.
   ══════════════════════════════════════════════════════════════ */
export default function AppVersionCard() {
  const [state, setState] = useState('')   // '' | 'checking' | 'latest' | 'updating'
  const latest = changelog?.[0]?.version || '—'

  const check = async () => {
    if (state === 'checking' || state === 'updating') return
    setState('checking')
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.()
      if (reg) {
        await reg.update()               // 새 서비스워커가 있으면 즉시 내려받는다
        if (reg.waiting || reg.installing) {
          setState('updating')
          // skipWaiting 이 걸려 있어 곧 활성화된다 — 잠깐 뒤 새로고침
          setTimeout(() => window.location.reload(true), 900)
          return
        }
      }
      /* 새 워커가 없어도 캐시된 화면일 수 있으니 한 번은 강제로 다시 받는다.
         이게 없으면 "확인했는데 아무 일도 안 일어남" 으로 끝나 더 헷갈린다. */
      setState('updating')
      setTimeout(() => window.location.reload(true), 400)
    } catch {
      setState('latest')
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
            앱 버전 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{latest}</span>
          </div>
          <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)',
            marginTop: 2, lineHeight: 1.7 }}>
            홈 화면 앱은 완전히 닫았다 열어야 새 버전이 적용됩니다.
            바로 적용하려면 아래 버튼을 누르세요.
          </div>
        </div>
        <button onClick={check} disabled={state === 'checking' || state === 'updating'}
          style={{ padding: '9px 16px', fontSize: 13, fontFamily: 'inherit',
            cursor: 'pointer', background: 'transparent', flexShrink: 0,
            border: '1px solid var(--clr-border-md)', borderRadius: 4,
            color: 'var(--clr-text-sub)',
            opacity: (state === 'checking' || state === 'updating') ? 0.5 : 1 }}>
          {state === 'updating' ? '적용 중…' : state === 'checking' ? '확인 중…' : '업데이트 확인'}
        </button>
      </div>
    </div>
  )
}

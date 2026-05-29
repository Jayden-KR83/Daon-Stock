import React, { useEffect, useState } from 'react'

/**
 * PWA 설치 안내 — A안 무채색 + 직사각형, 다크/그라데이션 제거.
 * 한 번 닫으면 sessionStorage 기록되어 같은 세션에서는 다시 안 뜸.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [hidden, setHidden]     = useState(
    sessionStorage.getItem('pwa-install-dismissed') === '1'
  )

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferred(e)
    }
    function onAppInstalled() {
      setDeferred(null)
      setHidden(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  if (!deferred || hidden) return null

  async function install() {
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') {
      setDeferred(null)
    } else {
      setHidden(true)
      sessionStorage.setItem('pwa-install-dismissed', '1')
    }
  }

  function dismiss() {
    setHidden(true)
    sessionStorage.setItem('pwa-install-dismissed', '1')
  }

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 16, zIndex: 9999,
      background: 'var(--m-surface)',
      color: 'var(--m-text)',
      borderRadius: 4, padding: '12px 14px',
      boxShadow: '0 2px 12px rgba(15,23,42,.12)',
      border: '1px solid var(--m-outline)',
      maxWidth: 320, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* 좌측 머리글 — 2px 색띠 (둥근 D 그라데이션 X) */}
      <div style={{
        width: 2, alignSelf: 'stretch',
        background: 'var(--m-text)',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800,
          color: 'var(--m-text)', marginBottom: 2 }}>
          홈 화면에 설치
        </div>
        <div className="ko-keep" style={{ fontSize: 10.5,
          color: 'var(--m-text-secondary)', lineHeight: 1.45 }}>
          앱처럼 빠르게 실행하고 오프라인에서도 마지막 화면을 볼 수 있습니다.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column',
        gap: 4, flexShrink: 0 }}>
        <button onClick={install} style={{
          padding: '5px 12px', borderRadius: 2, border: 'none',
          background: 'var(--m-text)', color: 'var(--m-surface)',
          fontSize: 11, fontWeight: 800, cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '-.01em',
        }}>설치</button>
        <button onClick={dismiss} style={{
          padding: '5px 12px', borderRadius: 2,
          border: '1px solid var(--m-outline-variant)',
          background: 'transparent', color: 'var(--m-text-secondary)',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>나중에</button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PWA 설치 — 한 곳에서만 다룬다
   ══════════════════════════════════════════════════════════════
   두 군데(InstallPrompt, PushSetupCard)가 각자 beforeinstallprompt 를
   듣고 있었고, 둘 다 React 마운트 뒤에 리스너를 달았다. 이 이벤트는
   페이지당 한 번뿐이라 마운트 전에 지나가면 설치 버튼이 영영 안 뜬다.
   2026-09-09 갤럭시 탭에서 "설치를 못하게 되어 있다" 던 것의 원인이다.

   지금은 index.html 인라인 스크립트가 번들보다 먼저 이벤트를 잡아
   window.__daonInstallEvent 에 보관하고 daon:installable 을 쏜다.
   여기서는 그 보관분을 읽기만 한다 — 늦게 마운트돼도 놓치지 않는다.
   ══════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches
      || window.navigator.standalone === true
}

const ua = () => navigator.userAgent || ''
export const isIos = () => /iPad|iPhone|iPod/.test(ua())
export const isAndroid = () => /Android/.test(ua())
/* 삼성 인터넷은 크롬 계열이지만 메뉴 문구가 다르다.
   "⋮ → 앱 설치" 라고 안내하면 그 항목이 없어서 사용자가 헤맨다. */
export const isSamsungInternet = () => /SamsungBrowser/.test(ua())

/** 설치 이벤트를 못 받았을 때 손으로 설치하는 길 — 브라우저마다 다르다. */
export function manualInstallSteps() {
  if (isIos()) {
    return '사파리 하단 공유 버튼 → "홈 화면에 추가" → 홈 화면의 다온 아이콘으로 다시 열기.'
  }
  if (isSamsungInternet()) {
    return '삼성 인터넷 하단 ≡ 메뉴 → "현재 페이지 추가" → "홈 화면" 선택 → 홈 화면의 다온 아이콘으로 다시 열기.'
  }
  if (isAndroid()) {
    return '크롬 우상단 ⋮ → "앱 설치"(없으면 "홈 화면에 추가") → 홈 화면의 다온 아이콘으로 다시 열기.'
  }
  return '주소창 오른쪽의 설치 아이콘(⊕)을 누르거나, 브라우저 메뉴 → "다온 설치"를 고르세요.'
}

/**
 * 설치 상태를 한 번에 알려준다.
 *   installed  — 이미 홈 화면 앱으로 실행 중
 *   deferred   — 브라우저가 준 설치 이벤트(있으면 버튼 한 번으로 설치)
 *   install()  — 실제 설치 실행. 성공하면 true
 */
export function useInstall() {
  const [deferred, setDeferred] = useState(() => window.__daonInstallEvent || null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onReady = () => setDeferred(window.__daonInstallEvent || null)
    const onDone = () => { setDeferred(null); setInstalled(true) }
    window.addEventListener('daon:installable', onReady)
    window.addEventListener('daon:installed', onDone)
    /* 선점 스크립트가 없는 환경(개발 중 HTML 교체 등)에 대비한 이중 안전장치 */
    window.addEventListener('beforeinstallprompt', onReady)
    onReady()
    return () => {
      window.removeEventListener('daon:installable', onReady)
      window.removeEventListener('daon:installed', onDone)
      window.removeEventListener('beforeinstallprompt', onReady)
    }
  }, [])

  async function install() {
    const e = deferred || window.__daonInstallEvent
    if (!e) return false
    e.prompt()
    const { outcome } = await e.userChoice
    window.__daonInstallEvent = null
    setDeferred(null)
    return outcome === 'accepted'
  }

  return { deferred, installed, install, manualSteps: manualInstallSteps() }
}

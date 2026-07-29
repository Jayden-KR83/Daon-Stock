/* Web Push 구독 클라이언트 — 권한 요청 + pushManager 구독/해지 + 백엔드 동기화.
   상태: 'unsupported' | 'denied' | 'on' | 'off' */
import { getVapidPublicKey, subscribePush, unsubscribePush } from './api'

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

// VAPID 공개키(base64url) → applicationServerKey(Uint8Array)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function getPushState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('denied')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { key } = await getVapidPublicKey()
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  }
  await subscribePush(sub.toJSON())
  return 'on'
}

/**
 * 앱 아이콘 뱃지 동기화 — 미확인 알림 수를 홈 화면 아이콘에 표시.
 * (카카오톡 290 / 도미노 4 와 같은 형태)
 *
 * 지원: 설치된 PWA 한정 — 데스크톱 Chrome·Edge, iOS 16.4+ 홈화면 웹앱.
 * 안드로이드 Chrome은 Badging API 미지원이라 이 호출이 no-op이 되지만,
 * 런처가 '표시 중인 알림 개수'로 뱃지를 그리므로 푸시 tag 분리로 커버된다.
 * 어느 경로든 실패는 조용히 무시 — 알림 기능 자체에 영향 없음.
 */
export function syncAppBadge(count) {
  const n = Number(count) || 0
  try {
    if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n)
    else if (navigator.clearAppBadge) navigator.clearAppBadge()
  } catch { /* 미지원 */ }
  // SW에도 전달 — 페이지가 닫힌 뒤 뱃지 주체는 SW다
  try {
    navigator.serviceWorker?.ready?.then(reg => {
      reg.active?.postMessage({ type: 'daon-badge', count: n })
    }).catch(() => {})
  } catch { /* 미지원 */ }
}

export async function disablePush() {
  if (!pushSupported()) return 'unsupported'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    try { await unsubscribePush(sub.endpoint) } catch {}
    try { await sub.unsubscribe() } catch {}
  }
  return 'off'
}

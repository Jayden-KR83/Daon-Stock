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

/* 어떤 약속이든 제한 시간을 건다.
   2026-09-03: 폰에서 '알림 켜기'를 눌러도 꺼짐 → 켜짐으로 바뀌지 않는다는 제보.
   navigator.serviceWorker.ready 는 서비스워커가 이 페이지를 제어하지 않으면
   **영원히 대기**한다 — 에러도 안 나고 버튼만 멎는다. 그래서 조용히 멈추는 대신
   제한 시간을 두고 원인을 이름 붙여 던진다. */
function withTimeout(promise, ms, code) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(code)), ms)),
  ])
}

/* 지금 기기의 상태를 그대로 돌려준다. 화면에 띄워 원인을 눈으로 보게 하려는 것 —
   "안 된다"는 제보만으로는 원격에서 원인을 좁힐 수 없다. */
export async function pushDiagnostics() {
  const d = {
    지원: pushSupported() ? '예' : '아니오',
    권한: (typeof Notification !== 'undefined' && Notification.permission) || '알 수 없음',
    홈화면앱: (window.matchMedia?.('(display-mode: standalone)')?.matches
              || window.navigator.standalone === true) ? '예' : '아니오(브라우저)',
    서비스워커: '확인 중',
    구독: '확인 중',
  }
  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 5000, 'sw_timeout')
    d.서비스워커 = reg ? '등록됨' : '없음'
    const sub = await reg.pushManager.getSubscription()
    d.구독 = sub ? '있음' : '없음'
  } catch (e) {
    d.서비스워커 = String(e?.message) === 'sw_timeout' ? '응답 없음(5초)' : '오류'
    d.구독 = '확인 불가'
  }
  return d
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported')
  // 권한 요청은 사용자 제스처 안에서 즉시 불러야 한다(다른 await 뒤로 밀면
  // 일부 브라우저가 제스처로 인정하지 않아 조용히 거부된다).
  const perm = await Notification.requestPermission()
  if (perm === 'denied') throw new Error('denied')
  if (perm !== 'granted') throw new Error('dismissed')   // 사용자가 팝업을 닫음
  const reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'sw_timeout')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    let key
    try {
      ({ key } = await getVapidPublicKey())
    } catch { throw new Error('vapid_failed') }
    if (!key) throw new Error('vapid_failed')
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })
    } catch { throw new Error('subscribe_failed') }
  }
  try {
    await subscribePush(sub.toJSON())
  } catch { throw new Error('server_save_failed') }
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

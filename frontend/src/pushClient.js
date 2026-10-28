/* Web Push 구독 클라이언트 — 권한 요청 + pushManager 구독/해지 + 백엔드 동기화.
   상태: 'unsupported' | 'denied' | 'on' | 'off' */
import { getVapidPublicKey, subscribePush, unsubscribePush, getPushStatus } from './api'

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
    const reg = await swRegistration(6000)
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return 'off'
    /* 2026-10-28: 여기서 `return sub ? 'on' : 'off'` 로 끝냈던 것이 버그였다.
       **브라우저에 구독이 있다는 것과 서버가 보낼 주소를 가졌다는 것은 다른 사실이다.**
       서버는 푸시 서비스가 404/410 을 주면 죽은 구독으로 보고 지운다(_push_send).
       그때 브라우저 쪽 구독은 그대로 남으므로, 자기 구독만 보면 '켜짐'으로 보인다.
       그리고 켜져 있다고 믿으면 재등록을 하지 않으므로 **스스로 낫지 않는다.**
       실제로 오너 폰이 그 상태였다 — 진단은 '구독 있음', 테스트는 '보낼 기기 없음',
       알림 100건이 앱 안에만 쌓였다.
       그래서 이제 서버에도 묻고, 어긋나 있으면 조용히 다시 등록한다. */
    syncSubscription()
    return 'on'
  } catch {
    return 'off'
  }
}

/* 구독을 **새로 발급**한다 — 기존 것을 버리고 다시 만든다.
 *
 * 2026-10-28: 처음엔 "서버에 다시 등록"만 했는데 그것으로는 낫지 않았다.
 * 서버가 그 구독을 지웠다는 것은 **푸시 서비스가 404/410 을 돌려줬다**는 뜻이고,
 * 죽은 주소를 다시 넣어 봐야 다음 발송에서 또 지워진다. 같은 자리를 맴돈다.
 * VAPID 키가 바뀐 경우에도 기존 구독은 전부 무효가 되는데, 그 역시 재발급이 답이다.
 *
 * 권한이 이미 granted 면 사용자에게 아무것도 묻지 않고 조용히 끝난다.
 */
export async function resubscribe() {
  const reg = await swRegistration(10000)
  const old = await reg.pushManager.getSubscription()
  if (old) { try { await old.unsubscribe() } catch {} }
  let key
  try { ({ key } = await getVapidPublicKey()) } catch { throw new Error('vapid_failed') }
  if (!key) throw new Error('vapid_failed')
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })
  await subscribePush(sub.toJSON())
  return sub
}

/* 브라우저 구독과 서버 등록을 맞춘다. 실패해도 조용히 넘어간다 —
   상태 조회를 막아서는 안 되고, 다음 호출에서 다시 시도하면 된다. */
export async function syncSubscription() {
  try {
    const st = await getPushStatus()
    if ((st?.devices ?? 0) > 0) return 'ok'
    /* 서버에 0대 = **이 구독은 서버가 이미 버린 것**이다. 그대로 다시 넣지 않고
       새로 발급한다(위 resubscribe 주석 참조). 권한이 없으면 사용자가 켜야 한다. */
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted')
      return 'need_permission'
    await resubscribe()
    return 'reissued'
  } catch {
    return 'failed'
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

/* 서비스워커 등록을 가져온다 — `.ready` 를 쓰지 않는다.
 *
 * 2026-10-11: 홈 화면 앱에서 권한이 granted 인데도 진단이 '서비스워커 응답 없음(5초)',
 * '구독 확인 불가' 로 멎었다. 원인은 기다리는 대상이 틀렸다는 것:
 *   `.ready` 는 서비스워커가 **이 페이지를 제어(control)** 할 때까지 기다린다.
 *   그런데 `pushManager.subscribe()` 에 필요한 건 제어가 아니라 **활성화(active)** 다.
 *   새로 설치했거나 SW 가 갱신된 직후의 첫 화면은 아직 제어되지 않아 — 등록은 멀쩡한데
 *   `.ready` 만 영영 안 풀린다.
 * 그래서 getRegistration() 으로 먼저 집고, 없으면 직접 등록하고, active 가 될 때까지만 기다린다.
 */
async function swRegistration(ms = 8000) {
  if (!('serviceWorker' in navigator)) throw new Error('unsupported')

  let reg = await withTimeout(
    navigator.serviceWorker.getRegistration('/'), ms, 'sw_timeout'
  ).catch(() => null)

  // 등록이 아예 없으면 한 번 직접 등록해 본다(자동 등록이 실패했을 수 있다)
  if (!reg) {
    try { reg = await withTimeout(navigator.serviceWorker.register('/sw.js', { scope: '/' }), ms, 'sw_timeout') }
    catch { throw new Error('sw_register_failed') }
  }
  if (!reg) throw new Error('sw_none')
  if (reg.active) return reg

  // installing/waiting 상태면 활성화될 때까지만 기다린다
  const worker = reg.installing || reg.waiting
  if (!worker) throw new Error('sw_inactive')
  await withTimeout(new Promise(res => {
    const onChange = () => { if (worker.state === 'activated') { worker.removeEventListener('statechange', onChange); res() } }
    worker.addEventListener('statechange', onChange)
    if (worker.state === 'activated') res()
  }), ms, 'sw_timeout')
  return reg
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
    '구독(이 기기)': '확인 중',
    '서버 등록': '확인 중',
  }
  try {
    const reg = await swRegistration(6000)
    d.서비스워커 = reg?.active ? '활성' : (reg ? '등록됨(비활성)' : '없음')
    const sub = await reg.pushManager.getSubscription()
    d['구독(이 기기)'] = sub ? '있음' : '없음'
  } catch (e) {
    d.서비스워커 = String(e?.message) === 'sw_timeout' ? '응답 없음(5초)' : '오류'
    d['구독(이 기기)'] = '확인 불가'
  }
  /* 2026-10-28 추가. 이 줄이 없어서 반쪽만 보고 있었다 —
     브라우저에 구독이 있어도 서버에 주소가 없으면 알림은 오지 않는다.
     진단이 그 둘을 하나로 뭉뚱그리면, 멀쩡해 보이는데 아무것도 안 오는
     상태를 설명할 수 없다. */
  try {
    const st = await getPushStatus()
    const n = st?.devices ?? 0
    d['서버 등록'] = n > 0 ? `${n}대` : '0대 — 서버가 보낼 주소가 없습니다'
  } catch {
    d['서버 등록'] = '확인 불가(로그인 상태를 확인하세요)'
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
  const reg = await swRegistration(10000)
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
  const reg = await swRegistration(8000)
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    try { await unsubscribePush(sub.endpoint) } catch {}
    try { await sub.unsubscribe() } catch {}
  }
  return 'off'
}

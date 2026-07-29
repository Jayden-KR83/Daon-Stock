/* 다온 Web Push 핸들러 — vite-plugin-pwa(generateSW)가 importScripts로 로드.
   백엔드 _send_push 의 payload {title, body, url, badge, tag} 를 받아
   ① OS 알림 표시 ② 앱 아이콘 뱃지 숫자 갱신(카카오톡·도미노처럼). */

/* 앱 아이콘 뱃지 — Badging API 미지원 브라우저에서는 조용히 무시.
   안드로이드 런처는 API 미지원이어도 '표시 중인 알림 수'로 뱃지를 그리므로,
   알림 tag를 종목별로 분리하는 것(아래)이 실질적인 카운트 소스다. */
function setBadge(n) {
  try {
    if (typeof n !== 'number' || n < 0) return
    if (n > 0 && self.navigator && self.navigator.setAppBadge) {
      return self.navigator.setAppBadge(n)
    }
    if (n === 0 && self.navigator && self.navigator.clearAppBadge) {
      return self.navigator.clearAppBadge()
    }
  } catch (e) { /* 미지원 — 무시 */ }
}

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch (e) { payload = {} }
  const title = payload.title || '다온 알림'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-badge.png',
    data: { url: payload.url || '/' },
    // 종목별 tag — 같은 tag면 OS가 이전 알림을 '교체'해서 여러 건이 쌓이지 않는다
    tag: payload.tag || 'daon-push',
    renotify: true,
  }
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    setBadge(payload.badge),
  ]))
})

/* 앱에서 '읽음' 처리하면 postMessage로 뱃지 동기화 */
self.addEventListener('message', (event) => {
  const d = event.data || {}
  if (d.type === 'daon-badge') setBadge(d.count)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.focus(); if ('navigate' in w) w.navigate(url); return }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

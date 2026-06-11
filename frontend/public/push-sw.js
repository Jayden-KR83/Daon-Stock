/* 다온 Web Push 핸들러 — vite-plugin-pwa(generateSW)가 importScripts로 로드.
   백엔드 _send_push 의 payload {title, body, url} 를 받아 OS 알림으로 표시. */
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch (e) { payload = {} }
  const title = payload.title || '다온 알림'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
    tag: 'daon-push',
  }
  event.waitUntil(self.registration.showNotification(title, options))
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

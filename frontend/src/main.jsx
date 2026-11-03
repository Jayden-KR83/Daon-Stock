import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

/* PWA Service Worker — 새 버전 자동 갱신.
 *
 * 2026-11-03: 배포를 했는데 오너 화면은 그대로였다. 운영 번들은 분명 새것이었고
 * (index.html 해시가 로컬과 같았다) 기기에 **옛 서비스워커**가 남아 있었다.
 *
 * 원인은 설정이 아니라 **확인 시점**이었다. registerType:'autoUpdate' 는 새 워커를
 * 찾으면 알아서 갈아끼우지만, 찾는 일(update 확인)은 **페이지가 로드될 때 한 번뿐**이다.
 * 주식 앱은 홈 화면에 띄워 두고 며칠씩 쓴다 — 그 동안은 로드가 일어나지 않는다.
 * 그래서 배포해도 영영 옛 화면을 본다.
 *
 * 두 시점에 더 확인한다.
 *   ① 앱으로 돌아올 때(visibilitychange) — 폰에서 가장 흔한 재개 경로
 *   ② 켜 둔 채로 오래 있을 때 60분마다
 * 확인은 네트워크 요청 한 번(sw.js)이라 가볍고, **바뀐 게 없으면 아무 일도 없다.**
 */
const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (import.meta.env.DEV) console.log('SW registered:', swUrl)
    if (!registration) return

    const check = () => {
      // 숨어 있을 때는 확인하지 않는다 — 안 보는 화면을 위해 네트워크를 쓰지 않는다
      if (document.visibilityState !== 'visible') return
      registration.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    setInterval(check, SW_UPDATE_INTERVAL_MS)
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)

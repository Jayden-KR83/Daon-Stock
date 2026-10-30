import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// vite.config 는 ESM 이라 __dirname 이 없다
const __root = dirname(fileURLToPath(import.meta.url))

/* 빌드 식별자 — "내가 보고 있는 게 최신인가"를 판단할 **유일한 근거**.
 *
 * 2026-10-30: 설정 탭이 changelog 의 버전("v2.5")만 보여주고 있었는데,
 * 그 파일은 2026-08-28 에 멈춰 있었다. 그 뒤로 수십 번 배포했는데도 화면은
 * 계속 v2.5 였다. **사람이 손으로 쓰는 기록은 배포를 따라오지 못한다.**
 *
 * 그래서 빌드마다 자동으로 바뀌는 값을 쓴다. 같은 값을 두 곳에 심는다:
 *   · 번들 안(__BUILD_ID__)      → 지금 내 화면이 어느 빌드인지
 *   · backend/static/build.json  → 서버에 올라가 있는 최신 빌드가 무엇인지
 * 둘을 비교하면 '최신인지'를 추측이 아니라 사실로 말할 수 있다.
 */
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    {
      // 번들과 **같은 값**을 서버가 받을 파일로도 쓴다. 두 곳이 어긋나면
      // 비교 자체가 거짓말이 되므로 반드시 한 상수에서 나와야 한다.
      name: 'daon-write-build-id',
      closeBundle() {
        writeFileSync(
          resolve(__root, '..', 'backend', 'static', 'build.json'),
          JSON.stringify({ build: BUILD_ID }) + '\n', 'utf-8')
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      // icon-badge.png는 manifest.icons에 없어 자동 프리캐시 대상이 아니다.
      // 알림 표시 시점에 네트워크가 불안정해도 상태바 아이콘이 뜨도록 명시 포함.
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/icon-badge.png'],
      manifest: {
        name: '다온 포트폴리오',
        short_name: '다온',
        description: '미국·한국 주식 통합 포트폴리오 관리 + AI 분석',
        theme_color: '#0EA5E9',
        background_color: '#0B1120',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'ko-KR',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512',
            type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Web Push 핸들러(push/notificationclick)를 생성 SW에 주입 (public/push-sw.js)
        // ?v= : 파일 부재 시절 Cloudflare가 캐시한 404를 우회(새 캐시 키)
        importScripts: ['push-sw.js?v=1'],
        // API 호출은 캐시하지 않음 (실시간 데이터 우선)
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/finance\.google\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'logos-cache', expiration: { maxAgeSeconds: 604800 } },
          },
          {
            urlPattern: /\/api\/market$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'market-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 600 },
            },
          },
          {
            urlPattern: /\/api\/portfolio$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'portfolio-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 86400 },
            },
          },
        ],
        // 큰 청크 허용 (1MB 단위 React 번들 통과)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Vendor 청크 분리 — 한 번 받으면 캐시 (코드 변경에도 재다운로드 X)
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // 큰 라이브러리는 개별 청크로
          if (id.includes('recharts'))                return 'vendor-recharts'
          if (id.includes('motion'))                  return 'vendor-motion'
          if (id.includes('xlsx'))                    return 'vendor-xlsx'
          if (id.includes('@tanstack'))               return 'vendor-query'
          if (id.includes('zustand'))                 return 'vendor-zustand'
          if (id.includes('react-router'))            return 'vendor-router'
          if (id.includes('/react/')
              || id.includes('/react-dom/')
              || id.includes('scheduler'))            return 'vendor-react'
          return 'vendor'
        },
      },
    },
  }
})

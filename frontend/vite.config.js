import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
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

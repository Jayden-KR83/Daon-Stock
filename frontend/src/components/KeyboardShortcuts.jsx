import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useStore } from '../store'

/**
 * 전역 단축키 핸들러 + 도움말 모달.
 * - 1-4: 보유/관심/비중/차트 탭 이동
 * - 5: 트렌드 탭
 * - /: 검색 input 포커스 (있으면)
 * - ESC: 열려있는 모달 닫기 (자동)
 * - ?: 단축키 도움말
 *
 * input/textarea/contenteditable 포커스 시 키 처리 안 함 (단, ESC는 모달 닫기 제외)
 */
export default function KeyboardShortcuts() {
  const setActiveTab = useStore(s => s.setActiveTab)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    function onKey(e) {
      const target = e.target
      const isEditable = target.matches?.('input, textarea, [contenteditable="true"]')

      // ESC: 도움말 닫기, 또는 임의 모달 닫기 트리거
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return }
        // 모달 backdrop 클릭으로 닫는 패턴 자동 사용 — fixed inset:0 + onClick
        const backdrops = document.querySelectorAll('[data-modal-backdrop="true"], .modal-backdrop')
        if (backdrops.length > 0) {
          backdrops[backdrops.length - 1].click()
        }
        return
      }

      // 편집 중이면 ESC 외 무시
      if (isEditable) return

      // ?: 도움말
      if (e.key === '?' && (e.shiftKey || e.key === '?')) {
        e.preventDefault()
        setHelpOpen(h => !h)
        return
      }

      // /: 검색 input 포커스
      if (e.key === '/') {
        e.preventDefault()
        const search = document.querySelector(
          'input[placeholder*="검색"], input[type="search"], input[placeholder*="search" i]'
        )
        if (search) search.focus()
        return
      }

      // 1-5: 주요 탭 이동 (Cmd/Ctrl 없을 때만, 단순 키)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault()
        const tabMap = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 }
        setActiveTab(tabMap[e.key])
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setActiveTab, helpOpen])

  if (!helpOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={() => setHelpOpen(false)}
        data-modal-backdrop="true"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
          zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, backdropFilter: 'blur(4px)',
        }}>
        <motion.div
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--clr-surface)', borderRadius: 4,
            padding: 24, width: '100%', maxWidth: 400,
            border: '1px solid var(--clr-border-md)',
            boxShadow: '0 20px 50px rgba(15,23,42,.25)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 900,
              color: 'var(--clr-text-strong)', letterSpacing: '-.02em' }}>
              <span className="emoji-mute" style={{ marginRight: 6 }}>⌨</span>
              단축키
            </div>
            <button onClick={() => setHelpOpen(false)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 20, color: 'var(--clr-text-muted)', padding: 0,
            }}>×</button>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {[
              ['1', '보유 탭'],
              ['2', '관심 탭'],
              ['3', '비중 탭'],
              ['4', '차트 탭'],
              ['5', '트렌드 탭'],
              ['/', '검색창 포커스'],
              ['ESC', '모달 / 시트 닫기'],
              ['?', '이 도움말 보기'],
            ].map(([k, desc]) => (
              <div key={k} style={{ display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 4px', borderBottom: '1px solid var(--clr-border)' }}>
                <Kbd>{k}</Kbd>
                <span className="ko-keep" style={{ fontSize: 13,
                  color: 'var(--clr-text)' }}>{desc}</span>
              </div>
            ))}
          </div>
          <div className="ko-keep" style={{ fontSize: 10.5,
            color: 'var(--clr-text-muted)', marginTop: 12, lineHeight: 1.6 }}>
            입력 칸에 포커스가 있을 때는 단축키가 자동으로 비활성화됩니다.
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Kbd({ children }) {
  return (
    <kbd style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 5,
      background: 'var(--clr-bg)',
      border: '1px solid var(--clr-border-md)',
      borderBottom: '2px solid var(--clr-border-strong)',
      fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
      fontSize: 11, fontWeight: 700, color: 'var(--clr-text-strong)',
      minWidth: 28, textAlign: 'center',
    }}>{children}</kbd>
  )
}

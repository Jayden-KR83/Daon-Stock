import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import changelog from '../changelog.json'

const LS_KEY = 'daon_last_seen_version'

/**
 * Changelog 인앱 공지 모달.
 * - 새 버전이 localStorage에 미저장이면 자동 1회 표시
 * - "다시 보지 않기" 후 ManageTab에서 수동 열기 가능
 */
export default function ChangelogModal({ forceOpen = false, onClose }) {
  const [open, setOpen] = useState(false)
  const latest = changelog[0]

  useEffect(() => {
    if (forceOpen) { setOpen(true); return }
    const lastSeen = localStorage.getItem(LS_KEY)
    // sentinel: 'dismissed' 또는 v9xx로 시작하면 영구 dismiss (테스트·CI용)
    if (lastSeen === 'dismissed' || (lastSeen && /^v9\d/.test(lastSeen))) return
    if (lastSeen !== latest.version) setOpen(true)
  }, [forceOpen, latest.version])

  function close() {
    localStorage.setItem(LS_KEY, latest.version)
    setOpen(false)
    onClose?.()
  }

  if (!open) return null

  const typeColors = {
    feature: { bg: 'var(--clr-info-bg)', fg: 'var(--clr-info-dark)', label: '신규' },
    fix:     { bg: 'var(--clr-pos-bg-soft)', fg: 'var(--clr-pos-darker)', label: '개선' },
    infra:   { bg: '#F3E8FF', fg: '#7E22CE', label: '시스템' },
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={close}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, backdropFilter: 'blur(4px)',
        }}
      >
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--clr-surface)', borderRadius: 4,
            padding: 22, width: '100%', maxWidth: 520,
            maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 24px 56px rgba(15,23,42,.28)',
            border: '1px solid var(--clr-border-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="emoji-mute" style={{ fontSize: 18 }}>✨</span>
                <span style={{ fontSize: 18, fontWeight: 900,
                  color: 'var(--clr-text-strong)', letterSpacing: '-.02em' }}>
                  다온 {latest.version}
                </span>
                <span style={{ padding: '2px 8px', borderRadius: 6,
                  background: 'var(--clr-info)', color: '#fff',
                  fontSize: 10, fontWeight: 800, letterSpacing: '.04em' }}>NEW</span>
              </div>
              <div className="ko-keep" style={{ fontSize: 12,
                color: 'var(--clr-text-muted)', marginTop: 2 }}>
                {latest.date} · {latest.title}
              </div>
            </div>
            <button onClick={close} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, color: 'var(--clr-text-muted)',
              lineHeight: 1, padding: 4,
            }}>×</button>
          </div>

          {/* 최신 버전 변경 사항 */}
          <div style={{ marginBottom: 16 }}>
            {latest.items.map((it, i) => {
              const c = typeColors[it.type] || typeColors.feature
              return (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 0',
                    borderBottom: i < latest.items.length - 1 ? '1px solid var(--clr-border)' : 'none',
                  }}>
                  <span style={{ padding: '2px 7px', borderRadius: 5,
                    fontSize: 9, fontWeight: 800, background: c.bg, color: c.fg,
                    letterSpacing: '.04em', whiteSpace: 'nowrap', flexShrink: 0,
                    marginTop: 1 }}>{c.label}</span>
                  <span className="ko-keep" style={{ fontSize: 12.5,
                    color: 'var(--clr-text)', lineHeight: 1.6 }}>{it.text}</span>
                </motion.div>
              )
            })}
          </div>

          {/* 이전 버전 (접힘) */}
          {changelog.length > 1 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11,
                color: 'var(--clr-text-muted)', fontWeight: 700,
                padding: '6px 0' }}>
                이전 업데이트 ({changelog.length - 1}건) 펼치기
              </summary>
              {changelog.slice(1).map(v => (
                <div key={v.version} style={{ marginTop: 10,
                  padding: 10, background: 'var(--clr-bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800,
                    color: 'var(--clr-text-strong)' }}>
                    {v.version} <span style={{ fontSize: 10, color: 'var(--clr-text-muted)',
                      fontWeight: 500 }}>· {v.date} · {v.title}</span>
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {v.items.map((it, i) => (
                      <li key={i} className="ko-keep" style={{ fontSize: 11.5,
                        color: 'var(--clr-text-sub)', lineHeight: 1.6 }}>{it.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          )}

          <button onClick={close} style={{
            width: '100%', marginTop: 16, padding: '11px',
            background: 'var(--clr-info)', color: '#fff',
            border: 'none', borderRadius: 4,
            fontSize: 13, fontWeight: 800, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            확인 (다시 표시 안 함)
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { getNote, upsertNote } from '../api'

/**
 * 종목별 메모 / 손절가 / 목표가 시트.
 * - 보유 종목 카드의 메모 아이콘을 누르면 열림 (모달 형식)
 * - 매수 이유·손절 라인·회고를 자유 텍스트로 저장
 * - 저장 시 자동 호출 onSaved() — 부모가 메모 목록 갱신
 */
export default function NoteSheet({ ticker, name, isUs, onClose, onSaved }) {
  const [note, setNote] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(0)

  useEffect(() => {
    let aborted = false
    setLoading(true)
    getNote(ticker)
      .then(d => {
        if (aborted) return
        setNote(d.note || '')
        setStopLoss(d.stop_loss != null ? String(d.stop_loss) : '')
        setTarget(d.target != null ? String(d.target) : '')
        setUpdatedAt(d.updated_at || 0)
      })
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [ticker])

  async function handleSave() {
    setSaving(true)
    try {
      await upsertNote(ticker, {
        note: note.trim(),
        stop_loss: stopLoss === '' ? null : parseFloat(stopLoss),
        target:    target   === '' ? null : parseFloat(target),
      })
      onSaved?.()
      onClose?.()
    } catch (e) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  const curSym = isUs ? '$' : '₩'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, backdropFilter: 'blur(4px)',
        }}
      >
        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--clr-surface)', borderRadius: 4,
            padding: 20, width: '100%', maxWidth: 460,
            border: '1px solid var(--clr-border-md)',
            boxShadow: '0 20px 50px rgba(15,23,42,.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--clr-text-strong)',
                letterSpacing: '-.02em' }}>
                <span className="emoji-mute" style={{ marginRight: 6 }}>📝</span>
                {ticker} 투자 노트
              </div>
              {name && (
                <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 2 }}>
                  {name}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 20, color: 'var(--clr-text-muted)', lineHeight: 1, padding: 4,
            }}>×</button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 30,
              color: 'var(--clr-text-muted)', fontSize: 12 }}>불러오는 중…</div>
          ) : (
            <>
              {/* 메모 텍스트 */}
              <label style={lblStyle}>매수 이유 · 회고 · 메모</label>
              <textarea
                value={note} onChange={e => setNote(e.target.value)}
                className="input ko-keep"
                placeholder="예) 2026년 5월 매수 — AI 인프라 수요 급증, 백로그 5억$ 증가 ..."
                rows={6}
                style={{
                  width: '100%', resize: 'vertical', minHeight: 100,
                  fontFamily: 'inherit', lineHeight: 1.6,
                  fontSize: 13, padding: 10,
                }}
                maxLength={2000}
              />
              <div style={{ fontSize: 9.5, color: 'var(--clr-text-muted)',
                textAlign: 'right', marginTop: 2 }}>
                {note.length} / 2000
              </div>

              {/* 손절가 + 목표가 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 10, marginTop: 12 }}>
                <div>
                  <label style={lblStyle}>
                    <span style={{ color: 'var(--clr-neg-dark)' }}>▼</span> 손절가
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={curSymStyle}>{curSym}</span>
                    <input
                      type="number" step="any"
                      value={stopLoss}
                      onChange={e => setStopLoss(e.target.value)}
                      placeholder="0"
                      className="input"
                      style={{ paddingLeft: 26, fontFamily: 'inherit',
                        fontVariantNumeric: 'tabular-nums' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={lblStyle}>
                    <span style={{ color: 'var(--clr-pos-dark)' }}>▲</span> 목표가
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={curSymStyle}>{curSym}</span>
                    <input
                      type="number" step="any"
                      value={target}
                      onChange={e => setTarget(e.target.value)}
                      placeholder="0"
                      className="input"
                      style={{ paddingLeft: 26, fontFamily: 'inherit',
                        fontVariantNumeric: 'tabular-nums' }}
                    />
                  </div>
                </div>
              </div>

              {updatedAt > 0 && (
                <div style={{ fontSize: 10, color: 'var(--clr-text-muted)',
                  marginTop: 10, textAlign: 'right' }}>
                  마지막 저장: {new Date(updatedAt * 1000).toLocaleString('ko-KR',
                    { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleSave} disabled={saving}
                  className="btn-primary" style={{ flex: 1 }}>
                  {saving ? '저장 중…' : '저장'}
                </button>
                <button onClick={onClose} className="btn-secondary">
                  취소
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const lblStyle = { display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--clr-text-sub)', letterSpacing: '.04em',
  textTransform: 'uppercase', marginBottom: 6 }
const curSymStyle = { position: 'absolute', left: 10, top: '50%',
  transform: 'translateY(-50%)', color: 'var(--clr-text-muted)',
  fontSize: 13, fontWeight: 700, pointerEvents: 'none' }

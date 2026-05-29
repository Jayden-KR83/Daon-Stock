import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { listAlerts, upsertAlert, deleteAlert } from '../api'

function BodyPortal({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

/**
 * 종목별 목표가·손절가 설정 시트 — A안 무채색 + 직사각형.
 * ChartTab에서 종목 진입 후 호출.
 */
export default function AlertSetSheet({ ticker, name, currentPrice, isUs, onClose }) {
  const qc = useQueryClient()
  const [high, setHigh]       = useState('')
  const [low, setLow]         = useState('')
  const [enabled, setEnabled] = useState(true)
  const [existing, setExisting] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 기존 등록 알림 로드
  useEffect(() => {
    let aborted = false
    listAlerts().then(r => {
      if (aborted) return
      const found = (r.alerts || []).find(a => a.ticker === ticker)
      if (found) {
        setExisting(found)
        setHigh(found.target_high != null ? String(found.target_high) : '')
        setLow(found.target_low != null ? String(found.target_low) : '')
        setEnabled(!!found.enabled)
      }
    }).catch(() => {})
    return () => { aborted = true }
  }, [ticker])

  async function onSave() {
    setErr('')
    const h = high.trim() === '' ? null : Number(high)
    const l = low.trim()  === '' ? null : Number(low)
    if (h == null && l == null) { setErr('목표가 또는 손절가 중 하나는 입력하세요'); return }
    if (h != null && (!isFinite(h) || h <= 0)) { setErr('목표가가 올바르지 않습니다'); return }
    if (l != null && (!isFinite(l) || l <= 0)) { setErr('손절가가 올바르지 않습니다'); return }
    setSaving(true)
    try {
      await upsertAlert({
        ticker, name: name || ticker,
        target_high: h, target_low: l, enabled,
      })
      qc.invalidateQueries({ queryKey: ['alerts'] })
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!existing) return
    setSaving(true)
    try {
      await deleteAlert(existing.id)
      qc.invalidateQueries({ queryKey: ['alerts'] })
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail || '삭제 실패')
    } finally {
      setSaving(false)
    }
  }

  const sym = isUs ? '$' : '₩'

  return (
    <BodyPortal>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)',
          zIndex: 2147483646,
        }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.18, ease: [0.22,0.61,0.36,1] }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(360px, 92vw)',
            background: 'var(--m-surface)', borderRadius: 4,
            border: '1px solid var(--m-outline)',
            padding: '18px 20px',
            boxShadow: '0 12px 32px rgba(15,23,42,.22)',
            zIndex: 2147483647,
            color: 'var(--m-text)',
          }}>
          <div style={{ display: 'flex', alignItems: 'baseline',
            justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="mono-section-title is-accent">가격 알림 설정</div>
            <span style={{ fontSize: 10, color: 'var(--m-text-tertiary)' }}>
              {ticker}
            </span>
          </div>
          <div className="mono-section-sub ko-keep" style={{ marginBottom: 16 }}>
            {name || ticker}
            {currentPrice != null && (
              <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                · 현재가 {sym}{currentPrice}
              </span>
            )}
          </div>

          {/* 목표가 */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800,
              color: 'var(--m-text-tertiary)',
              letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>
              목표가 ▲ — 도달 시 알림
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%',
                transform: 'translateY(-50%)', fontSize: 13,
                color: 'var(--m-text-tertiary)' }}>{sym}</span>
              <input type="number" value={high} step="0.01"
                onChange={e => setHigh(e.target.value)}
                placeholder="설정 안 함"
                className="input"
                style={{ paddingLeft: 22, borderRadius: 2,
                  fontFamily: 'inherit', fontSize: 13,
                  fontVariantNumeric: 'tabular-nums', fontWeight: 700 }} />
            </div>
          </div>

          {/* 손절가 */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800,
              color: 'var(--m-text-tertiary)',
              letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>
              손절가 ▼ — 하회 시 알림
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%',
                transform: 'translateY(-50%)', fontSize: 13,
                color: 'var(--m-text-tertiary)' }}>{sym}</span>
              <input type="number" value={low} step="0.01"
                onChange={e => setLow(e.target.value)}
                placeholder="설정 안 함"
                className="input"
                style={{ paddingLeft: 22, borderRadius: 2,
                  fontFamily: 'inherit', fontSize: 13,
                  fontVariantNumeric: 'tabular-nums', fontWeight: 700 }} />
            </div>
          </div>

          {/* 활성 토글 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled}
              onChange={e => setEnabled(e.target.checked)} />
            <span style={{ fontSize: 11.5, color: 'var(--m-text-secondary)',
              fontWeight: 600 }}>
              활성화 — 비활성 시 가격 도달해도 알림 X
            </span>
          </label>

          {err && (
            <div style={{ padding: 8, fontSize: 11, borderRadius: 2,
              border: '1px solid var(--m-negative)',
              color: 'var(--m-negative)', marginTop: 4, marginBottom: 8 }}>
              {err}
            </div>
          )}

          <div className="ko-keep" style={{ fontSize: 10,
            color: 'var(--m-text-tertiary)', lineHeight: 1.55, marginBottom: 14 }}>
            서버 cron이 약 5분 간격으로 가격 체크 · 도달 시 알림 벨에 표시
            · 24h 동안 같은 알림 재발화 없음
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onSave} disabled={saving}
              style={{
                flex: 1, padding: '10px', borderRadius: 2, border: 'none',
                background: 'var(--m-text)', color: 'var(--m-surface)',
                fontSize: 12, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: saving ? 0.5 : 1,
              }}>
              {saving ? '저장 중…' : (existing ? '저장' : '알림 추가')}
            </button>
            {existing && (
              <button onClick={onDelete} disabled={saving}
                style={{
                  padding: '10px 14px', borderRadius: 2,
                  background: 'transparent',
                  border: '1px solid var(--m-negative)',
                  color: 'var(--m-negative)',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>삭제</button>
            )}
            <button onClick={onClose}
              style={{
                padding: '10px 14px', borderRadius: 2,
                background: 'transparent',
                border: '1px solid var(--m-outline-variant)',
                color: 'var(--m-text-secondary)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>취소</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </BodyPortal>
  )
}

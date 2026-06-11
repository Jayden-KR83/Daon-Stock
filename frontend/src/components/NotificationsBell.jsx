import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  listNotifications, markNotificationRead, markAllNotificationsRead,
  listAlerts, deleteAlert,
} from '../api'
import { pushSupported, getPushState, enablePush, disablePush } from '../pushClient'
import { sendTestPush } from '../api'
import { useStore } from '../store'

/* 시트 / 오버레이를 body 직속으로 portal — 부모 transform/overflow/z-index에 영향받지 않음 */
function BodyPortal({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

/**
 * 상단바에 표시되는 알림 벨 + 클릭 시 시트.
 * 미확인 카운트 뱃지, 알림 목록, 알림 설정 관리 통합.
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('notif')  // 'notif' | 'rules'
  const [push, setPush] = useState('off')  // 'unsupported'|'denied'|'on'|'off'
  const [pushBusy, setPushBusy] = useState(false)
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)

  const { data: notif } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications(false, 50),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: listAlerts,
    staleTime: 60_000,
    enabled: open,
  })

  const unread = notif?.unread_count || 0

  // ESC 키로 시트 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // 시트 열릴 때 현재 푸시 구독 상태 조회
  useEffect(() => {
    if (!open) return
    let alive = true
    getPushState().then(s => { if (alive) setPush(s) })
    return () => { alive = false }
  }, [open])

  async function onTogglePush() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush())
    } catch (e) {
      setPush(e?.message === 'denied' ? 'denied' : await getPushState())
    } finally {
      setPushBusy(false)
    }
  }

  async function onTestPush() {
    if (pushBusy) return
    setPushBusy(true)
    try { await sendTestPush() } catch {}
    finally { setPushBusy(false) }
  }

  async function onItemClick(n) {
    if (!n.read_at) {
      try { await markNotificationRead(n.id) } catch {}
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    if (n.ticker) {
      setChartTicker(n.ticker)
      setOpen(false)
    }
  }
  async function onReadAll() {
    try { await markAllNotificationsRead() } catch {}
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  async function onDeleteAlert(id) {
    try { await deleteAlert(id) } catch {}
    qc.invalidateQueries({ queryKey: ['alerts'] })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`알림 ${unread > 0 ? `(미확인 ${unread})` : ''}`}
        aria-label="알림"
        style={{
          position: 'relative',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32,
          background: 'transparent', border: '1px solid var(--m-outline-variant)',
          borderRadius: 2, color: 'var(--m-text-secondary)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: 'var(--m-negative)', color: '#fff',
            fontSize: 9, fontWeight: 900, minWidth: 14, height: 14,
            padding: '0 3px', borderRadius: 7,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <BodyPortal>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)',
                zIndex: 2147483646,
              }} />
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18, ease: [0.22,0.61,0.36,1] }}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(380px, 100vw)',
                background: 'var(--m-surface)',
                zIndex: 2147483647,
                borderLeft: '1px solid var(--m-outline)',
                boxShadow: '-8px 0 24px rgba(15,23,42,.18)',
                display: 'flex', flexDirection: 'column',
                color: 'var(--m-text)',
              }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid var(--m-outline-variant)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--m-text)' }}>
                  알림 {unread > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11,
                      color: 'var(--m-negative)', fontWeight: 800 }}>
                      · 미확인 {unread}
                    </span>
                  )}
                </div>
                <button onClick={() => setOpen(false)} style={{
                  background: 'transparent', border: '1px solid var(--m-outline-variant)',
                  borderRadius: 2, padding: '4px 10px', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                  color: 'var(--m-text-secondary)',
                }}>닫기</button>
              </div>

              {/* Web Push 토글 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                borderBottom: '1px solid var(--m-outline-variant)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--m-text)' }}>
                    푸시 알림
                  </div>
                  <div className="ko-keep" style={{ fontSize: 10, marginTop: 2,
                    color: 'var(--m-text-tertiary)', lineHeight: 1.5 }}>
                    {push === 'unsupported'
                      ? '이 브라우저는 미지원 · iOS는 홈 화면에 추가 후 사용 가능'
                      : push === 'denied'
                      ? '브라우저 설정에서 알림 권한이 차단됨 — 권한 허용 후 다시 시도'
                      : push === 'on'
                      ? '앱을 닫아도 목표가·손절가 도달 시 알림이 도착합니다'
                      : '켜면 앱을 닫아도 알림을 받습니다'}
                  </div>
                </div>
                {push === 'on' && (
                  <button onClick={onTestPush} disabled={pushBusy} style={{
                    flexShrink: 0, padding: '5px 10px', borderRadius: 2,
                    background: 'transparent', border: '1px solid var(--m-outline-variant)',
                    color: 'var(--m-text-secondary)', fontSize: 11, fontWeight: 700,
                    cursor: pushBusy ? 'default' : 'pointer',
                    opacity: pushBusy ? 0.5 : 1, fontFamily: 'inherit',
                  }}>테스트</button>
                )}
                {(push === 'on' || push === 'off') && (
                  <button onClick={onTogglePush} disabled={pushBusy} style={{
                    flexShrink: 0, padding: '5px 12px', borderRadius: 2,
                    background: push === 'on' ? 'transparent' : 'var(--m-text)',
                    border: `1px solid ${push === 'on' ? 'var(--m-outline-variant)' : 'var(--m-text)'}`,
                    color: push === 'on' ? 'var(--m-text-secondary)' : 'var(--m-surface)',
                    fontSize: 11, fontWeight: 800,
                    cursor: pushBusy ? 'default' : 'pointer',
                    opacity: pushBusy ? 0.5 : 1, fontFamily: 'inherit',
                  }}>{pushBusy ? '...' : push === 'on' ? '끄기' : '켜기'}</button>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', padding: '8px 12px', gap: 6,
                borderBottom: '1px solid var(--m-outline-variant)' }}>
                {[
                  ['notif', `알림 (${notif?.notifications?.length || 0})`],
                  ['rules', `설정 (${alerts?.alerts?.length || 0})`],
                ].map(([v, label]) => (
                  <button key={v} onClick={() => setTab(v)} style={{
                    padding: '4px 12px', borderRadius: 2,
                    background: tab === v ? 'var(--m-text)' : 'transparent',
                    border: `1px solid ${tab === v ? 'var(--m-text)' : 'var(--m-outline-variant)'}`,
                    color: tab === v ? 'var(--m-surface)' : 'var(--m-text-secondary)',
                    fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{label}</button>
                ))}
                {tab === 'notif' && unread > 0 && (
                  <button onClick={onReadAll} style={{
                    marginLeft: 'auto', padding: '4px 10px', borderRadius: 2,
                    background: 'transparent',
                    border: '1px solid var(--m-outline-variant)',
                    color: 'var(--m-text-secondary)',
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>모두 읽음</button>
                )}
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px',
                background: 'var(--m-surface)', minHeight: 0 }}>
                {tab === 'notif' && (
                  (notif?.notifications?.length || 0) === 0 ? (
                    <EmptyState title="알림 없음"
                      desc="설정에서 종목별 목표가/손절가를 등록하면, 도달 시 알림이 표시됩니다." />
                  ) : (
                    notif.notifications.map(n => (
                      <div key={n.id} onClick={() => onItemClick(n)}
                        style={{
                          padding: '10px 12px', margin: '6px 0', borderRadius: 2,
                          border: `1px solid ${!n.read_at ? 'var(--m-text)' : 'var(--m-outline-variant)'}`,
                          background: !n.read_at ? 'var(--m-surface-variant)' : 'transparent',
                          cursor: 'pointer',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'baseline',
                          justifyContent: 'space-between', gap: 8 }}>
                          <span className={n.kind === 'high' ? 'sev-label is-critical'
                                              : n.kind === 'low' ? 'sev-label is-high'
                                              : 'sev-label is-med'}>
                            {n.kind === 'high' ? '목표가' : n.kind === 'low' ? '손절가' : '안내'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--m-text-tertiary)' }}>
                            {fmtRelTime(n.created_at)}
                          </span>
                        </div>
                        <div className="ko-keep" style={{ fontSize: 12.5, fontWeight: 700,
                          color: 'var(--m-text)', marginTop: 4 }}>
                          {n.message}
                        </div>
                      </div>
                    ))
                  )
                )}

                {tab === 'rules' && (
                  (alerts?.alerts?.length || 0) === 0 ? (
                    <EmptyState title="등록된 알림 없음"
                      desc="종목 상세(차트 탭)에서 목표가/손절가를 등록할 수 있습니다." />
                  ) : (
                    alerts.alerts.map(a => (
                      <div key={a.id} style={{
                        padding: '10px 12px', margin: '6px 0', borderRadius: 2,
                        border: '1px solid var(--m-outline-variant)',
                        display: 'flex', alignItems: 'baseline', gap: 10,
                      }}>
                        <div onClick={() => { setChartTicker(a.ticker); setOpen(false) }}
                          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800,
                            color: 'var(--m-text)' }}>
                            {a.name || a.ticker}
                            <span style={{ fontSize: 10, fontWeight: 600,
                              color: 'var(--m-text-tertiary)', marginLeft: 6 }}>{a.ticker}</span>
                          </div>
                          <div style={{ fontSize: 10.5, marginTop: 3,
                            color: 'var(--m-text-secondary)',
                            fontVariantNumeric: 'tabular-nums' }}>
                            {a.target_high != null && (
                              <span style={{ marginRight: 12 }}>
                                ▲ <strong className="num-pos">{a.target_high}</strong>
                              </span>
                            )}
                            {a.target_low != null && (
                              <span>▼ <strong className="num-neg">{a.target_low}</strong></span>
                            )}
                            {!a.enabled && (
                              <span className="mono-pill" style={{ marginLeft: 8 }}>OFF</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => onDeleteAlert(a.id)}
                          title="삭제"
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--m-outline-variant)',
                            color: 'var(--m-text-tertiary)',
                            borderRadius: 2, padding: '4px 8px',
                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            fontFamily: 'inherit', flexShrink: 0,
                          }}>삭제</button>
                      </div>
                    ))
                  )
                )}
              </div>
            </motion.div>
          </BodyPortal>
        )}
      </AnimatePresence>
    </>
  )
}

function EmptyState({ title, desc }) {
  return (
    <div className="ko-keep" style={{ padding: '40px 16px', textAlign: 'center',
      color: 'var(--m-text-tertiary)' }}>
      <div style={{ fontSize: 13, fontWeight: 800,
        color: 'var(--m-text-secondary)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.7 }}>{desc}</div>
    </div>
  )
}

function fmtRelTime(epochSec) {
  if (!epochSec) return ''
  const diff = Date.now() / 1000 - epochSec
  if (diff < 60)        return '방금 전'
  if (diff < 3600)      return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  const d = new Date(epochSec * 1000)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

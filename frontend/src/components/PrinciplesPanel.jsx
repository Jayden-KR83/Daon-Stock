import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listPrinciples, addPrinciple, deletePrinciple, distillPrinciples,
         approvePrinciple } from '../api'

/**
 * 투자 원칙 — 대화에서 나온 것이므로 대화와 같은 자리에 둔다(2026-10-11 오너 결정).
 *
 * 왜 접어 두나: 평소에는 대화가 주인공이다. 원칙은 "지금 비서가 무엇을 전제로
 * 말하는가"가 궁금할 때 펼쳐 보는 것이지, 매번 읽는 목록이 아니다.
 *
 * 왜 지울 수 있어야 하나: AI 가 뽑은 원칙이 틀렸는데 지울 수 없으면
 * 그 한 줄이 **모든 답변을 조용히 오염시킨다**. 삭제가 기능의 일부다.
 *
 * design.md: 컬러 이모지 금지 → SVG 라인 아이콘(1.5px). R1 플랫 카드.
 */
const Ico = ({ d, size = 13 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    {d}
  </svg>
)
const IconCompass = <Ico d={<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.1 5-5 2.1 2.1-5z" /></>} />
const IconSpark   = <Ico d={<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />} />
const IconPlus    = <Ico d={<><path d="M12 5v14M5 12h14" /></>} />
const IconTrash   = <Ico d={<><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>} size={12} />
const IconCheck   = <Ico d={<path d="m4 12 5 5L20 6" />} size={12} />

export default function PrinciplesPanel() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  /* 접혀 있어도 조회한다 — 펼쳐야만 알 수 있는 알림은 알림이 아니다.
     DB 읽기뿐이라 가볍고, 유료 호출(distill)은 오너가 누를 때만 일어난다. */
  const { data } = useQuery({
    queryKey: ['principles'], queryFn: listPrinciples, staleTime: 5 * 60_000,
  })
  const list    = data?.principles || []
  const pending = data?.pending || []
  const due     = !!data?.due
  const reload = () => qc.invalidateQueries({ queryKey: ['principles'] })

  async function run(fn, done) {
    setBusy(true); setMsg('')
    try { const r = await fn(); done?.(r) } catch (e) {
      setMsg(e?.response?.data?.detail || '처리하지 못했습니다')
    } finally { setBusy(false); reload() }
  }

  return (
    <div className="chat-principles">
      <button className="chat-principles-toggle" onClick={() => setOpen(v => !v)}
        aria-expanded={open}>
        <span className="cp-ico">{IconCompass}</span>
        <span>내 투자 원칙</span>
        {list.length > 0 && <span className="cp-count">{list.length}</span>}
        {/* 확인할 것이 있을 때만 점을 띄운다. 늘 떠 있는 표시는 곧 안 보이게 된다. */}
        {(pending.length > 0 || due) && (
          <span className="cp-dot" title={pending.length ? '확인할 제안이 있습니다'
                                                         : '원칙을 정리할 때가 됐습니다'} />
        )}
        <span className="cp-caret">{open ? '접기' : '펼치기'}</span>
      </button>

      {open && (
        <div className="chat-principles-body">
          <div className="cp-lead">
            비서가 이 기준을 깔고 말합니다. 어긋나는 제안을 할 땐 이유를 먼저 밝힙니다.
          </div>

          {pending.length > 0 && (
            <div className="cp-pending">
              <div className="cp-pending-head">
                확인해 주세요 — 대화에서 뽑은 제안 {pending.length}건
              </div>
              <div className="cp-pending-lead">
                승인하기 전까지는 비서가 이 문장을 쓰지 않습니다.
              </div>
              {pending.map(p => (
                <div key={p.id} className="cp-item is-pending">
                  <div className="cp-item-main">
                    <div className="cp-item-text">{p.text}</div>
                    {p.evidence && <div className="cp-item-src">{p.evidence}</div>}
                  </div>
                  <button className="cp-approve" disabled={busy} title="원칙으로 승인"
                    onClick={() => run(() => approvePrinciple(p.id))}>
                    {IconCheck}<span>승인</span>
                  </button>
                  <button className="cp-del" title="버리기" aria-label="제안 버리기"
                    onClick={() => run(() => deletePrinciple(p.id))}>{IconTrash}</button>
                </div>
              ))}
            </div>
          )}

          {due && pending.length === 0 && (
            <div className="cp-due">
              지난 정리 이후 대화가 {data?.new_turns}턴 쌓였습니다 — 아래에서 다시 뽑아볼 때입니다.
            </div>
          )}

          {list.length === 0 && pending.length === 0 && (
            <div className="cp-empty">
              아직 없습니다. 직접 적거나, 대화가 쌓인 뒤 아래에서 뽑아낼 수 있습니다.
            </div>
          )}

          {list.map(p => (
            <div key={p.id} className="cp-item">
              <div className="cp-item-main">
                <div className="cp-item-text">{p.text}</div>
                {p.evidence && <div className="cp-item-src">{p.evidence}</div>}
              </div>
              <span className={`cp-tag ${p.source === 'owner' ? 'is-own' : ''}`}>
                {p.source === 'owner' ? '내가 씀' : '대화에서'}
              </span>
              <button className="cp-del" title="삭제" aria-label="원칙 삭제"
                onClick={() => run(() => deletePrinciple(p.id))}>{IconTrash}</button>
            </div>
          ))}

          <div className="cp-add">
            <input value={draft} maxLength={300} disabled={busy}
              placeholder="예) 반도체 비중이 35%를 넘으면 더 사지 않는다"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && draft.trim()) {
                  run(() => addPrinciple(draft.trim()), () => setDraft(''))
                }
              }} />
            <button className="cp-btn" disabled={busy || !draft.trim()}
              onClick={() => run(() => addPrinciple(draft.trim()), () => setDraft(''))}>
              {IconPlus}<span>추가</span>
            </button>
          </div>

          <button className="cp-distill" disabled={busy}
            onClick={() => run(distillPrinciples, (r) => {
              if (r?.ok) setMsg(r.added?.length
                ? `${r.added.length}개를 제안했습니다 — 확인하고 승인하세요`
                : '새로 뽑을 만한 것이 없었습니다')
              else if (r?.reason === 'not_enough') setMsg(`대화가 ${r.need}턴은 쌓여야 뽑을 수 있습니다`)
              else setMsg('지금은 뽑지 못했습니다')
            })}>
            {IconSpark}<span>{busy ? '읽는 중…' : '대화에서 찾아보기'}</span>
          </button>

          {msg && <div className="cp-msg">{msg}</div>}
        </div>
      )}
    </div>
  )
}

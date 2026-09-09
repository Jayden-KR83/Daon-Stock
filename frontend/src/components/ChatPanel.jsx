import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { maskText } from '../utils/privacy'
import { chatHistory, chatClear, chatSend } from '../api'
import { ReportBullets } from './report'
import { splitAnswer } from '../utils/answerText'
import AnswerActions from './AnswerActions'

/* ══════════════════════════════════════════════════════════════════════
   다온 채팅 — 보던 화면의 맥락 그대로 묻는다
   ══════════════════════════════════════════════════════════════════════
   왜 앱 안에 두는가: 분석을 보다 궁금한 게 생기면 결국 외부 챗봇으로 나가는데,
   거기서는 ① 포트폴리오를 매번 말로 설명해야 하고 ② 대화가 사라져 지식이 안 쌓인다.
   여기서는 보유·비중·지금 보던 리포트가 이미 서버에서 프롬프트에 실린다.

   ⚠ 답변에는 금액이 그대로 들어온다. 가림 모드면 maskText 를 반드시 통과시킨다.
     이걸 빼면 발표 중에 채팅을 여는 순간 자산이 다시 노출된다(2026-08-27 사고 경로).

   레이아웃: 웹 모드는 우측 패널, 앱 모드는 하단 시트.
   같은 컴포넌트를 쓰고 CSS 로만 갈라 놓는다 — 두 벌로 만들면 한쪽만 고쳐진다.
   ══════════════════════════════════════════════════════════════════════ */

const SCOPE_LABEL = (scope) => {
  if (scope === 'strategy') return '전략 리포트'
  if (String(scope).startsWith('stock:')) return String(scope).slice(6)
  return '내 포트폴리오'
}

/* 첫 화면의 마중물. 무엇을 물어도 되는지 모르면 아무것도 못 묻는다.
   "앱이 계산한 숫자를 해석해 달라"는 이 도구의 성격을 예시로 보여준다. */
const SUGGESTIONS = {
  general: [
    '지금 내 포트폴리오에서 가장 큰 위험은 뭔가요?',
    '반도체 비중이 높은 편인가요? 왜 그렇게 판단하나요?',
    '환율이 10% 떨어지면 내 자산에 어떤 영향이 있나요?',
  ],
  strategy: [
    '이 리포트에서 가장 먼저 손봐야 할 건 뭔가요?',
    '추천 액션 중 지금 당장 안 해도 되는 건?',
    '이 진단이 놓치고 있는 관점이 있을까요?',
  ],
  stock: [
    '이 회사는 결국 어떻게 돈을 버나요?',
    '이 분석에서 가장 약한 근거는 뭔가요?',
    '10년 뒤에도 유효할 강점은 무엇인가요?',
  ],
}

export default function ChatPanel() {
  const open        = useStore(s => s.chatOpen)
  const scope       = useStore(s => s.chatScope)
  const closeChat   = useStore(s => s.closeChat)
  const privacyMode = useStore(s => s.privacyMode)

  const [msgs, setMsgs]       = useState([])
  const [input, setInput]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [stream, setStream]   = useState('')
  const [err, setErr]         = useState('')
  const [useSearch, setUseSearch] = useState(false)
  const [quota, setQuota]     = useState(null)
  const [truncated, setTruncated] = useState(false)
  const abortRef = useRef(null)
  const endRef   = useRef(null)

  // 맥락이 바뀌면 그 맥락의 대화를 불러온다
  useEffect(() => {
    if (!open) return
    let alive = true
    setErr(''); setStream('')
    chatHistory(scope)
      .then(d => { if (alive) { setMsgs(d.messages || []); setQuota(d.quota || null) } })
      .catch(() => { if (alive) setMsgs([]) })
    return () => { alive = false }
  }, [open, scope])

  // 새 내용이 붙으면 아래로
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs, stream])

  // 패널을 닫거나 화면을 떠나면 진행 중인 스트림을 끊는다(요금이 새지 않게)
  useEffect(() => () => abortRef.current?.(), [])
  useEffect(() => { if (!open) abortRef.current?.() }, [open])

  const send = (text) => {
    const q = String(text ?? input).trim()
    if (!q || busy) return
    setErr('')
    setInput('')
    setMsgs(m => [...m, { role: 'user', content: q }])
    setTruncated(false)
    setBusy(true)
    setStream('')
    let acc = ''
    abortRef.current = chatSend({
      message: q, scope, useSearch,
      onDelta: (t) => { acc += t; setStream(acc) },
      onDone: (info) => {
        setBusy(false)
        setStream('')
        if (acc) setMsgs(m => [...m, { role: 'assistant', content: acc }])
        if (info) setQuota({ used: info.used, limit: info.limit })
        // 길이 상한에 걸려 끊긴 답을 '완성된 답'처럼 보여주지 않는다.
        // 사용자가 잘린 줄 모르고 그대로 믿는 것이 가장 나쁜 결과다.
        setTruncated(!!info?.truncated)
      },
      onError: (m) => {
        setBusy(false)
        setStream('')
        setErr(m)
        // 실패한 질문은 되돌려 준다 — 다시 타이핑하게 만들지 않는다
        setInput(q)
        setMsgs(prev => prev.slice(0, -1))
      },
    })
  }

  if (!open) return null

  const kind = scope === 'strategy' ? 'strategy'
             : String(scope).startsWith('stock:') ? 'stock' : 'general'
  const show = (t) => maskText(t, privacyMode)

  return (
    <div className="chat-root" role="dialog" aria-label="다온 채팅">
      <div className="chat-head">
        <div style={{ minWidth: 0 }}>
          <div className="chat-title">다온에게 묻기</div>
          <div className="chat-sub">
            {SCOPE_LABEL(scope)} 맥락
            {quota && <> · 이번 달 {quota.used}/{quota.limit}</>}
          </div>
        </div>
        <button className="chat-x tap-target" onClick={closeChat} aria-label="닫기">✕</button>
      </div>

      <div className="chat-body">
        {msgs.length === 0 && !stream && (
          <div className="chat-empty">
            <div className="chat-empty-lead">
              지금 보고 있는 {SCOPE_LABEL(scope)} 내용을 그대로 알고 있습니다.
              설명 없이 바로 물어보세요.
            </div>
            {SUGGESTIONS[kind].map(s => (
              <button key={s} className="chat-suggest" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant'
              ? <>
                  <ReportBullets items={splitAnswer(show(m.content))} small />
                  {/* 답변 원문을 넘긴다 — 노트는 내 것이므로 가림을 적용하지 않는다.
                      화면에 그리는 것만 show() 를 거친다. */}
                  <AnswerActions
                    scope={scope}
                    question={msgs[i - 1]?.role === 'user' ? msgs[i - 1].content : ''}
                    answer={m.content}
                    masked={privacyMode}
                  />
                </>
              : <div className="ko-keep">{show(m.content)}</div>}
          </div>
        ))}

        {stream && (
          <div className="chat-msg assistant">
            {/* 스트리밍 중에는 아직 **강조**가 닫히지 않을 수 있어 원문 그대로 흘린다.
              완료되면 위 ReportBullets 가 강조·숫자 색을 입혀 다시 그린다. */}
          <div className="ko-keep" style={{ whiteSpace: 'pre-wrap' }}>{show(stream)}</div>
          </div>
        )}
        {truncated && !busy && (
          <div className="chat-trunc ko-keep">
            길이 제한으로 답변이 여기서 끊겼습니다.
            <button className="chat-more" onClick={() => send('이어서 계속 설명해 주세요.')}>
              이어서 받기
            </button>
          </div>
        )}
        {busy && !stream && <div className="chat-typing">생각하는 중…</div>}
        {err && <div className="chat-err ko-keep">{err}</div>}
        <div ref={endRef} />
      </div>

      <div className="chat-foot">
        <label className="chat-search-toggle" title="켜면 답하기 전에 웹을 검색합니다(뉴스·실적 발표 같은 '사건'을 물을 때). 회사 구조나 제 포트폴리오를 묻는 질문에는 필요 없습니다. 검색 1회당 약 14원.">
          <input type="checkbox" checked={useSearch}
            onChange={e => setUseSearch(e.target.checked)} />
          웹에서 최신 정보 찾기
        </label>
        {msgs.length > 0 && (
          <button className="chat-clear" onClick={async () => {
            await chatClear(scope).catch(() => {})
            setMsgs([])
          }}>대화 지우기</button>
        )}
        <div className="chat-input-row">
          <textarea
            className="input chat-input" rows={1} value={input}
            placeholder="궁금한 것을 물어보세요"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              // Enter=전송 / Shift+Enter=줄바꿈. 모바일에서는 항상 줄바꿈이라
              // 전송 버튼이 반드시 있어야 한다.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }} />
          {busy ? (
            <button className="chat-send" onClick={() => { abortRef.current?.(); setBusy(false); setStream('') }}>
              중지
            </button>
          ) : (
            <button className="chat-send btn-primary" onClick={() => send()} disabled={!input.trim()}>
              보내기
            </button>
          )}
        </div>
        <div className="chat-note ko-keep">
          투자 권유가 아닙니다. 숫자는 앱이 계산한 값이며 최종 판단은 본인 몫입니다.
        </div>
      </div>
    </div>
  )
}


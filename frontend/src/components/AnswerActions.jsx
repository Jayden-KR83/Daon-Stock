import React, { useState } from 'react'
import { appendNote } from '../api'

/* ══════════════════════════════════════════════════════════════════════
   답변 갈무리 — 물어본 그 자리에서 남긴다
   ══════════════════════════════════════════════════════════════════════
   채팅의 가치는 답을 듣는 순간이 아니라 나중에 다시 꺼내 볼 때 생긴다.
   그런데 창을 닫고 노트 탭으로 건너가 붙여 넣어야 한다면 아무도 안 한다.
   그래서 답변 바로 아래에 둔다.

   두 갈래로 나눈 이유:
     · 노트에 저장 — 그 종목에 대한 내 판단 기록. 서버(holding_notes)에 남는다.
     · 집현전용 복사 — 종목을 떠나 원리로 남길 만한 것. 마크다운으로 클립보드에
       올려 오너의 볼트에 붙인다. 서버가 볼트에 직접 쓸 수는 없다(로컬 파일).

   ⚠ 저장하는 것은 **가려지지 않은 원문**이다. 화면은 가림 모드라도 노트는
     내 것이므로 원문을 남긴다. 대신 클립보드 복사도 원문이라, 가림 모드로
     발표 중이면 붙여 넣는 곳에 금액이 드러난다 — 그래서 문구로 알린다.
   ══════════════════════════════════════════════════════════════════════ */

const PORTFOLIO_KEY = '_PORTFOLIO'

/** scope('stock:AAPL' | 'strategy' | 'general') → 노트를 붙일 칸 */
export function scopeToNoteKey(scope) {
  const s = String(scope || '')
  return s.startsWith('stock:') ? s.slice(6).toUpperCase() : PORTFOLIO_KEY
}

function scopeLabel(scope) {
  const s = String(scope || '')
  if (s.startsWith('stock:')) return s.slice(6).toUpperCase()
  if (s === 'strategy') return '전략 리포트'
  return '포트폴리오'
}

export default function AnswerActions({ scope, question, answer, masked }) {
  const [state, setState] = useState('')   // '' | saving | saved | copied | error
  const [msg, setMsg] = useState('')

  const noteKey = scopeToNoteKey(scope)

  async function save() {
    setState('saving'); setMsg('')
    try {
      await appendNote(noteKey, {
        text: answer,
        question,
        source: `다온에게 물어봄 · ${scopeLabel(scope)}`,
      })
      setState('saved')
      setMsg(noteKey === PORTFOLIO_KEY
        ? '포트폴리오 노트에 저장했습니다.'
        : `${noteKey} 투자 노트에 저장했습니다.`)
    } catch (e) {
      setState('error')
      setMsg(e?.response?.data?.detail || '저장하지 못했습니다.')
    }
  }

  async function copy() {
    const today = new Date().toISOString().slice(0, 10)
    const md = [
      `# ${question || '다온 질문'}`,
      '',
      `- 날짜: ${today}`,
      `- 맥락: ${scopeLabel(scope)}`,
      '- 출처: 다온 채팅',
      '',
      '## 답변',
      '',
      answer,
      '',
      '## 내 생각',
      '',
      '(여기에 내 판단을 덧붙인다 — 붙여 넣기만 한 노트는 다시 안 읽힌다)',
      '',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(md)
      setState('copied')
      setMsg('마크다운으로 복사했습니다. 집현전에 붙여 넣으세요.')
    } catch {
      setState('error')
      setMsg('복사하지 못했습니다. 답변을 길게 눌러 직접 복사해 주세요.')
    }
  }

  return (
    <div className="answer-actions">
      <button className="answer-act" onClick={save} disabled={state === 'saving'}>
        {state === 'saving' ? '저장 중…' : '노트에 저장'}
      </button>
      <button className="answer-act" onClick={copy}>집현전용 복사</button>
      {msg && (
        <span className={`answer-act-msg ${state === 'error' ? 'is-err' : ''}`}>
          {msg}
        </span>
      )}
      {masked && state === 'copied' && (
        <span className="answer-act-msg is-warn ko-keep">
          가림 모드지만 복사본에는 금액이 그대로 들어 있습니다.
        </span>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import { useStore } from '../store'
import { sendFeedback } from '../api'

/* ══════════════════════════════════════════════════════════════════════
   인앱 피드백 — 불편을 느낀 그 자리에서 보낸다
   ══════════════════════════════════════════════════════════════════════
   지인이 보낸 10건은 전부 맞는 말이었는데 카톡으로 왔다. 앱 밖에서 오면
   ① "어느 화면이요?" 를 되물어야 하고 ② 대부분은 아예 오지 않는다.
   그 왕복 한 번이 피드백을 사라지게 만든다.

   그래서 화면·기기·레이아웃·버전을 자동으로 붙인다. 사용자는 불편만 적는다.

   ⚠ 개인 금액은 절대 담지 않는다. 화면 내용을 캡처하지 않고, 어느 탭이었는지만
     보낸다 — 자산 노출 경로를 새로 만들지 않기 위해서다(2026-08-26 사고).
   ══════════════════════════════════════════════════════════════════════ */

const TAB_NAMES = ['포트폴리오', '관심', '분석', '종목', '시장',
                   '등록', '설정', '가이드', '여정', '관리자', '발굴']

const KINDS = [
  { k: 'bug',  label: '안 돼요',   hint: '눌러도 반응이 없다, 숫자가 이상하다' },
  { k: 'idea', label: '이랬으면',  hint: '이런 기능이 있으면 좋겠다' },
  { k: 'etc',  label: '그 밖에',   hint: '' },
]

export default function FeedbackButton() {
  const activeTab = useStore(s => s.activeTab)
  const theme     = useStore(s => s.theme)
  const layout    = useStore(s => s.layoutMode)
  const [open, setOpen]   = useState(false)
  const [kind, setKind]   = useState('bug')
  const [text, setText]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState(false)
  const [err, setErr]     = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (text.trim().length < 5) return setErr('조금만 더 적어 주세요.')
    setBusy(true)
    try {
      await sendFeedback({
        message: text.trim(),
        kind,
        tab: TAB_NAMES[activeTab] || String(activeTab),
        context: {
          ua: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          layout: layout || '',
          theme: theme || '',
          version: (document.querySelector('meta[name="app-version"]')?.content) || '',
          path: location.pathname,
        },
      })
      setDone(true); setText('')
    } catch (e2) {
      setErr(e2?.response?.data?.detail || '보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  function close() { setOpen(false); setDone(false); setErr('') }

  return (
    <>
      <button className="fb-fab" onClick={() => setOpen(true)}
        title="불편한 점 보내기" aria-label="불편한 점 보내기">
        의견
      </button>

      {open && (
        <div className="fb-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
          <div className="fb-modal" role="dialog" aria-modal="true" aria-label="불편한 점 보내기">
            <div className="fb-head">
              <div className="fb-title">불편한 점을 알려 주세요</div>
              <button className="fb-x" onClick={close} aria-label="닫기">✕</button>
            </div>

            {done ? (
              <div className="fb-body">
                <div className="fb-done ko-keep">
                  보냈습니다. 읽고 반영합니다.
                </div>
                <div className="fb-note ko-keep">
                  어느 화면에서 보냈는지는 자동으로 함께 갔습니다 — 다시 여쭙지 않아도 됩니다.
                </div>
                <div className="fb-foot">
                  <button type="button" className="btn-primary" onClick={close}
                    style={{ width: 'auto', padding: '9px 20px' }}>닫기</button>
                </div>
              </div>
            ) : (
              <form className="fb-body" onSubmit={submit}>
                <div className="fb-kinds">
                  {KINDS.map(o => (
                    <button key={o.k} type="button"
                      className={`fb-kind ${kind === o.k ? 'is-on' : ''}`}
                      onClick={() => setKind(o.k)} title={o.hint}>
                      {o.label}
                    </button>
                  ))}
                </div>

                <textarea className="fb-text" value={text} maxLength={2000}
                  onChange={e => setText(e.target.value)}
                  placeholder={KINDS.find(o => o.k === kind)?.hint
                    || '무엇이 불편했는지 그대로 적어 주세요.'} />

                <div className="fb-note ko-keep">
                  지금 보고 있는 화면({TAB_NAMES[activeTab] || '—'})과 기기 정보가 함께 갑니다.
                  금액이나 보유 내용은 보내지 않습니다.
                </div>

                {err && <div className="fb-err ko-keep">{err}</div>}

                <div className="fb-foot">
                  <span className="fb-count">{text.length}/2000</span>
                  <button type="submit" className="btn-primary" disabled={busy}
                    style={{ width: 'auto', padding: '9px 20px' }}>
                    {busy ? '보내는 중…' : '보내기'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

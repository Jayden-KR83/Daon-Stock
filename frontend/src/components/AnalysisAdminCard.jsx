import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { analysisGap, analysisPrompt, importAiCache } from '../api'

/**
 * 분석 관리 (admin 전용) — 구독으로 분석을 채우는 왕복을 앱 안에서 끝낸다.
 *
 * 왜 반자동인가:
 * 구독(Claude Code)은 이 PC 의 클라이언트에 딸린 것이라 다온 서버가 빌려 쓸 수 없다.
 * 서버가 AI 를 부르려면 API 키가 필요하고 그건 종량제다. 그래서 'AI 를 부르는 한 단계'만
 * 밖에서 하고, 나머지(대상 선정·프롬프트 생성·검증·저장)는 전부 여기서 처리한다.
 *
 * 흐름: 낡은 종목 고르기 → 프롬프트 복사 → 클로드에 붙여넣기 → 결과 붙여넣기 → 저장
 */
export default function AnalysisAdminCard() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['analysis-gap'], queryFn: analysisGap })

  const [sel, setSel] = useState(null)      // 선택한 종목
  const [prompt, setPrompt] = useState('')
  const [pasted, setPasted] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = data?.holdings || []
  const stale = rows.filter(r => r.age_days === null || r.age_days >= 14)

  async function pickTicker(r) {
    setSel(r); setPrompt(''); setPasted(''); setMsg(null); setBusy(true)
    try {
      const res = await analysisPrompt(r.ticker, r.name)
      setPrompt(res.prompt)
    } catch (e) {
      setMsg({ type: 'err', text: e?.response?.data?.detail || '프롬프트를 만들지 못했습니다.' })
    } finally { setBusy(false) }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setMsg({ type: 'ok', text: '복사했습니다. 클로드에 붙여넣고, 받은 JSON을 아래 칸에 붙여넣으세요.' })
    } catch {
      setMsg({ type: 'err', text: '복사가 막혔습니다. 아래 상자에서 직접 선택해 복사하세요.' })
    }
  }

  async function save() {
    setBusy(true); setMsg(null)
    let parsed
    try {
      parsed = JSON.parse(pasted)
    } catch {
      setMsg({ type: 'err', text: 'JSON 형식이 아닙니다. 클로드 답변에서 { 로 시작해 } 로 끝나는 부분만 붙여넣으세요.' })
      setBusy(false); return
    }
    // 클로드가 { ticker, name, data } 형태로 줄 수도, data 내용만 줄 수도 있다. 둘 다 받는다.
    const body = parsed.data
      ? parsed
      : { ticker: sel.ticker, name: sel.name, data: parsed }
    if (!body.data?.recommendation || !body.data?.summary) {
      setMsg({ type: 'err', text: 'recommendation 과 summary 가 있어야 저장할 수 있습니다.' })
      setBusy(false); return
    }
    if (!(body.data.sources || []).some(s => s?.url)) {
      setMsg({ type: 'err', text: '출처(sources)에 URL이 하나도 없습니다. 근거 없는 분석은 저장하지 않습니다.' })
      setBusy(false); return
    }
    try {
      // 기존 시그니처: importAiCache(items, overwrite)
      const r = await importAiCache([{ ...body, source: 'claude_code' }], true)
      setMsg({ type: 'ok', text: `${sel.ticker} 저장 완료 (${r.imported}건). 종목 탭에서 바로 보입니다.` })
      setSel(null); setPrompt(''); setPasted('')
      qc.invalidateQueries({ queryKey: ['analysis-gap'] })
    } catch (e) {
      setMsg({ type: 'err', text: e?.response?.data?.detail || '저장 실패' })
    } finally { setBusy(false) }
  }

  const box = {
    width: '100%', padding: '8px 10px', borderRadius: 4, fontSize: 11.5,
    border: '1px solid var(--clr-border-md)', background: 'var(--clr-bg-card)',
    color: 'var(--clr-text)', fontFamily: 'monospace', lineHeight: 1.5,
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
          분석 관리
        </div>
        {data && (
          <span style={{ fontSize: 10.5, color: 'var(--clr-text-muted)' }}>
            보유 {data.total}종목 · 갱신 필요 {stale.length}
            {data.missing > 0 && ` · 분석 없음 ${data.missing}`}
          </span>
        )}
      </div>

      <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--clr-text-muted)',
        lineHeight: 1.65, marginBottom: 10 }}>
        구독(클로드)으로 분석을 채웁니다. AI 요금이 들지 않습니다.<br />
        종목을 고르면 프롬프트가 나옵니다. 클로드에 붙여넣고 받은 JSON을 다시 여기에 붙여넣으세요.
      </div>

      {isLoading && <div style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>불러오는 중…</div>}

      {/* 갱신 대상 목록 */}
      {!sel && stale.length > 0 && (
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--clr-border-md)',
          borderRadius: 4 }}>
          {stale.map(r => (
            <button key={r.ticker} type="button" onClick={() => pickTicker(r)}
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                padding: '8px 10px', background: 'transparent', cursor: 'pointer',
                border: 'none', borderBottom: '1px solid var(--clr-border)',
                fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-strong)',
                minWidth: 68 }}>{r.ticker}</span>
              <span style={{ fontSize: 12, color: 'var(--clr-text-sub)', flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0,
                color: r.age_days === null ? 'var(--clr-neg-dark)' : 'var(--clr-text-muted)' }}>
                {r.age_days === null ? '분석 없음' : `${Math.round(r.age_days)}일 전`}
              </span>
            </button>
          ))}
        </div>
      )}

      {!sel && !isLoading && stale.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--clr-pos-darker)', fontWeight: 700 }}>
          모든 보유 종목의 분석이 최신입니다.
        </div>
      )}

      {/* 선택한 종목 작업 */}
      {sel && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--clr-text-strong)' }}>
              {sel.ticker} · {sel.name}
            </strong>
            <button type="button" className="btn-secondary" style={{ marginLeft: 'auto' }}
              onClick={() => { setSel(null); setPrompt(''); setPasted(''); setMsg(null) }}>
              목록으로
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 4 }}>
            1단계 — 이 프롬프트를 클로드에 붙여넣으세요
          </div>
          <textarea readOnly value={prompt} rows={4} style={{ ...box, resize: 'vertical' }} />
          <button type="button" className="btn-primary" onClick={copyPrompt}
            disabled={busy || !prompt}
            style={{ width: 'auto', padding: '7px 16px', fontSize: 12.5, marginTop: 8 }}>
            프롬프트 복사
          </button>

          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', margin: '14px 0 4px' }}>
            2단계 — 클로드가 준 JSON을 붙여넣으세요
          </div>
          <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={5}
            placeholder='{"recommendation": "매수", "summary": "...", ...}'
            style={{ ...box, resize: 'vertical' }} />
          <button type="button" className="btn-primary" onClick={save}
            disabled={busy || !pasted.trim()}
            style={{ width: 'auto', padding: '7px 16px', fontSize: 12.5, marginTop: 8 }}>
            검증하고 저장
          </button>
        </div>
      )}

      {msg && (
        <div className="ko-keep" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 4,
          fontSize: 12, lineHeight: 1.6,
          background: msg.type === 'ok' ? 'var(--clr-pos-bg-soft)' : 'var(--clr-neg-bg-soft)',
          color: msg.type === 'ok' ? 'var(--clr-pos-darker)' : 'var(--clr-neg-dark)' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

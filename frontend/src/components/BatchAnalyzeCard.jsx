import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { useStore } from '../store'
import { analyzeStock, getCachedAnalysis, importAiCache, listAiCache } from '../api'
import { displayName } from '../utils/displayName'

/**
 * 보유 종목 일괄 AI 분석 — 클라이언트가 순차 호출 + 진행률 표시.
 *
 * 동작:
 *  - 보유 + (옵션) 관심 종목 수집
 *  - 각 ticker 캐시 확인 → 없거나 force_refresh면 analyze 호출
 *  - 결과 캐시에 저장되어 향후 종목 탭 진입 시 즉시 표시
 *  - 동시 max 3개 (Anthropic rate limit + 비용 보호)
 */
export default function BatchAnalyzeCard({ allHoldings = [] }) {
  const qc = useQueryClient()
  const hasAnthropicKey = useStore(s => s.hasAnthropicKey)
  const currentUser     = useStore(s => s.currentUser)
  const aiEnabled       = !!currentUser?.ai_enabled || !!currentUser?.is_admin
  const isAdmin         = !!currentUser?.is_admin

  const [mode, setMode] = useState('api')   // 'api' | 'import'
  const [forceRefresh, setForceRefresh] = useState(false)
  const [running, setRunning]           = useState(false)
  const [cancelled, setCancelled]       = useState(false)
  const [progress, setProgress]         = useState({ done: 0, total: 0, current: '' })
  const [results, setResults]           = useState([])  // [{ticker, name, status, error}]
  const [startedAt, setStartedAt]       = useState(0)

  // 외부 import 모드 — JSON paste
  const [importJson, setImportJson]   = useState('')
  const [importMsg, setImportMsg]     = useState('')
  const [importErr, setImportErr]     = useState('')

  // KR 펀드/일부 ETF (시세 데이터 없음)는 분석도 제한적이므로 일단 모두 시도
  const targets = React.useMemo(() => {
    const seen = new Set()
    const list = []
    for (const h of allHoldings) {
      const tkr = String(h.ticker || '').toUpperCase()
      if (!tkr || seen.has(tkr)) continue
      seen.add(tkr)
      list.push({ ticker: tkr, name: h.name || '' })
    }
    return list
  }, [allHoldings])

  // 캐시된 종목 Set 확인 (시작 전 표시 + 어떤 종목이 분석 대기인지 식별)
  const [cachedSet, setCachedSet] = useState(null)   // Set<ticker> | null(로딩중)
  useEffect(() => {
    if (targets.length === 0) { setCachedSet(new Set()); return }
    let aborted = false
    const found = new Set()
    let done = 0
    ;(async () => {
      for (const t of targets) {
        if (aborted) return
        try {
          const r = await getCachedAnalysis(t.ticker, t.name)
          if (r?.cached) found.add(t.ticker)
        } catch {}
        done++
        if (done === targets.length && !aborted) setCachedSet(found)
      }
    })()
    return () => { aborted = true }
  }, [targets])

  const cachedCount = cachedSet ? cachedSet.size : null

  // ── 실시간 분석 현황 (admin) — MCP/외부 워크플로 진행을 12초마다 라이브 확인 ──
  const [live, setLive] = useState(null)  // {done, total, recent} | null
  useEffect(() => {
    if (!isAdmin || targets.length === 0) return
    const targetSet = new Set(targets.map(t => t.ticker))
    let stop = false
    async function poll() {
      try {
        const r = await listAiCache()
        const cachedTk = new Set()
        let recent = null
        for (const it of (r?.items || [])) {
          const parts = String(it.cache_key || '').split(':')
          if (parts[0] !== 'stock_v2' || !parts[1]) continue
          const tk = parts[1].toUpperCase()
          if (!targetSet.has(tk)) continue
          cachedTk.add(tk)
          if (recent == null || (it.age_hours ?? 999) < recent.ageH) {
            recent = { ticker: tk, ageH: it.age_hours ?? 0 }
          }
        }
        if (!stop) setLive({ done: cachedTk.size, total: targets.length, recent })
      } catch { /* 비-admin·네트워크 — 무시 */ }
    }
    poll()
    const id = setInterval(poll, 12_000)
    return () => { stop = true; clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, targets])
  // 분석 대기 = 캐시 안 된 종목만 — 「대기 종목 분석」 버튼이 이것만 처리
  const pendingTargets = React.useMemo(
    () => (cachedSet ? targets.filter(t => !cachedSet.has(t.ticker)) : []),
    [targets, cachedSet])
  const pendingCount = cachedSet ? pendingTargets.length : null

  async function run(list, force = false) {
    if (!aiEnabled || !hasAnthropicKey) return
    if (!Array.isArray(list) || list.length === 0) return
    setRunning(true); setCancelled(false)
    setResults([]); setStartedAt(Date.now())
    setProgress({ done: 0, total: list.length, current: '' })

    const newResults = []
    let cancel = false
    const cancelCheck = () => cancel || cancelled

    // Anthropic rate limit (분당 토큰) 회피 — 실제 API 분석 사이에만 12s sleep.
    // Sonnet 4.6 종목당 ~6K 토큰 × 5종목/분 = 30K/분 (Tier 1 안전).
    // 캐시 적중은 API 호출이 아니므로 throttle 생략 (헛돎 방지).
    const THROTTLE_MS = 12_000
    for (let i = 0; i < list.length; i++) {
      if (cancelCheck()) break
      const t = list[i]
      setProgress({ done: i, total: list.length, current: t.name || t.ticker })
      let wasCached = false
      try {
        const data = await analyzeStock(t.ticker, {
          name: t.name, force_refresh: force,
        })
        wasCached = !!data?._cached
        newResults.push({
          ticker: t.ticker, name: t.name,
          status: wasCached ? 'cached' : 'analyzed',
        })
      } catch (e) {
        const detail = e.response?.data?.detail
        const status = e.response?.status
        let errMsg
        if (status === 429) {
          errMsg = 'AI 요청 한도 초과 (429) — Anthropic API 분당 토큰 제한. throttle 자동 적용 중.'
        } else {
          errMsg = typeof detail === 'object' ? (detail.message || detail.error_code)
                 : (detail || e.message || '실패')
        }
        newResults.push({
          ticker: t.ticker, name: t.name,
          status: 'failed', error: errMsg,
        })
        // 429 만나면 더 길게 sleep (60s) — 분당 한도 리셋 대기
        if (status === 429 && i < list.length - 1 && !cancelCheck()) {
          await new Promise(r => setTimeout(r, 60_000))
        }
      }
      // 매 결과마다 UI에 반영 (사용자가 중간 결과 확인)
      setResults([...newResults])

      // 실제 API 분석을 한 경우에만 throttle (캐시 적중·마지막 종목은 생략)
      if (!wasCached && i < list.length - 1 && !cancelCheck()) {
        await new Promise(r => setTimeout(r, THROTTLE_MS))
      }
    }
    setProgress(p => ({ ...p, done: newResults.length, current: '' }))
    setRunning(false)
    // 종목 탭 진입 시 새 캐시가 보이도록 query 무효화
    qc.invalidateQueries({ queryKey: ['stock-cached'] })
    // 방금 분석/캐시된 종목을 cachedSet에 반영 → 대기 카운트 즉시 갱신
    setCachedSet(prev => {
      const next = new Set(prev || [])
      for (const r of newResults) if (r.status !== 'failed') next.add(r.ticker)
      return next
    })
  }

  // 외부 분석 import (admin only) — Claude Code/채팅에서 만든 JSON inject
  async function runImport() {
    setImportErr(''); setImportMsg('')
    let items
    try {
      items = JSON.parse(importJson)
      if (!Array.isArray(items)) {
        setImportErr('JSON 배열이어야 합니다. 예: [{ "ticker": "AAPL", "data": {...} }, ...]')
        return
      }
    } catch (e) {
      setImportErr(`JSON 파싱 실패: ${e.message}`)
      return
    }
    setRunning(true)
    try {
      const r = await importAiCache(items, true)
      setImportMsg(`반영 완료 — 저장 ${r.imported}건 · 건너뜀 ${r.skipped}건 · 실패 ${r.failed?.length || 0}건 (총 캐시 ${r.total_in_cache}건)`)
      if ((r.failed?.length || 0) > 0) {
        setImportErr('실패: ' + r.failed.slice(0, 5).map(f => `${f.ticker}: ${f.error}`).join(' · '))
      }
      qc.invalidateQueries({ queryKey: ['stock-cached'] })
    } catch (e) {
      setImportErr(e.response?.data?.detail || e.message || '실패')
    } finally {
      setRunning(false)
    }
  }

  if (allHoldings.length === 0) return null

  const summary = React.useMemo(() => {
    const s = { total: results.length, cached: 0, analyzed: 0, failed: 0 }
    for (const r of results) s[r.status] = (s[r.status] || 0) + 1
    return s
  }, [results])
  const elapsed = startedAt && progress.total > 0
    ? Math.round((Date.now() - startedAt) / 1000) : 0
  const pct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header">
        <div>
          <div className="mono-section-title is-accent">보유 종목 AI 일괄 분석</div>
          <div className="mono-section-sub ko-keep">
            「분석 대기」 버튼을 누르면 새로 추가된 종목만 자동 분석합니다. 결과는 캐시되어 종목 탭에서 즉시 표시·영구 보존.
          </div>
        </div>
      </div>

      {/* 실시간 분석 현황 — MCP/외부 워크플로가 저장할 때마다 자동으로 차오름 (admin) */}
      {isAdmin && live && (
        <div style={{ marginBottom: 12, padding: '8px 10px',
          background: 'var(--m-surface-variant)',
          border: '1px solid var(--m-outline-variant)', borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', fontSize: 11.5, marginBottom: 5, gap: 8 }}>
            <span style={{ fontWeight: 800, color: 'var(--m-text)' }}>
              분석 현황 <span style={{ color: 'var(--m-primary)' }}>{live.done}</span>
              <span style={{ color: 'var(--m-text-tertiary)' }}> / {live.total}</span>
            </span>
            <span className="ko-keep" style={{ color: 'var(--m-text-tertiary)', fontSize: 10,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              12초마다 자동 갱신
              {live.recent && (live.recent.ageH < 0.5
                ? ` · 방금 ${live.recent.ticker}` : ` · 최근 ${live.recent.ticker}`)}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--m-outline-variant)',
            borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%',
              width: `${live.total ? (live.done / live.total * 100) : 0}%`,
              background: 'var(--m-primary)', transition: 'width .4s ease' }} />
          </div>
        </div>
      )}

      {/* 모드 토글 — API 호출 vs 외부 import (admin만) */}
      {isAdmin && (
        <div className="seg-ctrl" style={{ marginBottom: 12 }}>
          <button onClick={() => setMode('api')}
            className={`seg-btn ${mode === 'api' ? 'active' : ''}`}
            style={{ fontSize: 11 }}>
            API 호출 (비용 발생)
          </button>
          <button onClick={() => setMode('import')}
            className={`seg-btn ${mode === 'import' ? 'active' : ''}`}
            style={{ fontSize: 11 }}>
            외부 분석 결과 import (무료)
          </button>
        </div>
      )}

      {mode === 'import' && isAdmin ? (
        <ImportPanel
          jsonText={importJson}
          setJsonText={setImportJson}
          onSubmit={runImport}
          running={running}
          msg={importMsg}
          err={importErr}
          targets={targets}
        />
      ) : (<>
      {/* 상단 — 대상 + 캐시 현황 + 옵션 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap',
        alignItems: 'baseline' }}>
        <div>
          <div className="m3-label" style={{ marginBottom: 3 }}>분석 대상</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--m-text)',
            fontVariantNumeric: 'tabular-nums' }}>
            {targets.length}<span style={{ fontSize: 11,
              color: 'var(--m-text-tertiary)', marginLeft: 4 }}>종목</span>
          </div>
        </div>
        <div>
          <div className="m3-label" style={{ marginBottom: 3 }}>이미 캐시됨</div>
          <div style={{ fontSize: 18, fontWeight: 900,
            color: cachedCount === targets.length ? 'var(--m-positive)' : 'var(--m-text)',
            fontVariantNumeric: 'tabular-nums' }}>
            {cachedCount == null ? '…' : cachedCount}
            <span style={{ fontSize: 11, color: 'var(--m-text-tertiary)',
              marginLeft: 4 }}>/ {targets.length}</span>
          </div>
        </div>
        {!running && (
          <label style={{ marginLeft: 'auto', display: 'inline-flex',
            alignItems: 'center', gap: 6, cursor: 'pointer',
            fontSize: 11, color: 'var(--m-text-secondary)', fontWeight: 600 }}>
            <input type="checkbox" checked={forceRefresh}
              onChange={e => setForceRefresh(e.target.checked)} />
            캐시 무시 (전체 새로 분석)
          </label>
        )}
      </div>

      {/* 진행 막대 */}
      {running && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: 'var(--m-text-secondary)', marginBottom: 4 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {progress.done} / {progress.total} ({pct}%)
              {elapsed > 0 && (
                <span style={{ color: 'var(--m-text-tertiary)', marginLeft: 6 }}>
                  · {elapsed}s 경과
                </span>
              )}
            </span>
            <span className="ko-keep" style={{ color: 'var(--m-text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 200 }}>
              {progress.current && `분석 중: ${progress.current}`}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--m-outline-variant)' }}>
            <div style={{ height: '100%', width: `${pct}%`,
              background: 'var(--m-text)', transition: 'width .3s ease' }} />
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!running ? (
          <button
            className="btn-primary"
            onClick={() => run(forceRefresh ? targets : pendingTargets, forceRefresh)}
            disabled={!aiEnabled || !hasAnthropicKey
              || (forceRefresh ? targets.length === 0 : !(pendingCount > 0))}
            style={{ flex: 1, fontSize: 13 }}>
            {!aiEnabled ? 'AI 권한 비활성화 — 관리자 승인 필요'
              : !hasAnthropicKey ? 'API Key 미설정 — 설정 탭에서 등록'
              : forceRefresh
                ? `전체 ${targets.length}종목 새로 분석 (예상 ${Math.ceil(targets.length * 42 / 60)}분)`
                : pendingCount == null ? '분석 대기 확인 중…'
                : pendingCount === 0 ? '모든 종목 분석 완료 ✓'
                : `분석 대기 ${pendingCount}종목 분석${pendingCount > 1 ? ` (예상 ${Math.ceil(pendingCount * 42 / 60)}분)` : ''}`}
          </button>
        ) : (
          <button onClick={() => setCancelled(true)}
            style={{
              flex: 1, padding: '12px', borderRadius: 2,
              background: 'transparent',
              border: '1px solid var(--m-negative)',
              color: 'var(--m-negative)',
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            중지 (현재 종목까지만 완료)
          </button>
        )}
      </div>

      {/* 결과 요약 + 종목별 */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 8,
              fontSize: 11, color: 'var(--m-text-secondary)',
              fontVariantNumeric: 'tabular-nums' }}>
              <span>완료 <strong className="num-pos">{summary.analyzed}</strong></span>
              <span>캐시 사용 <strong style={{ color: 'var(--m-text)' }}>{summary.cached}</strong></span>
              {summary.failed > 0 && (
                <span>실패 <strong className="num-neg">{summary.failed}</strong></span>
              )}
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto',
              border: '1px solid var(--m-outline-variant)', borderRadius: 2 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'baseline', gap: 8,
                  padding: '6px 12px',
                  borderBottom: i < results.length - 1 ? '1px solid var(--m-outline-variant)' : 'none',
                  fontSize: 11.5,
                }}>
                  <span className={`sev-label ${
                    r.status === 'analyzed' ? 'is-low'
                    : r.status === 'cached' ? 'is-med'
                    : 'is-critical'
                  }`}>
                    {r.status === 'analyzed' ? '분석' : r.status === 'cached' ? '캐시' : '실패'}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--m-text)',
                    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', flex: 1 }}>
                    {displayName(r.ticker, r.name)}
                    <span style={{ fontSize: 10, fontWeight: 600,
                      color: 'var(--m-text-tertiary)', marginLeft: 6 }}>
                      {r.ticker}
                    </span>
                  </span>
                  {r.error && (
                    <span className="ko-keep" style={{ fontSize: 10,
                      color: 'var(--m-text-tertiary)', maxWidth: 240,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' }} title={r.error}>
                      {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ko-keep" style={{ fontSize: 10,
        color: 'var(--m-text-tertiary)', marginTop: 10, lineHeight: 1.55 }}>
        한국 펀드/일부 ETF는 외부 시세가 없어 분석이 실패할 수 있습니다 (정상).
        분석 중 다른 탭으로 이동해도 백그라운드에서 계속 진행됩니다.
        429 (분당 한도) 에러 시 60초 자동 대기 후 재개.
      </div>
      </>)}
    </div>
  )
}

/* 외부 분석 결과 import 패널 — admin 전용.
   사용 시나리오: Claude Code/채팅에서 무료로 종목 분석 → 결과 JSON을
   다음 형식으로 paste → 백엔드 캐시에 즉시 inject. API 호출 비용 0. */
function ImportPanel({ jsonText, setJsonText, onSubmit, running, msg, err, targets }) {
  const sample = JSON.stringify([{
    ticker: 'AAPL',
    name: 'Apple Inc.',
    source: 'claude_code',
    data: {
      recommendation: 'buy',
      priceTarget: 320,
      summary: '...AI 분석 결과 요약...',
      company_overview: '...',
      catalysts_short: ['...'],
      catalysts_medium: ['...'],
      bull: ['...'],
      bear: ['...'],
      verdict: '...',
      sources: [{ url: '...', title: '...' }],
    },
  }], null, 2)
  const tickerList = targets.map(t => `${t.ticker}${t.name ? ' (' + t.name + ')' : ''}`).join('\n')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="ko-keep" style={{ fontSize: 11.5,
        color: 'var(--m-text-secondary)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--m-text)', fontWeight: 800 }}>워크플로</strong>:
        ① Claude Code 또는 무료 Claude 채팅에서 아래 종목 목록과 다온 분석 스키마를
        제시하고 web_search로 일괄 분석 요청 → ② 결과 JSON 배열을 아래 textarea에 paste →
        ③ <strong>저장</strong> 클릭 → 종목 탭 진입 시 즉시 cached로 표시.
      </div>

      <details>
        <summary style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-text)',
          cursor: 'pointer', padding: '4px 0' }}>
          분석 대상 종목 목록 ({targets.length}건) — 복사해 Claude에 전달
        </summary>
        <pre style={{ fontSize: 11, color: 'var(--m-text-secondary)',
          background: 'var(--m-surface-variant)',
          padding: 10, borderRadius: 2, overflow: 'auto', maxHeight: 200,
          marginTop: 6, fontFamily: 'monospace' }}>{tickerList}</pre>
      </details>

      <details>
        <summary style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-text)',
          cursor: 'pointer', padding: '4px 0' }}>
          JSON 스키마 예시 — Claude에게 이 형식으로 답해달라고 요청
        </summary>
        <pre style={{ fontSize: 10.5, color: 'var(--m-text-secondary)',
          background: 'var(--m-surface-variant)',
          padding: 10, borderRadius: 2, overflow: 'auto', maxHeight: 240,
          marginTop: 6, fontFamily: 'monospace' }}>{sample}</pre>
      </details>

      <textarea value={jsonText}
        onChange={e => setJsonText(e.target.value)}
        placeholder='[{ "ticker": "AAPL", "name": "Apple", "data": { ... } }, ...]'
        spellCheck={false}
        style={{
          width: '100%', minHeight: 180, padding: 10, borderRadius: 2,
          border: '1px solid var(--m-outline-variant)',
          background: 'var(--m-surface)', color: 'var(--m-text)',
          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.55,
          resize: 'vertical', boxSizing: 'border-box',
        }} />

      {msg && (
        <div style={{ padding: 8, background: 'var(--m-surface-variant)',
          border: '1px solid var(--m-outline-variant)', borderRadius: 4,
          fontSize: 11.5, color: 'var(--m-text)', lineHeight: 1.55 }}>
          {msg}
        </div>
      )}
      {err && (
        <div className="ko-keep" style={{ padding: 8, borderRadius: 2,
          border: '1px solid var(--m-negative)',
          color: 'var(--m-negative)', fontSize: 11, lineHeight: 1.55 }}>
          {err}
        </div>
      )}

      <button onClick={onSubmit}
        disabled={running || !jsonText.trim()}
        style={{
          padding: '12px', borderRadius: 2, border: 'none',
          background: 'var(--m-text)', color: 'var(--m-surface)',
          fontSize: 13, fontWeight: 800, cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '-.01em',
          opacity: (running || !jsonText.trim()) ? 0.4 : 1,
        }}>
        {running ? '저장 중…' : '캐시에 저장 (서버 재시작에도 보존)'}
      </button>
    </div>
  )
}

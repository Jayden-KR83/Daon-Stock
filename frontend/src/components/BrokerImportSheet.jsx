import React from 'react'
import { resolveTicker, resolveByName } from '../api'
import { buildImportRows, diffAccounts, mergeImport, nearEq as near } from '../utils/brokerImport'

/**
 * 증권사 파일 가져오기 — 검토 시트.
 *
 * 왜 바로 표에 쏟지 않는가: HTS 내보내기는 그 계좌의 **전량 스냅샷**이다.
 * 그대로 밀어 넣으면 "파일에 없는 종목"이 조용히 사라진다(전량매도일 수도,
 * 그냥 다른 계좌 파일일 수도 있다). 무엇이 바뀌는지 먼저 보여주고 사람이 고른다.
 *
 * 반영 범위도 여기서 결정된다 — 업로드한 파일의 계좌만 교체하고
 * 나머지 계좌는 손대지 않는다. (이전 구현은 표 전체를 덮어써서
 * 계좌별 파일 4개를 올리면 마지막 것만 남았다.)
 */

/** 동시 요청 수를 묶는다 — 13종목 순차 조회는 느리고, 전부 동시는 서버가 싫어한다. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const k = cursor++
      if (k >= items.length) return
      try { out[k] = await fn(items[k], k) } catch { out[k] = null }
    }
  }))
  return out
}

const num = (v) => (v === '' || v == null ? null : Number(v))
const fmt = (v) => (num(v) == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 }))

export default function BrokerImportSheet({ files, accounts, accLabels, existingRows, onApply, onClose }) {
  const accKeys = accounts.map(a => a.key)
  const labelToKey = React.useMemo(
    () => Object.fromEntries(accounts.map(a => [a.label, a.key])), [accounts])

  // 파일 → 계좌 배정. 파일명에서 읽은 값이 기본값이고, 못 읽었으면 사람이 고른다.
  const [assign, setAssign] = React.useState(
    () => Object.fromEntries(files.map((f, i) => [i, f.accountKey || ''])))
  const [dropMissing, setDropMissing] = React.useState(true)
  // 예수금·펀드는 기본 유지 — 파일에 있는데도 못 읽은 줄이라 '없어진 것'이 아니다
  const [dropProtected, setDropProtected] = React.useState(false)
  const [enrich, setEnrich] = React.useState({ running: false, done: 0, total: 0 })
  // 조회 결과 캐시 — 같은 종목이 여러 파일에 나온다(ISA·퇴직연금에 같은 ETF)
  const [found, setFound] = React.useState({})   // { ['name:'|'tkr:' + key]: {ticker,name,sector} }

  /* ── 티커·섹터 보강 ─────────────────────────────────────────
     티커가 없는 행은 조회가 성공해야 가져올 수 있다(미래 퇴직연금 파일).
     섹터는 빈칸일 때만 묻는다 — 이미 있는 값을 덮어쓰지 않는다. */
  const existingByKey = React.useMemo(() => {
    const m = {}
    for (const r of existingRows) m[`${r.account}:${String(r.ticker).toUpperCase()}`] = r
    return m
  }, [existingRows])

  React.useEffect(() => {
    let cancelled = false
    const byName = new Set(), byTicker = new Set()
    files.forEach((f, i) => {
      const acc = f.rows.some(r => r.accountLabel) ? null : assign[i]
      for (const r of f.rows) {
        if (r.needsLookup && r.name) { byName.add(r.name); continue }
        if (!r.ticker) continue
        const key = `${acc || labelToKey[r.accountLabel] || ''}:${r.ticker}`
        const sector = r.sector || existingByKey[key]?.sector || f.sectorHint
        if (!sector) byTicker.add(r.ticker)
      }
    })
    const tasks = [...[...byName].map(v => ['name', v]), ...[...byTicker].map(v => ['tkr', v])]
      .filter(([kind, v]) => found[`${kind}:${v}`] === undefined)
    if (!tasks.length) { setEnrich(e => (e.running ? { ...e, running: false } : e)); return }

    setEnrich({ running: true, done: 0, total: tasks.length })
    mapLimit(tasks, 4, async ([kind, v]) => {
      const d = kind === 'name' ? await resolveByName(v) : await resolveTicker(v)
      if (!cancelled) setEnrich(e => ({ ...e, done: e.done + 1 }))
      return [`${kind}:${v}`, d || null]
    }).then(pairs => {
      if (cancelled) return
      setFound(prev => ({ ...prev, ...Object.fromEntries(pairs.filter(Boolean)) }))
      setEnrich(e => ({ ...e, running: false }))
    })
    return () => { cancelled = true }
    // assign 이 바뀌면 섹터 출처(기존 계좌 값)가 달라져 다시 계산해야 한다
  }, [files, assign, existingByKey, labelToKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 파일 행 → 다온 행 → 변경 요약 (로직은 utils/brokerImport) ── */
  const built = React.useMemo(
    () => buildImportRows({ files, assign, found, existingRows, accounts }),
    [files, assign, found, existingRows, accounts])

  const diff = React.useMemo(
    () => diffAccounts({ perAccount: built.perAccount, existingRows, order: accKeys }),
    [built, existingRows, accKeys])

  const involved = new Set(Object.keys(built.perAccount))
  const unassigned = files.filter((f, i) => !assign[i] && !f.rows.some(r => r.accountLabel))
  const canApply = !enrich.running && unassigned.length === 0 && involved.size > 0

  function apply() {
    const next = mergeImport({ perAccount: built.perAccount, diff, existingRows, dropMissing, dropProtected })
    const kept = diff.reduce((n, d) => n + (dropProtected ? 0 : d.protected.length), 0)
    onApply(next, {
      accounts: [...involved],
      dropped: dropMissing ? diff.reduce((n, d) => n + d.missing.length, 0) : 0,
      kept, total: next.length,
    })
  }

  const box = { border: '1px solid var(--clr-border-md)', borderRadius: 4, padding: 10, marginBottom: 8 }
  const dim = { fontSize: 10.5, color: 'var(--clr-text-muted)', lineHeight: 1.6 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()}
        style={{ width: 'min(680px, 100%)', maxHeight: '88vh', overflow: 'auto',
          borderRadius: '8px 8px 0 0', padding: 16 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>증권사 파일 가져오기</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none',
            color: 'var(--clr-text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* 1) 파일별 계좌 배정 */}
        {files.map((f, i) => {
          const perRow = f.rows.some(r => r.accountLabel)
          return (
            <div key={i} style={box}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--clr-text-strong)',
                wordBreak: 'break-all' }}>{f.filename}</div>
              <div style={dim}>
                {[f.broker, f.asOf, `${f.rows.length}종목`,
                  f.headerRow >= 0 ? `헤더 ${f.headerRow + 1}행` : '헤더 못 찾음',
                  f.sectorHint && `섹터=${f.sectorHint}`].filter(Boolean).join(' · ')}
              </div>
              {perRow ? (
                <div style={{ ...dim, marginTop: 6 }}>계좌: 파일의 <strong>계좌명</strong> 열을 씁니다</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 8,
                  alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--clr-text-sub)' }}>계좌</span>
                  <select value={assign[i] || ''} onChange={e => setAssign(a => ({ ...a, [i]: e.target.value }))}
                    style={{ fontSize: 12.5, padding: '5px 6px', fontFamily: 'inherit' }}>
                    <option value="">— 선택 —</option>
                    {accounts.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
              )}
              {!perRow && !f.accountKey && (
                <div style={{ ...dim, color: 'var(--clr-warn, #c90)' }}>
                  파일명에서 계좌를 알 수 없습니다{f.accountCandidates.length > 1
                    ? ` (후보 ${f.accountCandidates.map(k => accLabels[k]).join('·')})` : ''} — 직접 고르세요.
                </div>
              )}
              {f.headerRow < 0 && (
                <div style={{ ...dim, color: 'var(--clr-danger, #c33)' }}>
                  읽은 첫 줄: {f.headers.slice(0, 12).join(' / ') || '(빈 파일)'}
                </div>
              )}
            </div>
          )
        })}

        {/* 2) 보강 진행 */}
        {enrich.running && (
          <div style={{ ...box, borderColor: 'var(--clr-info)' }}>
            <div style={{ fontSize: 12 }}>티커·섹터 조회 중 {enrich.done}/{enrich.total}</div>
            <div style={{ height: 3, background: 'var(--clr-border-md)', borderRadius: 2, marginTop: 6 }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'var(--clr-info)',
                width: `${enrich.total ? (enrich.done / enrich.total) * 100 : 0}%`, transition: 'width .2s' }} />
            </div>
          </div>
        )}

        {/* 3) 변경 요약 */}
        {diff.length > 0 && (
          <div style={box}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>이렇게 바뀝니다</div>
            <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: 'var(--clr-text-muted)', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', fontWeight: 600 }}>계좌</th>
                <th style={{ fontWeight: 600 }}>신규</th><th style={{ fontWeight: 600 }}>변경</th>
                <th style={{ fontWeight: 600 }}>그대로</th><th style={{ fontWeight: 600 }}>파일에 없음</th>
              </tr></thead>
              <tbody>
                {diff.map(d => (
                  <tr key={d.acc} style={{ textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>{accLabels[d.acc] || d.acc}</td>
                    <td>{d.added.length}</td><td>{d.changed.length}</td>
                    <td style={{ color: 'var(--clr-text-muted)' }}>
                      {d.same.length}{d.protected.length ? ` (+${d.protected.length})` : ''}
                    </td>
                    <td style={{ color: d.missing.length ? 'var(--clr-danger, #c33)' : 'inherit' }}>{d.missing.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...dim, marginTop: 6 }}>
              손대지 않는 계좌: {accKeys.filter(k => !involved.has(k)).map(k => accLabels[k]).join(' · ') || '없음'}
            </div>
          </div>
        )}

        {/* 변경 내역 상세 — 수량·평단이 어떻게 움직이는지 */}
        {diff.some(d => d.changed.length || d.added.length) && (
          <details style={box}>
            <summary style={{ fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              변경·신규 내역 보기
            </summary>
            <div style={{ marginTop: 8, maxHeight: 260, overflow: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <tbody>
                  {diff.flatMap(d => [
                    ...d.changed.map(({ from, to }) => (
                      <tr key={`c${d.acc}${to.ticker}`}>
                        <td style={{ color: 'var(--clr-text-muted)' }}>{accLabels[d.acc]}</td>
                        <td style={{ fontWeight: 700 }}>{to.ticker}</td>
                        <td style={{ textAlign: 'right' }}>
                          {near(from.quantity, to.quantity) ? '' : `${fmt(from.quantity)} → ${fmt(to.quantity)}주`}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {near(from.avg_price, to.avg_price) ? '' : `${fmt(from.avg_price)} → ${fmt(to.avg_price)}`}
                          {to._derivedAvg ? ' (유도)' : ''}
                        </td>
                      </tr>
                    )),
                    ...d.added.map(r => (
                      <tr key={`a${d.acc}${r.ticker}`} style={{ color: 'var(--clr-success, #2a7)' }}>
                        <td style={{ color: 'var(--clr-text-muted)' }}>{accLabels[d.acc]}</td>
                        <td style={{ fontWeight: 700 }}>{r.ticker}</td>
                        <td colSpan={2} style={{ textAlign: 'right' }}>
                          신규 {fmt(r.quantity)}주 @ {fmt(r.avg_price)}{r._derivedAvg ? ' (유도)' : ''}
                        </td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* 4) 사라지는 종목 — 기본은 삭제(파일이 전량 스냅샷이므로)지만 반드시 보여준다 */}
        {diff.some(d => d.missing.length > 0) && (
          <div style={{ ...box, borderColor: 'var(--clr-danger, #c33)' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={dropMissing} onChange={e => setDropMissing(e.target.checked)}
                style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12 }}>
                <strong>파일에 없는 종목을 삭제</strong>합니다 (그 사이 전량매도한 종목 반영)
                <div style={dim}>
                  {diff.filter(d => d.missing.length).map(d =>
                    `${accLabels[d.acc]}: ${d.missing.map(m => m.ticker).join(', ')}`).join(' / ')}
                </div>
                <div style={dim}>끄면 기존 수량·평단 그대로 남깁니다.</div>
              </span>
            </label>
          </div>
        )}

        {/* 예수금·펀드 — 파일에 있는데도 못 읽은 줄이므로 기본은 '유지'다 */}
        {diff.some(d => d.protected.length > 0) && (
          <div style={box}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={!dropProtected}
                onChange={e => setDropProtected(!e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12 }}>
                <strong>예수금·펀드는 지금 값 그대로 유지</strong>합니다
                <div style={dim}>
                  {diff.filter(d => d.protected.length).map(d =>
                    `${accLabels[d.acc]}: ${d.protected.map(m => m.name || m.ticker).join(', ')}`).join(' / ')}
                </div>
                <div style={dim}>
                  파일에 있지만 티커가 없어 읽지 못한 줄입니다 — 없어진 게 아니므로 건드리지 않습니다.
                </div>
              </span>
            </label>
          </div>
        )}

        {/* 5) 확인 필요 */}
        {(files.some(f => f.issues.length) || (!enrich.running && built.unresolved.length > 0) || built.dupes.length > 0) && (
          <div style={{ ...box, borderColor: 'var(--clr-warn, #c90)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
              확인 필요 — 가져오지 않은 행
            </div>
            <div style={dim}>
              {files.flatMap(f => f.issues.map(it => (
                <div key={`${f.filename}${it.line}`}>
                  {f.filename.slice(0, 18)} {it.line}행 · {it.name} — {it.reason}
                </div>
              )))}
              {!enrich.running && built.unresolved.map(u => (
                <div key={`u${u.file}${u.line}`}>
                  {u.file.slice(0, 18)} {u.line}행 · {u.name} — 종목명으로 티커를 찾지 못했습니다
                </div>
              ))}
              {built.dupes.map((d, i) => (
                <div key={`d${i}`}>{accLabels[d.account]} · {d.ticker} — 같은 계좌에 중복, 뒤쪽 무시</div>
              ))}
            </div>
          </div>
        )}

        {/* 6) 반영 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose}
            style={{ flex: '0 0 auto', padding: '0 16px', height: 44, borderRadius: 4,
              background: 'transparent', border: '1px solid var(--clr-border-md)',
              color: 'var(--clr-text-sub)', fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit' }}>
            취소
          </button>
          {/* 2026-10-22: 여기가 `background: var(--clr-accent)` 였다. 그런 토큰은 **없다** —
              정의되지 않은 var() 는 선언 자체를 무효로 만들어 배경이 transparent 가 되고,
              글자는 #fff 였으므로 **흰 카드 위의 흰 글자** = 버튼이 통째로 사라졌다.
              오너가 "저장 버튼 어디 있어?"라고 물은 것이 이것이다.
              폴백 없는 var() 는 오타 하나로 UI 를 지운다 — 디자인 시스템 클래스를 쓴다.
              `.btn-primary` 는 design.md R4(버튼 단일 위계)가 정한 유일한 주 버튼이기도 하다. */}
          <button type="button" onClick={apply} disabled={!canApply}
            className="btn-primary"
            style={{ flex: 1, height: 44, width: 'auto', fontSize: 13,
              cursor: canApply ? 'pointer' : 'not-allowed' }}>
            {enrich.running ? '조회 중…' : unassigned.length ? '계좌를 모두 지정하세요' : '표에 반영'}
          </button>
        </div>
        <div style={{ ...dim, marginTop: 6 }}>
          반영은 화면의 표까지입니다 — 표에서 <strong>저장</strong>을 눌러야 서버에 들어갑니다(저장 직전 자동 백업).
        </div>
      </div>
    </div>
  )
}

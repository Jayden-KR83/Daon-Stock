import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMarketBrief, runMacroBrief, macroBriefStatus } from '../api'
import { useStore } from '../store'
import { Basis } from './report'

/**
 * 오늘의 시황 — 시장 탭 **맨 위**. (2026-11-05 오너 요청)
 *
 * 오너: "매일 코스피·나스닥·환율·미국채·금·유가·비트코인 등 여러 요인으로 시장이
 * 바뀌는데, 투자자로서 취해야 할 사항과 내 보유/관심 종목 기준 참고사항을 매일
 * 구루처럼 알려줬으면 좋겠다."
 *
 * 세 층으로 나눈 이유 — **누가 만들었는지가 다르면 믿는 정도도 달라야 한다.**
 *   1) 거시 해설   : AI 가 쓴 글. 하루 2번, 전 사용자 공용.
 *   2) 내 종목 연결 : **서버가 센 숫자.** AI 가 아니다. 비중·종목 수는 계산이다.
 *   3) 한 줄 코멘트 : AI 가 2)의 숫자를 읽고 우선순위만 말한 것.
 *
 * 화면에서도 이 셋을 섞지 않는다. 섞으면 "AI 가 내 비중을 23%라고 했다"로 읽히고,
 * 그 숫자가 맞는지 아무도 확인하지 않게 된다.
 */

const GROUP_ORDER = [
  ['index', '지수'], ['rate', '금리'], ['fx', '환율'],
  ['commodity', '원자재'], ['crypto', '가상자산'],
]

function pctColor(v) {
  if (v == null) return 'var(--m-text-tertiary)'
  if (v > 0) return 'var(--m-positive)'
  if (v < 0) return 'var(--m-negative)'
  return 'var(--m-text-secondary)'
}

/* 시세 묶음 — 가로 스크롤 없이 접히게. 라벨 길이가 제각각이라
   `repeat(auto-fill, minmax(…))` 로 고정 폭 칸을 깔고 그 안에서 정렬한다. */
function QuoteGrid({ quotes }) {
  if (!quotes?.length) return null
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {GROUP_ORDER.map(([key, ko]) => {
        const items = quotes.filter(q => q.group === key)
        if (!items.length) return null
        return (
          <div key={key} style={{ display: 'grid',
            gridTemplateColumns: '52px minmax(0,1fr)', gap: 8, alignItems: 'start' }}>
            <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800,
              color: 'var(--m-text-tertiary)', paddingTop: 2 }}>{ko}</span>
            <div style={{ display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(94px, 1fr))', gap: '4px 10px' }}>
              {items.map(q => (
                <span key={q.ticker} style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'baseline', gap: 4, fontSize: 'var(--fs-caption)', minWidth: 0 }}>
                  <span style={{ color: 'var(--m-text-secondary)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.label}</span>
                  <b style={{ color: pctColor(q.pct), fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0 }}>
                    {q.pct == null ? '—' : (q.pct > 0 ? '+' : '') + q.pct.toFixed(2) + '%'}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* 내 종목 연결 — 라벨 폭 고정. 제목 길이가 달라도 숫자 열이 한 줄로 선다. */
function MyLinks({ links, basis }) {
  if (!links?.length) return null
  return (
    <div style={{ marginTop: 12, paddingTop: 10,
      borderTop: '1px solid var(--m-outline-variant)' }}>
      <div className="ko-keep" style={{ fontSize: 'var(--fs-caption)', fontWeight: 800,
        color: 'var(--m-text)', marginBottom: 2 }}>
        내 보유에 비추면
      </div>
      <div className="ko-keep" style={{ fontSize: 'var(--fs-micro)', color: 'var(--m-text-tertiary)',
        marginBottom: 8 }}>
        아래 숫자는 <b>AI 가 아니라 서버가 센 값</b>입니다 · 분모: {basis?.weight_basis}
      </div>
      <div style={{ display: 'grid', gap: 9 }}>
        {links.map(l => (
          <div key={l.key} style={{ display: 'grid',
            gridTemplateColumns: '14px minmax(0,1fr)', gap: 7 }}>
            <span style={{ color: 'var(--m-text-tertiary)', fontSize: 'var(--fs-caption)',
              lineHeight: 1.5 }}>·</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 1.55 }}>
                <b style={{ color: 'var(--m-text)' }}>{l.title}</b>
                <span style={{ color: 'var(--m-text-tertiary)' }}> ({l.metric})</span>
                {' — '}
                <span style={{ color: 'var(--m-text-secondary)' }}>{l.scope}</span>{' '}
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{l.count}종 · {l.weight}%</b>
                <span style={{ color: 'var(--m-text-tertiary)' }}> ({l.names.join(', ')})</span>
              </div>
              <div className="ko-keep" style={{ fontSize: 'var(--fs-caption)', color: 'var(--m-text-tertiary)',
                lineHeight: 1.6, marginTop: 2 }}>
                {l.why} <b style={{ color: 'var(--m-text-secondary)' }}>볼 것: {l.look}</b>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* 관리자 전용 '지금 만들기'.
   cron 은 하루 2번만 돈다. 기능을 새로 올린 날이나 cron 이 실패한 날에
   **기다리는 것 말고 할 수 있는 일이 없으면** 그 기능은 고칠 수도 없다.
   같은 세션은 서버가 건너뛰므로 연타해도 돈이 한 번만 나간다. */
function RunButton({ exists }) {
  const qc = useQueryClient()
  const isAdmin = useStore(st => !!st.currentUser?.is_admin)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg]   = React.useState('')
  if (!isAdmin) return null

  /* 🟥 2026-11-05: 전에는 생성이 끝날 때까지 **한 요청으로 기다렸다.**
     생성은 웹 검색 3회 + Sonnet 4,500토큰이라 40~120초가 걸리는데 axios 기본
     타임아웃은 20초다. 그래서 화면에 "실패: timeout of 20000ms exceeded" 가 떴다 —
     **그런데 서버는 끝까지 만들어 저장했다.** 성공한 작업을 실패로 보여 줬고,
     당연히 다시 누르게 되고, 누를 때마다 돈이 나갔다.
     조용한 실패보다 나쁜 것이 **성공을 실패로 보여 주는 것**이다.

     → 서버가 즉시 반환하고, 여기서 상태를 폴링한다. 중간에 탭을 떠나도
       생성은 계속된다(서버 스레드). 돌아와서 새로고침하면 결과가 있다. */
  const run = async (force) => {
    setBusy(true); setMsg('만드는 중…')
    try {
      const r = await runMacroBrief(force)
      if (r.skipped === 'already_exists') {
        setMsg('이미 있음'); setBusy(false); return
      }
      // 최대 4분. 웹 검색이 느린 날에도 이 안에 끝난다(서버 타임아웃 240초).
      const until = Date.now() + 4 * 60 * 1000
      while (Date.now() < until) {
        await new Promise(res => setTimeout(res, 4000))
        let st
        try { st = await macroBriefStatus() } catch { continue }
        if (st.status === 'error') { setMsg('실패: ' + (st.error || '')); break }
        if (st.status !== 'running') {
          setMsg('생성됨')
          await qc.invalidateQueries({ queryKey: ['market-brief'] })
          break
        }
      }
      if (Date.now() >= until) {
        // 포기하는 것은 **화면뿐**이다. 서버는 계속 만든다 — 그렇게 적는다.
        setMsg('오래 걸립니다 — 뒤에서 계속 만듭니다. 잠시 후 새로고침하세요')
        await qc.invalidateQueries({ queryKey: ['market-brief'] })
      }
    } catch (e) {
      setMsg('실패: ' + (e.response?.data?.detail || e.message || ''))
    } finally { setBusy(false) }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {msg && <span className="ko-keep" style={{ fontSize: 'var(--fs-micro)',
        color: 'var(--m-text-tertiary)' }}>{msg}</span>}
      {/* 이미 글이 있으면 '다시 만들기'. 프롬프트를 고친 날에는 기존 글이 옛
          결과라서, 덮어쓰지 못하면 다음 cron(최대 9시간 뒤)까지 고친 것을 볼 수
          없다. 돈이 한 번 더 나가므로 **버튼 이름과 툴팁에 그렇게 적는다** —
          조용히 과금되는 버튼을 만들지 않는다. */}
      <button className="mono-pill" disabled={busy} style={{ cursor: 'pointer' }}
        title={exists
          ? '지금 글을 버리고 다시 만듭니다 — API 비용이 한 번 더 듭니다(약 $0.05)'
          : '이번 세션(장 전/장 후) 시황을 지금 생성합니다'}
        onClick={() => run(!!exists)}>
        {busy ? '만드는 중…' : exists ? '다시 만들기' : '지금 만들기'}</button>
    </span>
  )
}

export default function MarketBriefCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['market-brief'], queryFn: getMarketBrief,
    staleTime: 10 * 60 * 1000, retry: false,
  })

  if (isLoading) {
    return (
      <div className="mono-card" style={{ marginBottom: 12 }}>
        <div className="mono-section-title is-accent">오늘의 시황</div>
        <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--m-text-tertiary)', marginTop: 6 }}>
          불러오는 중…
        </div>
      </div>
    )
  }
  if (!data) return null

  const b = data.brief
  /* 아직 한 번도 만들어지지 않았을 때 — **빈 카드를 숨기지 않는다.**
     숨기면 "이 기능이 있다"는 사실 자체가 사라진다. 언제 생기는지 적는다. */
  if (!b) {
    return (
      <div className="mono-card ko-keep" style={{ marginBottom: 12 }}>
        <div className="mono-section-header" style={{ marginBottom: 4 }}>
          <div className="mono-section-title is-accent">오늘의 시황</div>
          <RunButton exists={false} />
        </div>
        <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--m-text-tertiary)',
          lineHeight: 1.6 }}>
          아직 만들어지지 않았습니다. 매일 아침 7시(장 전)·오후 4시(장 후)에 생성됩니다.
        </div>
      </div>
    )
  }

  const madeAt = b.created_at ? new Date(b.created_at * 1000) : null
  const sessionKo = String(b.session || '').endsWith(':pre') ? '장 전' : '장 후'

  return (
    <div className="mono-card" style={{ marginBottom: 12 }}>
      <div className="mono-section-header" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="mono-section-title is-accent">오늘의 시황</div>
          <div className="mono-section-sub ko-keep">
            {sessionKo} · {madeAt
              ? `${madeAt.getMonth() + 1}/${madeAt.getDate()} ${String(madeAt.getHours()).padStart(2, '0')}:${String(madeAt.getMinutes()).padStart(2, '0')} 작성`
              : ''}
            {!data.fresh && (
              <b style={{ color: 'var(--m-negative)' }}> · 이번 세션 글이 아직 없어 직전 글입니다</b>
            )}
          </div>
        </div>
        <RunButton exists />
      </div>

      {/* ① 거시 해설 — AI */}
      <div className="ko-keep" style={{ fontSize: 'var(--fs-body)', fontWeight: 800, lineHeight: 1.5,
        color: 'var(--m-text)' }}>{b.headline}</div>

      {Array.isArray(b.movers) && b.movers.length > 0 && (
        <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
          {b.movers.map((m, i) => (
            <div key={i} style={{ display: 'grid',
              gridTemplateColumns: '76px minmax(0,1fr)', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: 'var(--m-text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.what}
              </span>
              <span className="ko-keep" style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 1.6,
                color: 'var(--m-text-secondary)' }}>
                <b style={{ color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>
                  {m.number}
                </b>{' — '}{m.meaning}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 자산군별 시선 — 2026-11-05 오너: "빅테크나 채권 비트 코인 등 주의 사항이나
          조언을 해주는 내용이 있어야지."
          칸을 만들어 두지 않으면 글은 늘 지수 이야기로 수렴한다.
          라벨 폭을 92px 로 고정한다 — '빅테크·성장주'와 '채권·금리'의 길이가 달라
          풀어 두면 본문 시작 x 가 줄마다 흔들린다. */}
      {Array.isArray(b.views) && b.views.length > 0 && (
        <div style={{ marginTop: 11, paddingTop: 9,
          borderTop: '1px solid var(--m-outline-variant)' }}>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 800,
            color: 'var(--m-text)', marginBottom: 6 }}>자산군별로 보면</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {b.views.map((v, i) => (
              <div key={i} style={{ display: 'grid',
                gridTemplateColumns: '92px minmax(0,1fr)', gap: 8 }}>
                <span className="ko-keep" style={{ fontSize: 'var(--fs-micro)',
                  fontWeight: 800, color: 'var(--m-text-secondary)',
                  lineHeight: 1.6, paddingTop: 1 }}>{v.asset}</span>
                <div className="ko-keep" style={{ minWidth: 0,
                  fontSize: 'var(--fs-caption)', lineHeight: 1.65,
                  color: 'var(--m-text-secondary)' }}>
                  {v.stance}
                  {v.caution && (
                    <div style={{ marginTop: 2 }}>
                      <b style={{ color: 'var(--m-negative)' }}>주의</b>{' '}
                      <span>{v.caution}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(b.actions) && b.actions.length > 0 && (
        <div style={{ marginTop: 11, paddingTop: 9,
          borderTop: '1px solid var(--m-outline-variant)' }}>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 800, color: 'var(--m-text)',
            marginBottom: 5 }}>오늘 확인해 볼 것</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {b.actions.map((a, i) => (
              <div key={i} style={{ display: 'grid',
                gridTemplateColumns: '16px minmax(0,1fr)', gap: 6 }}>
                <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 800,
                  color: 'var(--m-text-tertiary)', lineHeight: 1.7 }}>{i + 1}</span>
                <span className="ko-keep" style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 1.65,
                  color: 'var(--m-text-secondary)' }}>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {b.watch && (
        <div className="ko-keep" style={{ marginTop: 9, fontSize: 'var(--fs-caption)', lineHeight: 1.6,
          color: 'var(--m-text-secondary)' }}>
          <b style={{ color: 'var(--m-text)' }}>다음 48시간</b> · {b.watch}
        </div>
      )}

      {/* ② 내 종목 연결 — 서버 계산 */}
      <MyLinks links={data.links} basis={data.basis} />

      {/* ③ AI 한 줄 — ①②와 **눈으로 구분**되어야 한다 */}
      {data.note && (
        <div className="ko-keep" style={{ marginTop: 10, padding: '8px 11px',
          borderRadius: 4, border: '1px dashed var(--m-outline)',
          fontSize: 'var(--fs-body-sm)', lineHeight: 1.65, color: 'var(--m-text-secondary)' }}>
          <b style={{ color: 'var(--m-text)' }}>AI 한 줄</b> · {data.note}
        </div>
      )}

      <QuoteGrid quotes={b.quotes} />

      {/* '검색을 요청했다'와 '검색이 됐다'는 다른 사실이다. 실패한 날에도
          "웹 검색 포함"이라고 적으면, 확인되지 않은 값을 확인된 것처럼 보이게 한다. */}
      <Basis title="이 글의 한계"
        label={`${b.searched ? '웹 검색 포함'
          : b.search_error ? `웹 검색 실패(${b.search_error}) — 발표값은 확인 필요`
          : '시세만 사용(검색 없음)'} · 모델 ${b.model || '—'}`}>
        <ul style={{ margin: 0, paddingLeft: 15 }}>
          {(data.unmeasured || []).map(u => <li key={u}>{u}</li>)}
          <li>이 글은 시장 해설이며 <b>매수·매도 권유가 아닙니다</b>.</li>
          <li>같은 날 같이 움직인 것은 상관이지 인과가 아닙니다.</li>
        </ul>
        {b.facts && (
          <div style={{ marginTop: 6 }}>
            발표값(검색) — CPI: {b.facts.cpi || '확인 필요'} · 기준금리: {b.facts.policy_rate || '확인 필요'}
            {b.facts.next_event ? ` · 다음 일정: ${b.facts.next_event}` : ''}
          </div>
        )}
      </Basis>
    </div>
  )
}

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStore } from '../store'
import { getDiscover, rescanDiscover } from '../api'

/* 신규 종목 발굴 (GARP 스크리닝) — 표 형식
 * 깔때기: universe → 정량 5축 점수 → 랭킹. AI는 종목 탭에서 별도(여기선 링크만).
 * 정직성: 상승 '확률' 단정 금지 — 항목별 상대 순위 + 데이터 범위 명시.
 * 한국 종목은 부채·전문가(애널리스트) 지표가 공개되지 않아 일부 항목이 '—'. */

// 5개 평가 항목 — 쉬운 설명
const AXES = [
  { key: 'pct_value',     label: '가치',   desc: '지금 가격이 (이익·성장 대비) 싼 편인가' },
  { key: 'pct_growth',    label: '성장',   desc: '매출·이익이 늘고 있는가' },
  { key: 'pct_quality',   label: '체력',   desc: '빚이 적고 돈을 잘 버는가 (재무 건전성)' },
  { key: 'pct_momentum',  label: '추세',   desc: '최근 주가가 상승 흐름인가 (52주 고점 근접)' },
  { key: 'pct_sentiment', label: '전문가', desc: '증권사 애널리스트가 더 오른다고 보는가' },
]

// 게이트 탈락 사유 → 쉬운 말
const FAIL_KO = {
  'PEG>1.5': '성장 대비 비쌈',
  'EPS성장≤0': '이익이 줄어듦',
  '부채비율≥200': '빚이 많음',
}

function agoLabel(epoch) {
  if (!epoch) return null
  const h = Math.max(0, (Date.now() / 1000 - epoch) / 3600)
  if (h < 1) return '방금 갱신됨'
  if (h < 24) return `${Math.round(h)}시간 전 갱신`
  return `${Math.round(h / 24)}일 전 갱신`
}

const mktKo = (m) => (m === 'KR' ? '한국' : m === 'US' ? '미국' : m)

function ScoreCell({ row, ax, mlabel }) {
  const v = row[ax.key]
  if (v == null) {
    return (
      <td style={{ ...numTd, color: 'var(--m-text-tertiary)' }}
        title={`${ax.label} — 데이터 미제공 (한국 종목은 ${ax.label === '체력' ? '부채' : '전문가'} 지표가 공개되지 않음)`}>
        —
      </td>
    )
  }
  const top = Math.max(1, Math.round(100 - v))
  return (
    <td style={numTd}
      title={`${ax.label} ${Math.round(v)}점 / 100 — ${ax.desc}. 같은 ${mlabel} 종목 중 상위 ${top}%`}>
      {Math.round(v)}
    </td>
  )
}

const numTd = {
  padding: '9px 8px', textAlign: 'right', fontSize: 12.5, fontWeight: 600,
  color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
}
const numTh = {
  padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 700,
  color: 'var(--m-text-secondary)', whiteSpace: 'nowrap',
}

export default function DiscoverTab() {
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)
  const currentUser = useStore(s => s.currentUser)
  const isAdmin = !!currentUser?.is_admin

  const [market, setMarket] = useState('ALL')
  const [sort, setSort] = useState('score')
  const [includeFailed, setIncludeFailed] = useState(false)
  const [rescanMsg, setRescanMsg] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['discover', market, sort, includeFailed],
    queryFn: () => getDiscover({ market, sort, include_failed: includeFailed, limit: 80 }),
    staleTime: 10 * 60_000,
  })

  const items = data?.items || []
  const ago = agoLabel(data?.computed_at)
  const mlabel = mktKo(market === 'ALL' ? '' : market) || '전체'

  async function onRescan() {
    setRescanMsg('갱신 요청 중…')
    try {
      const r = await rescanDiscover()
      if (r.status === 'started') {
        setRescanMsg('갱신을 시작했어요 — 5~7분 후 자동 반영됩니다.')
        // 7분 뒤 자동 새로고침
        setTimeout(() => { qc.invalidateQueries({ queryKey: ['discover'] }); setRescanMsg('') }, 420_000)
      } else if (r.status === 'already_running') {
        setRescanMsg('이미 갱신이 진행 중입니다.')
      } else {
        setRescanMsg('')
      }
    } catch (e) {
      setRescanMsg(e.response?.data?.detail || '갱신 실패')
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      {/* 헤더 + 항목 설명 */}
      <div className="mono-card" style={{ marginBottom: 12 }}>
        <div className="mono-section-header">
          <div>
            <div className="mono-section-title is-accent">신규 종목 발굴</div>
            <div className="mono-section-sub ko-keep">
              성장하면서도 안 비싼 종목을 5가지 기준으로 점수 매겨 줄 세웁니다.
              점수는 상승 '확률'이 아니라, 같은 시장 종목들 사이의 상대 순위예요 — 판단의 출발점일 뿐 보장이 아닙니다.
            </div>
          </div>
        </div>

        {/* 5개 평가 항목 쉬운 설명 */}
        <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
          {AXES.map(ax => (
            <div key={ax.key} style={{ display: 'flex', gap: 8, fontSize: 11.5, lineHeight: 1.5 }}>
              <span style={{ flex: '0 0 42px', fontWeight: 800, color: 'var(--m-text)' }}>{ax.label}</span>
              <span className="ko-keep" style={{ color: 'var(--m-text-secondary)' }}>{ax.desc}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, fontSize: 11.5, lineHeight: 1.5, marginTop: 2 }}>
            <span style={{ flex: '0 0 42px', fontWeight: 800, color: 'var(--m-text)' }}>종합</span>
            <span className="ko-keep" style={{ color: 'var(--m-text-secondary)' }}>
              위 5개를 가중 평균한 매력도 (가치·성장 비중이 절반 이상). 점수에 마우스를 올리면 의미가 나와요.
            </span>
          </div>
        </div>
      </div>

      {/* 필터 + 갱신 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div className="seg-ctrl">
          {[['ALL', '전체'], ['US', '미국'], ['KR', '한국']].map(([v, l]) => (
            <button key={v} onClick={() => setMarket(v)}
              className={`seg-btn ${market === v ? 'active' : ''}`} style={{ fontSize: 11 }}>{l}</button>
          ))}
        </div>
        <div className="seg-ctrl">
          {[['score', '종합순'], ['completeness', '데이터순'], ['roe', '수익성순']].map(([v, l]) => (
            <button key={v} onClick={() => setSort(v)}
              className={`seg-btn ${sort === v ? 'active' : ''}`} style={{ fontSize: 11 }}>{l}</button>
          ))}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          fontSize: 11, color: 'var(--m-text-secondary)', fontWeight: 600 }}
          title="PEG·성장·부채의 최소 기준에 미달한 종목 — 참고용으로만">
          <input type="checkbox" checked={includeFailed} onChange={e => setIncludeFailed(e.target.checked)} />
          기본 조건 미달도 보기
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>
            {ago ? `${ago} · 매일 자동` : '매일 자동 갱신'}
          </span>
          {isAdmin && (
            <button onClick={onRescan} className="btn-secondary"
              style={{ fontSize: 11, padding: '5px 10px' }}>지금 갱신</button>
          )}
        </div>
      </div>

      {rescanMsg && (
        <div className="ko-keep" style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 4,
          background: 'var(--m-surface-variant)', color: 'var(--m-text-secondary)',
          fontSize: 11.5, lineHeight: 1.5 }}>{rescanMsg}</div>
      )}

      {/* 본문 */}
      {isLoading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--m-text-tertiary)', fontSize: 12 }}>
          발굴 데이터를 불러오는 중…
        </div>
      ) : error ? (
        <div className="ko-keep" style={{ padding: 12, borderRadius: 4, border: '1px solid var(--m-negative)',
          color: 'var(--m-negative)', fontSize: 12 }}>
          발굴 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : items.length === 0 ? (
        <div className="mono-card ko-keep" style={{ textAlign: 'center', color: 'var(--m-text-secondary)',
          fontSize: 12.5, lineHeight: 1.7, padding: 24 }}>
          아직 발굴 결과가 없습니다. 매일 장 마감 후 자동 스캔되어 채워집니다.
          {!includeFailed && ' (「기본 조건 미달도 보기」를 켜 보세요.)'}
        </div>
      ) : (
        <div className="mono-card" style={{ padding: '4px 6px', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 660, borderCollapse: 'collapse', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ ...numTh, textAlign: 'center', width: 30 }}>#</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: 'var(--m-text-secondary)' }}>종목</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: 'var(--m-text-secondary)', whiteSpace: 'nowrap' }}>시장</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: 'var(--m-text-secondary)', whiteSpace: 'nowrap' }}>섹터</th>
                {AXES.map(ax => (
                  <th key={ax.key} style={numTh} title={ax.desc}>{ax.label}</th>
                ))}
                <th style={{ ...numTh, color: 'var(--m-text)' }} title="5개 항목 가중 평균 매력도">종합</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const failed = !row.gate_pass
                const failKo = FAIL_KO[row.gate_fail_reason] || row.gate_fail_reason
                return (
                  <tr key={row.ticker}
                    onClick={() => setChartTicker(row.ticker)}
                    className="discover-row"
                    style={{ cursor: 'pointer', opacity: failed ? 0.6 : 1 }}>
                    <td style={{ ...numTd, textAlign: 'center', color: 'var(--m-text-tertiary)', fontWeight: 700 }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '9px 8px', minWidth: 130 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                        {row.name || row.ticker}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>
                        {row.ticker}
                        {failed && (
                          <span style={{ marginLeft: 6, color: 'var(--m-text-tertiary)' }}
                            title="PEG·성장·부채 최소 기준 미달 (참고용)">· {failKo}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '9px 8px', fontSize: 11.5, color: 'var(--m-text-secondary)',
                      whiteSpace: 'nowrap' }}>{mktKo(row.market)}</td>
                    <td style={{ padding: '9px 8px', fontSize: 11.5, color: 'var(--m-text-secondary)',
                      whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.sector}
                    </td>
                    {AXES.map(ax => (
                      <ScoreCell key={ax.key} row={row} ax={ax} mlabel={mktKo(row.market)} />
                    ))}
                    <td style={{ ...numTd, fontSize: 14, fontWeight: 900 }}
                      title={`종합 매력도 ${Math.round(row.composite_score)}점 — 5개 항목 가중 평균(같은 시장 내 상대 순위). 상승 '확률'이 아니라 상대 매력도입니다.${row.data_completeness < 5 ? ` (${row.data_completeness}/5개 항목으로 평가 — 한국 종목은 부채·전문가 지표 미공개)` : ''}`}>
                      {Math.round(row.composite_score)}
                      {row.data_completeness < 5 && (
                        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--m-text-tertiary)', marginLeft: 3 }}>
                          {row.data_completeness}/5
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ko-keep" style={{ fontSize: 10, color: 'var(--m-text-tertiary)',
        marginTop: 10, lineHeight: 1.55 }}>
        종목을 누르면 종목 탭에서 AI 심층 분석을 볼 수 있어요. 점수 옆 「N/5」는 평가에 쓰인 항목 수입니다
        (한국 종목은 부채·전문가 데이터가 공개되지 않아 보통 4/5). 투자 권유가 아니며, 데이터는 매일 자동 갱신됩니다.
      </div>
    </div>
  )
}

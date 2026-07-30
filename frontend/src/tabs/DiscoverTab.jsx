import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { useStore } from '../store'
import { getDiscover, rescanDiscover, getCachedAnalysis } from '../api'
import InfoTip from '../components/InfoTip'

/* 신규 종목 발굴 (GARP) — 표 + 종목별 레이더 인포그래픽(확장).
 * 행 클릭 → 5요소 레이더 + 밸류에이션(현재가·목표가·상승여력·PER·PEG·순이익률) + 메타 펼침.
 * 정직성: 점수는 상승 '확률'이 아니라 같은 시장 내 상대 순위. 한국은 일부 지표 미공개('—'). */

// 5요소 — 직관적 이름 + 쉬운 설명
const AXES = [
  { key: 'pct_value',     label: '저평가', crit: 'PEG·섹터상대PER·선행PER', desc: '이익·성장에 비해 주가가 싼 편인가 (PER·PEG·선행PER)' },
  { key: 'pct_growth',    label: '성장성', crit: 'EPS·매출 성장률',        desc: '매출·이익이 늘고 있는가' },
  { key: 'pct_quality',   label: '안정성', crit: 'ROE·부채비율↓',          desc: '빚이 적고 돈을 잘 버는가 (재무 건전성)' },
  { key: 'pct_momentum',  label: '상승세', crit: '52주 고점 근접도',        desc: '최근 주가가 상승 흐름인가 (52주 고점 근접)' },
  { key: 'pct_expert',    label: '기대',   crit: '목표가 상승여력·추정 상향', desc: '애널리스트 목표가·추정치 상향 정도', src: 'pct_sentiment' },
]
// 시장별 축 가중치 (backend GARP_WEIGHTS / GARP_WEIGHTS_KR 와 일치 — 표시용)
const AXIS_WEIGHT = { pct_value:[30,35], pct_growth:[25,25], pct_quality:[20,25], pct_momentum:[15,5], pct_expert:[10,10] }
const axVal = (row, ax) => row[ax.src || ax.key]

// 저점발굴(혁신·턴어라운드) 4요소 — PSR·R&D·바닥다지기·런웨이 기반
const INNOV_AXES = [
  { key: 'pct_value',    label: '저평가',    desc: '매출 대비 주가가 R&D(파이프라인 가치) 대비 싼가 — 변형밸류 PSR÷R&D집중도' },
  { key: 'pct_growth',   label: '파이프라인', desc: '매출 대비 R&D 투자 강도 — 미래 신약·기술 잠재력' },
  { key: 'pct_momentum', label: '바닥다지기', desc: '장기 바닥에서 막 반등 — 120일선 돌파 + 저변동성 + 거래량 유입' },
  { key: 'pct_quality',  label: '생존력',    desc: '보유 현금으로 적자를 버틸 수 있는 햇수 (런웨이)' },
]

/* 점수 산정 방식 공개 — backend `_garp_score`/`_garp_gate`/`GARP_WEIGHTS(_KR)`의 실제 구현과
 * 1:1로 맞춘 설명. 구현이 바뀌면 이 블록도 함께 고칠 것(설명과 코드 불일치 = 신뢰 붕괴).
 * R6: 문장마다 줄바꿈. R1: 좌측 색띠 없이 4면 hairline + radius 4. */
// 라벨 좌 · 값 우 세로 정렬(R6). 값은 줄바꿈 허용 — 360px에서 nowrap은 오버플로를 낸다.
function MethodRow({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '1px 0' }}>
      <span style={{ flexShrink: 0 }}>{k}</span>
      <span style={{ color: 'var(--m-text)', fontWeight: 600, minWidth: 0, textAlign: 'right',
        wordBreak: 'keep-all' }}>{v}</span>
    </div>
  )
}
function MethodBlock({ title, children }) {
  return (
    <div style={{ marginTop: 9 }}>
      <div style={{ fontWeight: 700, color: 'var(--m-text)', marginBottom: 3 }}>{title}</div>
      <div style={{ paddingLeft: 2 }}>{children}</div>
    </div>
  )
}

function ScoringMethodology({ qtype }) {
  return (
    // 기본 접힘 — 매번 펼쳐져 있으면 결과 목록이 아래로 밀린다. 필요할 때만 펼쳐 본다.
    <details className="mono-card ko-keep" style={{ marginBottom: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--m-text)' }}>
        점수 산정 방식 · 데이터 출처
        <span style={{ marginLeft: 6, fontWeight: 600, color: 'var(--m-text-tertiary)', fontSize: 11 }}>
          (눌러서 펼치기 — 어떻게 계산했는지 전부 공개합니다)
        </span>
      </summary>
      <div style={{ fontSize: 11, color: 'var(--m-text-secondary)', lineHeight: 1.75, marginTop: 8 }}>

        {qtype === 'stock' && (<>
          <MethodBlock title="1단계 — 각 지표를 같은 시장 안에서 백분위(0~100)로 환산">
            미국 종목은 미국끼리, 한국 종목은 한국끼리 순위를 매깁니다.<br />
            <b>백분위 = (나보다 열등한 종목 수) ÷ (비교 종목 수 − 1) × 100.</b><br />
            즉 <b>86점 = 그 지표에서 같은 시장 종목의 86%보다 우수</b>하다는 뜻입니다. (상승 확률 아님)<br />
            비교 대상이 1개뿐이면 순위를 낼 수 없어 50(중립)으로 둡니다.
          </MethodBlock>

          <MethodBlock title="예시 — SK하이닉스 '저평가 86'은 어떻게 나오나">
            저평가 축은 밸류에이션 지표 <b>3개의 백분위 평균</b>입니다(쌀수록 높은 점수).<br />
            <div style={{ marginTop: 4, marginBottom: 4 }}>
              <MethodRow k="PEG (성장 대비 주가)" v="코스피의 90%보다 저렴 → 90점" />
              <MethodRow k="섹터상대 PER" v="반도체 섹터 중앙값 대비 낮음 → 85점" />
              <MethodRow k="섹터상대 선행 PER" v="추정이익 기준으로도 저평가 → 83점" />
            </div>
            <b>저평가 = (90 + 85 + 83) ÷ 3 ≈ 86점.</b><br />
            해석: "코스피 종목들과 비교하면 밸류에이션 세 지표 평균으로 약 86%보다 싸다."<br />
            <span style={{ color: 'var(--m-text-tertiary)', fontSize: 10 }}>※ 위 90·85·83은 산식을 보여주기 위한 예시 값입니다. 실제 백분위는 그날의 시장 데이터로 매일 다시 계산됩니다.</span>
          </MethodBlock>

          <MethodBlock title="다른 축도 같은 방식 — '성장성'은 이렇게 정량화">
            성장성 축 = <b>EPS성장률 백분위</b>와 <b>매출성장률 백분위</b>의 평균.<br />
            예: EPS가 시장의 78%보다 빠르게 늘고(78점), 매출이 70%보다 빠르면(70점) → 성장성 = (78+70)÷2 = 74점.<br />
            "매출·이익이 늘고 있는가"를 <b>절대 수치가 아니라 '같은 시장 안에서 얼마나 상위인가'</b>로 점수화합니다. 그래서 시장이 전반적으로 좋아도 '상대적으로' 우수한 종목이 높은 점수를 받습니다.
          </MethodBlock>

          <MethodBlock title="2단계 — 5개 축 점수 = 소속 지표 백분위의 평균">
            값이 있는 지표만 평균냅니다. (↓ = 낮을수록 높은 점수)
            <div style={{ marginTop: 4 }}>
              <MethodRow k="저평가" v="PEG↓ · 섹터상대PER↓ · 섹터상대 선행PER↓" />
              <MethodRow k="성장성" v="EPS성장률 · 매출성장률" />
              <MethodRow k="안정성" v="ROE · 부채비율↓" />
              <MethodRow k="상승세" v="52주 고점 근접도" />
              <MethodRow k="기대" v="목표가 상승여력 · EPS추정 변화 · 상향비율" />
            </div>
          </MethodBlock>

          <MethodBlock title="3단계 — 종합점수 = 가중합 × 완성도">
            <div style={{ marginTop: 2 }}>
              <MethodRow k="가중치" v="미국 / 한국" />
              <MethodRow k="저평가" v="30% / 35%" />
              <MethodRow k="성장성" v="25% / 25%" />
              <MethodRow k="안정성" v="20% / 25%" />
              <MethodRow k="상승세" v="15% / 5%" />
              <MethodRow k="기대" v="10% / 10%" />
            </div>
            <div style={{ marginTop: 4 }}>
              값이 없는 축은 빼고 남은 가중치를 다시 100%로 환산합니다.<br />
              그다음 <b>(값이 있는 축 수 ÷ 5)</b>를 곱해 결측을 감점합니다.<br />
              한 축(예: 저평가 99)만 높아서 상위에 오르는 것을 막기 위한 장치입니다.
            </div>
          </MethodBlock>

          <MethodBlock title="4단계 — 필수 게이트 (하나라도 걸리면 후보 탈락)">
            <div>
              <MethodRow k="성장 대비 비쌈" v="PEG > 1.5" />
              <MethodRow k="이익 감소" v="EPS 성장률 ≤ 0" />
              <MethodRow k="빚 과다" v="부채비율 ≥ 200" />
              <MethodRow k="매출 급감" v="매출 성장률 ≤ −15%" />
            </div>
            <div style={{ marginTop: 4 }}>
              현재가가 없거나 5개 축 중 3개 미만만 계산되면 '데이터 부족'으로 탈락시킵니다.<br />
              지표가 아예 공시되지 않은 경우는 탈락시키지 않습니다(면제 — 없는 걸 벌주지 않음).
            </div>
          </MethodBlock>

          <MethodBlock title="함정 방지 장치">
            <b>섹터 중립</b>: 섹터상대PER = 내 PER ÷ 같은 섹터 중앙값 PER.<br />
            은행(원래 저PER)을 반도체(원래 고PER)와 직접 비교하지 않습니다.<br />
            <b>PEG 성장률 상한 50%</b>: 적자 저점에서 회복하며 성장률이 497%처럼 찍히면 PEG가 0에 수렴해 저평가로 오인됩니다.<br />
            이를 막기 위해 PEG 계산 시 성장률을 50%로 자릅니다.
          </MethodBlock>
        </>)}

        {qtype === 'etf' && (<>
          <MethodBlock title="ETF 점수 = 추세 50% · 저비용 25% · 규모 25%">
            각 항목을 같은 그룹 안에서 백분위(0~100)로 환산한 뒤 가중합합니다.<br />
            추세는 최근 수익률 흐름, 저비용은 보수율(낮을수록 유리), 규모는 순자산(AUM)입니다.<br />
            한국 ETF는 보수율·AUM이 미제공인 경우가 많아 추세·거래량 위주로 평가되고, 그만큼 완성도 감점을 받습니다.
          </MethodBlock>
        </>)}

        {qtype === 'innov' && (<>
          <MethodBlock title="저점발굴 4요소 — 아직 적자인 혁신주용">
            이익이 없어 PEG를 쓸 수 없는 종목이라 <b>이익 기반 지표를 쓰지 않습니다</b>.<br />
            <div style={{ marginTop: 4 }}>
              <MethodRow k="저평가" v="PSR ÷ R&D집중도 (변형 밸류)" />
              <MethodRow k="파이프라인" v="매출 대비 R&D 투자 강도" />
              <MethodRow k="바닥다지기" v="120일선 돌파 + 저변동성 + 거래량 유입" />
              <MethodRow k="생존력" v="보유 현금으로 적자를 버틸 햇수(런웨이)" />
            </div>
            <div style={{ marginTop: 4 }}>
              변동성이 매우 큰 고위험 위성(satellite) 후보라 소액 분산이 원칙입니다.<br />
              미국 혁신주 큐레이션에 한정되며, 임상 단계 바이오는 이진(성공/실패) 이벤트 리스크가 별도로 존재합니다.
            </div>
          </MethodBlock>
        </>)}

        <MethodBlock title="데이터 출처 · 한계 (Reference)">
          재무·추정치·목표가·가격: <b>Yahoo Finance</b>. 한국 종목 가격 보조: <b>네이버 금융</b>.<br />
          한국 종목은 애널리스트 추정치·목표가가 일부 미제공이라 '—'로 표시되고 완성도 감점을 받습니다.<br />
          점수는 <b>상승 확률이 아니라 같은 그룹 내 상대 순위</b>입니다. 70점이 "70% 오른다"는 뜻이 절대 아닙니다.<br />
          방법론: GARP(Growth at a Reasonable Price) 계열 · 애널리스트 추정치 상향 합성(Guerard CTEF 계열)을 참고했습니다.<br />
          갱신 주기: 매일 자동 스캔. 지표는 공시 시점 기준이라 최신 뉴스가 반영되기까지 시차가 있습니다.<br />
          본 점수는 <b>투자 판단의 참고 자료</b>이며 투자 권유가 아닙니다. 최종 판단과 책임은 투자자 본인에게 있습니다.
        </MethodBlock>
      </div>
    </details>
  )
}

const EXCH = { NMS: '나스닥', NGM: '나스닥', NCM: '나스닥', NYQ: 'NYSE', PCX: 'NYSE Arca',
  ASE: 'NYSE American', KSC: '코스피', KOE: '코스닥', KDQ: '코스닥' }
const FAIL_KO = { 'PEG>1.5': '성장 대비 비쌈', 'EPS성장≤0': '이익 감소', '부채비율≥200': '빚 과다', '매출 급감': '매출 급감' }

const mktKo = (m) => (m === 'KR' ? '한국' : m === 'US' ? '미국' : m)
// AI 심층 분석 추천 색상 (매수 긍정 / 매도 부정 / 보유 중립)
const recoColor = (r) => r === '매수' ? 'var(--m-positive)' : r === '매도' ? 'var(--m-negative)' : 'var(--m-text-secondary)'
// 임상 단계 바이오 — PSR·런웨이로 못 잡는 이진 임상 이벤트 리스크. 백엔드 _BIO_CLINICAL_CATS와 일치.
const BIO_CLINICAL = new Set(['AI 신약', 'AI 항체', '유전자편집', '유전자치료', '유전체', '합성생물학'])
// 종합점수 → 컨빅션 등급 (투자자가 한눈에 강도를 알 수 있게)
const convLabel = (s) => s >= 80 ? { t: '강력', c: 'var(--m-primary)' }
  : s >= 70 ? { t: '추천', c: 'var(--m-primary)' }
  : s >= 60 ? { t: '관심', c: 'var(--m-text-secondary)' } : null
const fmtPrice = (v, m) => v == null ? '—' : (m === 'KR' ? '₩' + Math.round(v).toLocaleString() : '$' + Number(v).toFixed(2))
const fmtPe = (v) => v == null ? '—' : Number(v).toFixed(1) + '배'
const fmtPct = (v) => v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v) + '%'

function agoLabel(epoch) {
  if (!epoch) return null
  const h = Math.max(0, (Date.now() / 1000 - epoch) / 3600)
  return h < 1 ? '방금 갱신' : h < 24 ? `${Math.round(h)}시간 전` : `${Math.round(h / 24)}일 전`
}
function valNote(row) {
  const p = []
  if (row.peg != null) p.push(row.peg < 1 ? '성장 대비 저평가(PEG<1)' : row.peg <= 1.5 ? '성장 대비 적정(PEG≤1.5)' : '성장 대비 비쌈')
  if (row.forward_pe != null && row.trailing_pe != null && row.forward_pe < row.trailing_pe)
    p.push('선행PER<후행 → 이익 증가 예상')
  if (row.analyst_upside != null) p.push(`목표가까지 ${fmtPct(row.analyst_upside)} 여력`)
  return p.join(' · ') || '추가 밸류 지표 제한적(한국 종목)'
}

const td = { padding: '8px 7px', fontSize: 12, color: 'var(--m-text)', whiteSpace: 'nowrap' }
const th = { padding: '6px 7px', fontSize: 11, fontWeight: 700, color: 'var(--m-text-secondary)', whiteSpace: 'nowrap' }

// 문장이 끝나면 줄바꿈 — 숫자 소수점($75.2B)·약어는 보존(앞이 숫자/공백이 아닐 때만).
// ChartTab의 동일 헬퍼와 일치. whiteSpace:'pre-line'과 함께 써야 \n이 렌더됨.
const breakSentences = (text) =>
  typeof text === 'string' ? text.replace(/([^\d\s])([.?!])\s+/g, '$1$2\n').trim() : text

// 캐시된 AI 심층 분석 인라인 표시 — 있으면 핵심 요약(추천·촉매·리스크) 자동 노출(무과금 읽기),
// 없으면 라이브 생성 버튼. CLI 배치로 채워진 ai_cache(stock_v2)를 모든 사용자가 무료 열람.
function CachedAI({ ticker, name, onPick }) {
  const { data } = useQuery({
    queryKey: ['discoverAI', ticker],
    queryFn: () => getCachedAnalysis(ticker, name || ''),
    staleTime: 30 * 60_000,
  })
  const a = data?.cached ? data.data : null
  const aiAgo = data?.computed_at ? agoLabel(data.computed_at) : null
  const recColor = recoColor
  if (!a) {
    return (
      <button className="btn-primary" onClick={(e) => { e.stopPropagation(); onPick(ticker) }}
        style={{ marginTop: 10, fontSize: 12, padding: '7px 14px' }}>AI 심층 분석 보기 →</button>
    )
  }
  return (
    <div style={{ marginTop: 10, background: 'var(--m-surface)', border: '1px solid var(--m-outline-variant)', borderRadius: 4, padding: '9px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--m-text-secondary)' }}>AI 심층</span>
        {a.recommendation && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 2,
          color: recColor(a.recommendation), border: `1px solid ${recColor(a.recommendation)}` }}>{a.recommendation}</span>}
        {aiAgo && <span style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', marginLeft: 'auto' }}>분석 {aiAgo}</span>}
      </div>
      <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--m-text)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{breakSentences(a.summary)}</div>
      {(a.catalysts_short?.[0] || a.bear?.[0]) && (
        <div style={{ display: 'grid', gap: 4, marginTop: 7 }}>
          {a.catalysts_short?.[0] && <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            <b style={{ color: 'var(--m-positive)' }}>촉매</b> {breakSentences(a.catalysts_short[0])}</div>}
          {a.bear?.[0] && <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            <b style={{ color: 'var(--m-negative)' }}>리스크</b> {breakSentences(a.bear[0])}</div>}
        </div>
      )}
      <button className="btn-primary" onClick={(e) => { e.stopPropagation(); onPick(ticker) }}
        style={{ marginTop: 9, fontSize: 12, padding: '7px 14px' }}>전체 분석 보기 →</button>
    </div>
  )
}

function DetailPanel({ row, onPick }) {
  const radarData = AXES.map(ax => ({ axis: ax.label, v: axVal(row, ax) }))
  const kv = (label, value, hint) => (
    <div title={hint || ''} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
  const exch = EXCH[row.exchange] || row.exchange || mktKo(row.market)
  const type = row.quote_type === 'ETF' ? 'ETF' : '개별종목'
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 6px 4px', alignItems: 'flex-start' }}>
      {/* 레이더 인포그래픽 */}
      <div style={{ flex: '0 0 200px', maxWidth: 220 }}>
        <ResponsiveContainer width="100%" height={170}>
          <RadarChart data={radarData} outerRadius="68%">
            <PolarGrid stroke="var(--m-outline-variant)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'var(--m-text-secondary)' }} />
            <Radar dataKey="v" stroke="#1F4FD3" fill="#1F4FD3" fillOpacity={0.22}
              connectNulls isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10.5, marginTop: 6 }}>
          {AXES.map(ax => {
            const v = axVal(row, ax)
            const w = AXIS_WEIGHT[ax.key]?.[row.market === 'KR' ? 1 : 0]
            return <div key={ax.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ color: 'var(--m-text-secondary)', fontWeight: 700 }}>{ax.label}</span>
                {w != null && <span style={{ color: 'var(--m-text-tertiary)', fontSize: 9, marginLeft: 4 }}>가중치 {w}%</span>}
                <br /><span style={{ color: 'var(--m-text-tertiary)', fontSize: 9.5 }}>{ax.crit}</span>
              </span>
              <b style={{ flexShrink: 0, color: v == null ? 'var(--m-text-tertiary)' : 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : Math.round(v)}</b>
            </div>
          })}
        </div>
        <div className="ko-keep" style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', marginTop: 8, lineHeight: 1.5,
          borderTop: '1px solid var(--m-outline-variant)', paddingTop: 7 }}>
          <b style={{ color: 'var(--m-text-secondary)' }}>종합 {Math.round(row.composite_score)}</b> = 5축 <b>가중합 × 완성도({row.data_completeness}/5)</b>.
          단순 평균이 아니라, 각 축을 <b>같은 시장 내 백분위</b>로 환산 후 위 가중치로 합산하고 결측을 감점합니다.
        </div>
      </div>
      {/* 밸류에이션 + 메타 */}
      <div style={{ flex: '1 1 280px', minWidth: 240 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '9px 10px' }}>
          {kv('현재가', fmtPrice(row.current_price, row.market))}
          {kv('목표가', fmtPrice(row.target_price, row.market), '애널리스트 평균 목표주가')}
          {kv('상승여력', <span className={row.analyst_upside > 0 ? 'num-pos' : row.analyst_upside < 0 ? 'num-neg' : ''}>{fmtPct(row.analyst_upside)}</span>, '목표가 대비 현재가 상승여력')}
          {kv('순이익률', row.profit_margin == null ? '—' : Math.round(row.profit_margin) + '%', '매출 중 순이익 비율')}
          {kv('PER', fmtPe(row.trailing_pe), '후행 주가수익비율 — 낮을수록 쌈')}
          {kv('선행PER', fmtPe(row.forward_pe), '추정이익 기준 PER')}
          {kv('PEG', row.peg == null ? '—' : Number(row.peg).toFixed(2), '성장 대비 밸류 — 1 이하 저평가')}
          {kv('데이터', `${row.data_completeness}/5`, '5개 요소 중 평가에 쓰인 수')}
        </div>
        <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-secondary)', marginTop: 9, lineHeight: 1.5 }}>
          💡 {valNote(row)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
          <span>{mktKo(row.market)} · {exch}</span><span>·</span><span>{type}</span><span>·</span><span>{row.sector}</span>
          {!row.gate_pass && <span style={{ color: 'var(--m-negative)' }}>· 기준 미달: {FAIL_KO[row.gate_fail_reason] || row.gate_fail_reason}</span>}
        </div>
        <CachedAI ticker={row.ticker} name={row.name} onPick={onPick} />
      </div>
    </div>
  )
}

function fmtAum(v) {
  if (v == null) return '—'
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'
  return '$' + Math.round(v).toLocaleString()
}

/* ETF 추천 요약 — 규칙 기반(AI 웹리서치 아님). row 지표에서 스탠스+근거를 도출.
   추세(pct_momentum)·저비용(pct_value)·규모(pct_quality)와 원지표(보수율·AUM·6개월수익률) 사용. */
function etfVerdict(row) {
  const comp = row.composite_score, mom = row.pct_momentum
  const er = row.expense_ratio, aum = row.aum, ret6 = row.ret_6m
  let label, tone
  if (comp >= 70) { label = '적극 관심'; tone = 'pos' }
  else if (comp >= 55) { label = '관심'; tone = 'pos' }
  else { label = '중립·관망'; tone = 'neu' }
  const pts = []
  if (ret6 != null) pts.push(ret6 >= 0 ? `최근 6개월 +${Math.round(ret6)}%로 상승 추세` : `최근 6개월 ${Math.round(ret6)}%로 부진 — 진입 시점 유의`)
  else if (mom != null) pts.push(mom >= 60 ? '최근 추세 상위권' : mom <= 40 ? '최근 추세 약세' : '추세 중립')
  if (er != null) pts.push(er <= 0.1 ? `보수율 ${er}%로 초저비용 — 장기 보유에 유리` : er <= 0.3 ? `보수율 ${er}%로 저비용` : `보수율 ${er}%로 다소 높음`)
  if (aum != null) pts.push(aum >= 1e10 ? '순자산 대형 — 유동성·안정성 양호' : aum >= 1e9 ? '순자산 중형' : '순자산 소형 — 유동성 주의')
  if (pts.length === 0) pts.push('한국 ETF는 보수율·순자산 미제공이라 추세 위주로만 평가됨')
  return { label, tone, body: pts.join(' · ') + '.' }
}

function EtfDetail({ row, onPick }) {
  const ev = etfVerdict(row)
  const evc = ev.tone === 'pos' ? 'var(--m-positive)' : 'var(--m-text-secondary)'
  const kv = (label, value, hint) => (
    <div title={hint || ''} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>)
  const exch = EXCH[row.exchange] || row.exchange || mktKo(row.market)
  const fac = (label, v) => (
    <span style={{ color: 'var(--m-text-secondary)' }}>{label} <b style={{ color: v == null ? 'var(--m-text-tertiary)' : 'var(--m-text)' }}>{v == null ? '—' : Math.round(v)}</b></span>)
  return (
    <div style={{ padding: '10px 8px 6px' }}>
      {/* 추천 요약 (규칙 기반) — 스탠스 + 근거 */}
      <div style={{ border: '1px solid var(--m-outline-variant)', background: 'var(--m-surface-variant)',
        borderRadius: 4, padding: '9px 11px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 1, background: evc, flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: evc }}>추천 요약 · 규칙 기반</span>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, color: evc }}>{ev.label}</span>
        </div>
        <p className="ko-keep" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: 'var(--m-text-secondary)' }}>{ev.body}</p>
        <p className="ko-keep" style={{ margin: '5px 0 0', fontSize: 10, lineHeight: 1.5, color: 'var(--m-text-tertiary)' }}>
          ETF는 개별 종목이 아니라 지수·테마를 추종해 분산 효과가 있습니다.<br />
          다만 테마 집중 위험은 함께 봐야 하며, 더 깊은 분석은 아래 「차트·분석 보기」의 AI 심층 분석을 확인하세요.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, marginBottom: 9 }}>
        {fac('추세', row.pct_momentum)} {fac('저비용', row.pct_value)} {fac('규모', row.pct_quality)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '9px 10px' }}>
        {kv('현재가', fmtPrice(row.current_price, row.market))}
        {kv('6개월 수익률', <span className={row.ret_6m > 0 ? 'num-pos' : row.ret_6m < 0 ? 'num-neg' : ''}>{fmtPct(row.ret_6m)}</span>, '최근 6개월 가격 수익률')}
        {kv('보수율', row.expense_ratio == null ? '—' : row.expense_ratio + '%', 'ETF 연간 운용보수')}
        {kv('순자산(AUM)', fmtAum(row.aum), '운용 규모')}
      </div>
      <div className="ko-keep" style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)', marginTop: 9, lineHeight: 1.5 }}>
        {mktKo(row.market)} · {exch} · ETF · {row.sector} · 추세 50%·저비용 25%·규모 25%로 평가
        {row.market === 'KR' && ' · 한국 ETF는 보수율·AUM 미제공(추세·거래량 기준)'}
      </div>
      <button className="btn-primary" onClick={(e) => { e.stopPropagation(); onPick(row.ticker) }}
        style={{ marginTop: 10, fontSize: 12, padding: '7px 14px' }}>차트·분석 보기 →</button>
    </div>
  )
}

const fmtRunway = (v) => v == null ? '—' : v >= 99 ? '흑자(소진 없음)' : v >= 10 ? '10년+' : Number(v).toFixed(1) + '년'
const fmtRnd = (v) => v == null ? '—' : Math.round(v * 100) + '%'

function InnovDetail({ row, onPick }) {
  const radarData = INNOV_AXES.map(ax => ({ axis: ax.label, v: axVal(row, ax) }))
  const kv = (label, value, hint) => (
    <div title={hint || ''} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--m-text-tertiary)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>)
  const exch = EXCH[row.exchange] || row.exchange || mktKo(row.market)
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 6px 4px', alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 200px', maxWidth: 220 }}>
        <ResponsiveContainer width="100%" height={170}>
          <RadarChart data={radarData} outerRadius="68%">
            <PolarGrid stroke="var(--m-outline-variant)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'var(--m-text-secondary)' }} />
            <Radar dataKey="v" stroke="#1F4FD3" fill="#1F4FD3" fillOpacity={0.22}
              connectNulls isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, marginTop: 4 }}>
          {INNOV_AXES.map(ax => {
            const v = axVal(row, ax)
            return <div key={ax.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--m-text-secondary)' }}>
              <span>{ax.label}<InfoTip text={ax.desc} label={ax.label} size={11} /></span>
              <b style={{ color: v == null ? 'var(--m-text-tertiary)' : 'var(--m-text)', fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : Math.round(v)}</b>
            </div>
          })}
        </div>
      </div>
      <div style={{ flex: '1 1 280px', minWidth: 240 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '9px 10px' }}>
          {kv('현재가', fmtPrice(row.current_price, row.market))}
          {kv('PSR', row.psr == null ? '—' : Number(row.psr).toFixed(1) + '배', '주가매출비율 — 적자기업 밸류(이익이 없어 PER 대신)')}
          {kv('R&D집중도', fmtRnd(row.rnd_intensity), '연구개발비 ÷ 매출 — 파이프라인 투자 강도')}
          {kv('런웨이', fmtRunway(row.runway_years), '보유현금으로 적자를 버틸 수 있는 햇수 (생존력)')}
          {kv('52주 위치', row.near_52w_high == null ? '—' : Math.round(row.near_52w_high * 100) + '%', '고점 대비 현재가 위치 — 낮을수록 저점권')}
          {kv('데이터', `${row.data_completeness}/4`, '4개 요소 중 평가에 쓰인 수')}
        </div>
        <div className="ko-keep" style={{ fontSize: 11, color: 'var(--m-text-secondary)', marginTop: 9, lineHeight: 1.6 }}>
          💡 적자 단계의 AI·바이오 혁신주를 <b>이익(PEG)이 아니라 매출·파이프라인·바닥다지기·생존력</b>으로 평가합니다.<br />
          PSR이 R&D집중도 대비 낮을수록 “파이프라인이 주가에 덜 반영”된 저점 후보예요.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, fontSize: 10.5, color: 'var(--m-text-tertiary)' }}>
          <span>{mktKo(row.market)} · {exch}</span><span>·</span><span>{row.sector}</span>
          <span style={{ color: 'var(--m-negative)', fontWeight: 700 }}>· ⚠ 고위험 위성(satellite) — 변동성 큼, 소액 분산</span>
          {!row.gate_pass && <span style={{ color: 'var(--m-negative)' }}>· 기준 미달: {row.gate_fail_reason}</span>}
        </div>
        <CachedAI ticker={row.ticker} name={row.name} onPick={onPick} />
      </div>
    </div>
  )
}

export default function DiscoverTab() {
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)
  const currentUser = useStore(s => s.currentUser)
  const isAdmin = !!currentUser?.is_admin

  const [qtype, setQtype] = useState('stock')   // 'stock'(개별종목) | 'etf' | 'innov'(저점발굴)
  const [market, setMarket] = useState('ALL')
  // 품질 필터 = 단일 축 3단계 (추천만 ⊂ 기준통과 ⊂ 전체). 기존 2컨트롤(strongOnly+includeFailed) 통합.
  const [grade, setGrade] = useState('reco')   // 'reco'(추천만·≥60) | 'pass'(기준통과) | 'all'(전체·미달포함)
  const strongOnly = grade === 'reco'          // 파생 — 기존 참조부(쿼리·메시지) 무변경
  const includeFailed = grade === 'all'
  const [expanded, setExpanded] = useState(null)
  const [rescanMsg, setRescanMsg] = useState('')
  // 검색·필터·정렬 (클라이언트)
  const [q, setQ] = useState('')
  const [secFilter, setSecFilter] = useState(() => new Set())   // 빈 set = 전체 섹터
  const [sortKey, setSortKey] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')
  const isEtf = qtype === 'etf'
  const isInnov = qtype === 'innov'

  const { data, isLoading, error } = useQuery({
    queryKey: ['discover', market, includeFailed, qtype, strongOnly],
    queryFn: () => getDiscover({ market, sort: 'score', include_failed: includeFailed,
      min_score: strongOnly ? 60 : 0, limit: 200, qtype }),
    staleTime: 10 * 60_000,
  })
  const items = data?.items || []
  const ago = agoLabel(data?.computed_at)

  const sectors = useMemo(
    () => [...new Set(items.map(r => r.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [items])

  const view = useMemo(() => {
    let arr = items
    const qq = q.trim().toLowerCase()
    if (qq) arr = arr.filter(r =>
      (r.name || '').toLowerCase().includes(qq) || (r.ticker || '').toLowerCase().includes(qq) ||
      (r.sector || '').toLowerCase().includes(qq) || mktKo(r.market).includes(qq))
    if (secFilter.size) arr = arr.filter(r => secFilter.has(r.sector))
    const dir = sortDir === 'asc' ? 1 : -1
    const numKey = ['analyst_upside', 'composite_score', 'ret_6m', 'pct_momentum'].includes(sortKey)
    const val = (r) => sortKey === 'name' ? (r.name || r.ticker) : sortKey === 'market'
      ? mktKo(r.market) : sortKey === 'sector' ? (r.sector || '') : r[sortKey]
    return [...arr].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (numKey) {
        if (va == null && vb == null) return 0
        if (va == null) return 1                 // 값 없음은 항상 뒤로
        if (vb == null) return -1
        return (va - vb) * dir
      }
      return String(va).localeCompare(String(vb), 'ko') * dir
    })
  }, [items, q, secFilter, sortKey, sortDir])

  function sortBy(key) {
    if (sortKey === key) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return }
    setSortKey(key)
    setSortDir(['name', 'ticker', 'market', 'sector'].includes(key) ? 'asc' : 'desc')
  }
  const arrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
  function toggleSector(s) {
    setSecFilter(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  }

  async function onRescan() {
    setRescanMsg('갱신 요청 중…')
    try {
      const r = await rescanDiscover()
      if (r.status === 'started') {
        setRescanMsg('갱신 시작 — 7~10분 후 자동 반영됩니다.')
        setTimeout(() => { qc.invalidateQueries({ queryKey: ['discover'] }); setRescanMsg('') }, 600_000)
      } else if (r.status === 'already_running') setRescanMsg('이미 갱신 중입니다.')
      else setRescanMsg('')
    } catch (e) { setRescanMsg(e.response?.data?.detail || '갱신 실패') }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="mono-card" style={{ marginBottom: 10 }}>
        <div className="mono-section-header">
          <div>
            <div className="mono-section-title is-accent">신규 종목 발굴</div>
            <div className="mono-section-sub ko-keep">
              {isEtf
                ? <>ETF를 <b>추세 50% · 저비용 25% · 규모 25%</b>로 점수화. 행을 누르면 6개월 수익률·보수율·순자산 상세가 펼쳐집니다. 한국 ETF는 보수율·AUM 미제공이라 추세·거래량 위주예요.</>
                : isInnov
                ? <>아직 적자인 <b>AI·바이오 혁신/턴어라운드</b> 종목을 이익(PEG)이 아니라 <b>저평가(PSR÷R&D) · 파이프라인 · 바닥다지기 · 생존력</b>으로 점수화한 <b>저점 후보</b>입니다. 변동성이 큰 <b>고위험 위성(satellite)</b>이라 소액 분산이 원칙이에요. 미국 혁신주 큐레이션 한정.</>
                : <>성장하면서도 저평가된 종목을 5요소로 점수화. <b>행을 누르면</b> 5요소 레이더와 목표가·상승여력·PER 등 상세가 펼쳐집니다.</>}
              {' '}점수는 상승 확률이 아니라 같은 그룹 내 상대 순위예요.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <div className="seg-ctrl">
            {[['stock', '개별종목'], ['etf', 'ETF'], ['innov', '저점발굴']].map(([v, l]) => (
              <button key={v} onClick={() => { setQtype(v); setExpanded(null); setSecFilter(new Set())
                setSortKey('composite_score'); setSortDir('desc'); if (v === 'innov') setGrade('pass') }}
                className={`seg-btn ${qtype === v ? 'active' : ''}`} style={{ fontSize: 11, fontWeight: 700 }}>{l}</button>))}
          </div>
          {!isInnov && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="filter-axis-label">시장</span>
              <div className="seg-ctrl">
                {[['ALL', '전체'], ['US', '미국'], ['KR', '한국']].map(([v, l]) => (
                  <button key={v} onClick={() => setMarket(v)} className={`seg-btn ${market === v ? 'active' : ''}`} style={{ fontSize: 11 }}>{l}</button>))}
              </div>
            </div>
          )}
          {/* 품질 = 단일 축 3단계 (기존 '추천만/전체' 세그 + '기준 미달도' 체크박스 통합) */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            title="추천만: 종합 60점 이상 · 기준통과: 최소 기준(PEG·성장·부채) 통과 전체 · 전체: 기준 미달 종목까지 포함(참고용)">
            <span className="filter-axis-label">등급</span>
            <div className="seg-ctrl">
              {[['reco', '추천만'], ['pass', '기준통과'], ['all', '전체']].map(([v, l]) => (
                <button key={v} onClick={() => setGrade(v)} className={`seg-btn ${grade === v ? 'active' : ''}`} style={{ fontSize: 11 }}>{l}</button>))}
            </div>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 종목·티커·섹터 검색"
            style={{ fontSize: 11.5, padding: '5px 9px', borderRadius: 4, border: '1px solid var(--m-outline-variant)',
              background: 'var(--m-surface)', color: 'var(--m-text)', width: 170, fontFamily: 'inherit' }} />
          <details style={{ position: 'relative' }}>
            <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--m-text-secondary)', cursor: 'pointer',
              listStyle: 'none', padding: '5px 9px', border: '1px solid var(--m-outline-variant)', borderRadius: 4 }}>
              섹터{secFilter.size ? ` (${secFilter.size})` : ' ▾'}
            </summary>
            <div style={{ position: 'absolute', zIndex: 20, marginTop: 4, maxHeight: 240, overflowY: 'auto',
              background: 'var(--m-surface)', border: '1px solid var(--m-outline-variant)', borderRadius: 4,
              padding: 8, minWidth: 150, boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
              {secFilter.size > 0 && (
                <button onClick={() => setSecFilter(new Set())} className="btn-secondary"
                  style={{ fontSize: 10, padding: '3px 7px', marginBottom: 6, width: '100%' }}>전체 해제</button>)}
              {sectors.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  color: 'var(--m-text)', padding: '3px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={secFilter.has(s)} onChange={() => toggleSector(s)} /> {s}
                </label>))}
            </div>
          </details>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>{ago ? `${ago} · 매일 자동` : '매일 자동'}</span>
            {isAdmin && <button onClick={onRescan} className="btn-secondary" style={{ fontSize: 11, padding: '4px 9px' }}>지금 갱신</button>}
          </span>
        </div>
      </div>

      <ScoringMethodology qtype={qtype} />

      {rescanMsg && <div className="ko-keep" style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 4, background: 'var(--m-surface-variant)', color: 'var(--m-text-secondary)', fontSize: 11.5 }}>{rescanMsg}</div>}

      {isLoading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--m-text-tertiary)', fontSize: 12 }}>불러오는 중…</div>
      ) : error ? (
        <div className="ko-keep" style={{ padding: 12, borderRadius: 4, border: '1px solid var(--m-negative)', color: 'var(--m-negative)', fontSize: 12 }}>발굴 데이터를 불러오지 못했습니다.</div>
      ) : items.length === 0 ? (
        <div className="mono-card ko-keep" style={{ textAlign: 'center', color: 'var(--m-text-secondary)', fontSize: 12.5, lineHeight: 1.7, padding: 24 }}>
          아직 발굴 결과가 없습니다. 매일 장 마감 후 자동 갱신됩니다.{!includeFailed && ' (등급 필터를 「전체」로 바꿔 보세요.)'}
        </div>
      ) : (
        <div className="mono-card" style={{ padding: '4px 6px', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('name')} title="클릭: 오름/내림 정렬">종목{arrow('name')}</th>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('ticker')} title="클릭: 정렬">티커{arrow('ticker')}</th>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('market')} title="클릭: 정렬">국가{arrow('market')}</th>
                <th style={{ ...th, textAlign: 'left', cursor: 'pointer' }} onClick={() => sortBy('sector')} title="클릭: 정렬">{isEtf ? '테마' : isInnov ? '분야' : '섹터'}{arrow('sector')}</th>
                {isEtf ? (
                  <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy('ret_6m')} title="최근 6개월 수익률 · 클릭: 정렬">6개월{arrow('ret_6m')}</th>
                ) : isInnov ? (
                  <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy('pct_momentum')} title="바닥다지기 점수(0~100) — 장기 바닥 반등 강도 · 클릭: 정렬">바닥다지기{arrow('pct_momentum')}</th>
                ) : (
                  <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy('analyst_upside')} title="목표가 대비 상승여력(미국) · 클릭: 정렬">상승여력{arrow('analyst_upside')}</th>
                )}
                <th style={{ ...th, textAlign: 'right', color: 'var(--m-text)', cursor: 'pointer' }} onClick={() => sortBy('composite_score')} title="5축 가중합 × 완성도(결측 감점) — 단순 평균 아님 · 클릭: 정렬">종합{arrow('composite_score')}</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--m-text-tertiary)', padding: '24px' }}>
                  검색·필터 결과가 없습니다.</td></tr>
              )}
              {view.map(row => {
                const open = expanded === row.ticker
                const failed = !row.gate_pass
                return (
                  <React.Fragment key={row.ticker}>
                    <tr onClick={() => setExpanded(open ? null : row.ticker)} className="discover-row"
                      style={{ cursor: 'pointer', opacity: failed ? 0.6 : 1 }}>
                      <td style={{ ...td, maxWidth: 160 }}>
                        <span style={{ color: 'var(--m-text-tertiary)', marginRight: 4, fontSize: 9 }}>{open ? '▼' : '▶'}</span>
                        <span style={{ fontWeight: 800 }}>{row.name || row.ticker}</span>
                        {(() => { const cv = convLabel(row.composite_score); return cv && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '1px 5px',
                            borderRadius: 2, color: cv.c, border: `1px solid ${cv.c}` }}>{cv.t}</span>) })()}
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--m-text-tertiary)', fontWeight: 600 }}>{row.ticker}</td>
                      <td style={{ ...td, fontSize: 11.5, color: 'var(--m-text-secondary)' }}>{mktKo(row.market)}</td>
                      <td style={{ ...td, fontSize: 11.5, color: 'var(--m-text-secondary)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sector}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {isInnov
                          ? <span style={row.pct_momentum == null ? { color: 'var(--m-text-tertiary)' } : { fontWeight: 700 }}>{row.pct_momentum == null ? '—' : Math.round(row.pct_momentum)}</span>
                          : (() => { const v = isEtf ? row.ret_6m : row.analyst_upside
                              return <span className={v > 0 ? 'num-pos' : v < 0 ? 'num-neg' : ''}
                                style={v == null ? { color: 'var(--m-text-tertiary)' } : {}}>{fmtPct(v)}</span> })()}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontWeight: 900, fontSize: 14 }}>
                          {Math.round(row.composite_score)}
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--m-text-tertiary)', marginLeft: 2 }}>·{row.data_completeness}/{isEtf ? 3 : isInnov ? 4 : 5}</span>
                        </div>
                        {(row.ai_reco || (isInnov && BIO_CLINICAL.has(row.sector))) && (
                          <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center', marginTop: 2 }}>
                            {isInnov && BIO_CLINICAL.has(row.sector) && (
                              <span title="임상 이벤트 리스크 — PSR·런웨이로 측정 불가. 임상 성패 발표 시 주가가 하루에 ±30% 이상 급변할 수 있습니다."
                                style={{ fontSize: 8.5, fontWeight: 800, padding: '0 4px', borderRadius: 2, lineHeight: 1.5, cursor: 'help',
                                  color: 'var(--m-negative)', border: '1px solid var(--m-negative)' }}>⚠ 임상</span>)}
                            {row.ai_reco && (
                              <span title={`AI 심층 분석 의견: ${row.ai_reco} — 정량 점수와 별개의 질적 판단입니다. 행을 펼쳐 근거를 확인하세요.`}
                                style={{ fontSize: 8.5, fontWeight: 800, padding: '0 4px', borderRadius: 2, lineHeight: 1.5,
                                  color: recoColor(row.ai_reco), border: `1px solid ${recoColor(row.ai_reco)}` }}>AI {row.ai_reco}</span>)}
                          </div>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--m-surface-variant)', borderRadius: 4 }}>
                          {isEtf ? <EtfDetail row={row} onPick={setChartTicker} />
                            : isInnov ? <InnovDetail row={row} onPick={setChartTicker} />
                            : <DetailPanel row={row} onPick={setChartTicker} />}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ko-keep" style={{ fontSize: 10, color: 'var(--m-text-tertiary)', marginTop: 9, lineHeight: 1.5 }}>
        「종합」 옆 N/{isEtf ? 3 : isInnov ? 4 : 5} = 평가에 쓰인 요소 수. 레이더에서 빈 축은 '0점'이 아니라 '데이터 없음'입니다.
        {isInnov && ' 저점발굴은 적자 혁신주 특성상 변동성이 매우 큰 고위험 위성 자산 — 소액 분산이 원칙입니다.'} 투자 권유 아님 · 데이터 매일 자동 갱신.
      </div>
    </div>
  )
}

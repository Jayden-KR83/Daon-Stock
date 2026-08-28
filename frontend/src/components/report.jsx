import React from 'react'
import { useStore } from '../store'
import { maskText } from '../utils/privacy'
import BulletList, { splitToSentences } from './BulletList'

/* ══════════════════════════════════════════════════════════════════════
   리포트 표현 체계 — 종목 분석과 포트폴리오 분석이 같은 목소리를 내게 한다
   ══════════════════════════════════════════════════════════════════════
   2026-08-28 이전에는 같은 AI 리포트인데 탭마다 다른 글처럼 보였다.

     포트폴리오 분석 : 13px 제목 · 굵은 강조와 숫자 색상 · 회색 네모 불릿
     종목 분석       : 11.5px 대문자 제목 · 강조 없는 평문 · 번호 없음

   그래서 읽는 사람은 "같은 앱이 만든 리포트" 로 느끼지 못했다.
   실제 기업분석 보고서(셀사이드 리서치)의 관례를 기준으로 다음을 통일한다.

   ① 표지 — 무엇을·언제·무엇을 근거로 봤는지를 본문 위에 먼저 박는다.
      리서치 보고서는 항상 첫 화면에 의견·목표가·작성일·데이터 기준이 있다.
   ② 번호 매긴 섹션 — 01 · 02 … 로 목차성을 준다. 제목은 13px/800 하나로.
      한글 제목에 uppercase 는 아무 효과가 없고 라틴 문자만 들쭉날쭉해진다.
   ③ 리드 문장 — 섹션 첫 줄에 결론을 굵게. 훑는 사람이 결론만 읽고 넘어갈 수 있다.
   ④ 개조식 불릿 — 회색 네모 + 내어쓰기. 문장 단위로 끊는다.
   ⑤ 수치 강조 — 숫자·금액은 색과 굵기로 도드라지게. 리서치의 핵심은 숫자다.
   ⑥ 각주 — 근거·한계·면책은 마지막에 작은 회색으로.

   ⚠ 제목 크기·마커·강조 색을 이 파일 밖에서 다시 정의하지 말 것.
     한 곳에서만 바꿔야 두 탭이 계속 같은 얼굴을 유지한다.
   ══════════════════════════════════════════════════════════════════════ */

/* ── ⑤ 수치 강조 ────────────────────────────────────────────────────────
   숫자·퍼센트·금액을 글자색 + 굵게. 음수=빨강 / 양수=초록 / 중립=진한 글씨.
   (음영·직사각형 배경 금지 — design.md R1) */
export function NumHighlight({ text }) {
  /* AI 본문은 우리가 포맷하지 않은 문장이다. 가림 모드에서 여기가 뚫려
     '총자산 ₩618,010,693' 같은 문구가 그대로 보였다(2026-08-26 사고). */
  const privacyMode = useStore(s => s.privacyMode)
  text = maskText(text, privacyMode)
  if (!text) return null
  const re    = /(\+?-?\d+(?:,\d{3})*(?:\.\d+)?%?|₩\s*[\d,]+|\$\s*[\d,]+(?:\.\d+)?)/g
  const numRe = /^(\+?-?\d+(?:,\d{3})*(?:\.\d+)?%?|₩\s*[\d,]+|\$\s*[\d,]+(?:\.\d+)?)$/
  return (
    <>
      {String(text).split(re).map((p, i) => {
        if (!p) return null
        if (numRe.test(p)) {
          const klass = /^-/.test(p) ? 'num-neg' : /^\+/.test(p) ? 'num-pos' : 'num-neutral'
          return <span key={i} className={klass}
            style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{p}</span>
        }
        return <React.Fragment key={i}>{p}</React.Fragment>
      })}
    </>
  )
}

/* **어구** → 굵은 강조 + 강조색. AI 가 문장당 핵심 1개를 이렇게 표시한다. */
export function HighlightedText({ text, tone = 'neutral' }) {
  /* ⚠ **강조** 구간은 NumHighlight 를 거치지 않고 그대로 렌더된다.
     여기를 빼먹으면 정작 가장 중요한 금액만 가림을 통과한다. */
  const privacyMode = useStore(s => s.privacyMode)
  if (!text) return null
  const segs = String(maskText(text, privacyMode)).split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {segs.map((seg, si) => {
        const m = /^\*\*([^*]+)\*\*$/.exec(seg)
        if (m) {
          return <strong key={si} style={{ color: 'var(--m-primary)', fontWeight: 800 }}>{m[1]}</strong>
        }
        return <NumHighlight key={si} text={seg} />
      })}
    </>
  )
}

/* ── ④+⑤ 개조식 불릿 (강조 렌더러 포함) ────────────────────────────── */
export function ReportBullets({ items = [], text, small = false, tone = 'neutral',
                                color, bulletColor }) {
  /* text 를 주면 문장 단위로 잘라 항목으로 세운다(줄글 → 개조식). */
  const list = items && items.length ? items : splitToSentences(text)
  return (
    <BulletList items={list} small={small} color={color} bulletColor={bulletColor}
      renderItem={(s) => <HighlightedText text={s} tone={tone} />} />
  )
}

/* ── ② 섹션 머리 ────────────────────────────────────────────────────── */
export function ReportSectionHead({ no, title, accent, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8,
      paddingBottom: 6, borderBottom: '1px solid var(--m-outline-variant)' }}>
      {no != null && (
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.04em',
          color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums',
          flexShrink: 0 }}>
          {String(no).padStart(2, '0')}
        </span>
      )}
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-.01em',
        color: accent || 'var(--clr-text-strong)', lineHeight: 1.3 }}>
        {title}
      </span>
      {right && <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{right}</span>}
    </div>
  )
}

/* ── ③ 리드 문장 — 섹션의 결론 한 줄 ────────────────────────────────── */
export function ReportLead({ children, tone = 'neutral' }) {
  const color = tone === 'negative' ? 'var(--m-negative)'
              : tone === 'positive' ? 'var(--m-positive)'
              : 'var(--clr-text-strong)'
  return (
    <div className="ko-keep" style={{ fontSize: 12.5, fontWeight: 700, color,
      lineHeight: 1.65, marginBottom: 7 }}>{children}</div>
  )
}

/* 섹션 안의 작은 구분 라벨 (월가의 경고 · 리밸런싱 등) */
export function ReportLabel({ children, tone = 'neutral' }) {
  const color = tone === 'negative' ? 'var(--m-negative)'
              : tone === 'positive' ? 'var(--m-positive)'
              : 'var(--m-text-secondary)'
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, color,
      letterSpacing: '.03em', marginBottom: 4 }}>{children}</div>
  )
}

/* ── ① 표지 — 라벨/값 한 줄 나열 ────────────────────────────────────
   리서치 보고서 첫 장의 요약 블록. 값이 없는 항목은 아예 그리지 않는다
   (— 로 채우면 빈칸이 정보처럼 보인다). */
export function ReportMeta({ items = [] }) {
  const rows = items.filter(i => i && i.v != null && i.v !== '')
  if (!rows.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px',
      padding: '8px 0 10px', borderBottom: '1px solid var(--m-outline-variant)',
      marginBottom: 10 }}>
      {rows.map(({ k, v, color }) => (
        <div key={k} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em',
            color: 'var(--clr-text-muted)', textTransform: 'uppercase' }}>{k}</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.4,
            color: color || 'var(--clr-text-strong)',
            fontVariantNumeric: 'tabular-nums' }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

/* ── ⑥ 각주 — 근거·한계·면책 ────────────────────────────────────────── */
export function ReportFootnote({ children }) {
  return (
    <div className="ko-keep" style={{ marginTop: 10, padding: '8px 12px',
      borderRadius: 4, background: 'var(--clr-bg)',
      border: '1px solid var(--clr-border-md)',
      fontSize: 10, color: 'var(--clr-text-muted)', lineHeight: 1.8 }}>
      {children}
    </div>
  )
}

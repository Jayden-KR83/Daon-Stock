import React, { useRef, useState, useEffect } from 'react'

/**
 * 설계도 — 다온의 시스템 구조도.
 *
 * 2026-10-11 재작성. 처음에 ASCII 아트로 그렸다가 오너에게 "고양이가 그린 것 같다"는
 * 지적을 받았다. 맞는 말이라 **논리 다이어그램**으로 다시 그렸다 — 계층 밴드, 정렬된
 * 블록, 방향·레이블이 붙은 화살표.
 * 같이 뺀 것:
 *   · '화면' 장 — 가이드 탭이 이미 전 탭을 설명한다. 두 벌이면 어긋난다.
 *   · '순환' 장 — 고리를 **글로 정리**하는 건 요청이 아니었다. 고리는 만들어야 하는 것이다.
 *
 * 그리기 규칙(design.md):
 *   R1 플랫 — 좌측 색띠 없음, 4면 1px 테두리
 *   R2 유채색 — 계층마다 정규 팔레트 색 하나. 무채색으로 뭉개지 않는다
 *   R5 좁은 폭 — 다이어그램은 고정 좌표라 360px 에서 가로 스크롤로 푼다
 *   정렬 — 같은 역할 블록은 x 좌표와 폭을 공유한다. 눈대중으로 두지 않는다
 */

/* ── 다이어그램 ────────────────────────────────────────────────
   2026-10-11 재작성(2차). 1차는 고정 좌표 + minWidth:700 이라 폰에서 잘렸고
   가로 스크롤로 봐야 했다. 오너 지적: "한 눈에 보이게 해. 스크롤로 보이게 하지 말고."
   맞는 말이다 — 구조도는 전체가 한 번에 보여야 구조도다.

   그래서 좌표를 **폭에서 계산**한다. 좁으면 한 밴드의 블록이 여러 줄로 접히고,
   밴드 높이와 전체 높이가 거기에 맞춰 늘어난다. viewBox 가 내용에 맞으므로
   어떤 폭에서도 스크롤 없이 꽉 찬다. */

const C = {
  src:   '#0891B2',   // 외부 데이터
  job:   '#D97706',   // 수집·스케줄
  app:   '#1F4FD3',   // 애플리케이션
  store: '#7C3AED',   // 저장
  edge:  '#059669',   // 전달·클라이언트
}

/* 밴드 정의 — 블록은 {t: 제목, s: 부제}. 접히는 단위가 이 배열이다. */
const BANDS = [
  { key: 'src', label: '외부 데이터', color: C.src, flow: '시세 · 추론',
    items: [
      { t: '네이버 실시간', s: '한국 시세' },
      { t: 'Yahoo Finance', s: '미국 시세' },
      { t: 'Anthropic', s: 'AI 분석' },
    ] },
  { key: 'job', label: '수집 스케줄', color: C.job, flow: '주입',
    items: [
      { t: '일일 전략', s: '07:30 서버' },
      { t: '주간 25종목', s: '월 06:00 서버' },
      { t: '발굴 스캔', s: '07:00 서버' },
      { t: '보유 분석', s: '06:00 오너PC' },
    ] },
  { key: 'app', label: '애플리케이션', color: C.app, flow: '읽기 · 쓰기',
    head: { t: 'FastAPI', s: '127.0.0.1:8501' },
    items: [
      { t: '라우터', s: '143개' },
      { t: 'TTL 캐시', s: '' },
      { t: 'AI 호출', s: '' },
      { t: '섹터 정본', s: '' },
    ] },
  { key: 'store', label: '저장', color: C.store, flow: 'HTTP',
    head: { t: 'SQLite', s: 'daon.db' },
    items: [
      { t: 'portfolios', s: '' },
      { t: 'strategy_cache', s: '' },
      { t: 'ai_cache', s: '' },
      { t: 'users · accounts', s: '' },
    ] },
  { key: 'edge', label: '전달 · 클라이언트', color: C.edge, flow: '',
    items: [
      { t: 'nginx', s: '443 → 8501' },
      { t: 'Cloudflare', s: 'DNS · WAF' },
      { t: 'React PWA', s: 'daonwealth.com' },
    ] },
]

/** 폭에 맞는 레이아웃을 계산한다. 좌표를 손으로 적지 않는 이유 = 접힘을 지원해야 해서. */
function layout(narrow) {
  const W       = narrow ? 420 : 900
  const PAD     = 12
  const CW      = W - PAD * 2
  const GAP     = narrow ? 8 : 14
  const ITEM_H  = narrow ? 44 : 52
  const LABEL_H = 20          // 밴드 제목 줄
  const FLOW_H  = narrow ? 30 : 34   // 밴드 사이 화살표 공간

  const bands = []
  let y = 6
  for (const b of BANDS) {
    const n       = b.items.length
    const perRow  = narrow ? Math.min(2, n) : n
    const rows    = Math.ceil(n / perRow)
    const itemW   = (CW - GAP * (perRow - 1)) / perRow
    const headH   = b.head ? (narrow ? 26 : 28) : 0
    const bodyH   = rows * ITEM_H + (rows - 1) * GAP
    const boxTop  = y + LABEL_H
    const h       = LABEL_H + headH + bodyH + 10

    const items = b.items.map((it, i) => ({
      ...it,
      x: PAD + (i % perRow) * (itemW + GAP),
      y: boxTop + headH + Math.floor(i / perRow) * (ITEM_H + GAP),
      w: itemW, h: ITEM_H,
    }))
    bands.push({ ...b, y, h, labelY: y + 13, headY: boxTop, items, boxTop, bodyH, headH })
    y += h + FLOW_H
  }
  return { W, H: y - FLOW_H + 6, PAD, CW, bands, narrow, FLOW_H, ITEM_H }
}

function Diagram({ narrow }) {
  const L = layout(narrow)
  const fs = narrow ? { t: 11.5, s: 9, lab: 11, head: 11.5 }
                    : { t: 13,   s: 10.5, lab: 12, head: 13 }
  return (
    <svg viewBox={`0 0 ${L.W} ${L.H}`} width="100%" style={{ display: 'block' }}
      role="img" aria-label="다온 시스템 구조도">
      <defs>
        <marker id="dp-arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--m-text-tertiary)" />
        </marker>
      </defs>

      {L.bands.map((b, bi) => (
        <g key={b.key}>
          {/* 밴드 배경 — 계층을 색으로 구분(R2) */}
          <rect x={L.PAD - 6} y={b.y} width={L.CW + 12} height={b.h} rx="6"
            fill={b.color} fillOpacity="0.05" stroke={b.color} strokeOpacity="0.18" />
          <text x={L.PAD + 2} y={b.labelY} fontSize={fs.lab} fontWeight="800" fill={b.color}>
            {b.label}
          </text>

          {b.head && (
            <text x={L.PAD + 2} y={b.headY + 18} fontSize={fs.head} fontWeight="700"
              fill="var(--m-text)">
              {b.head.t}
              <tspan fontSize={fs.s} fontWeight="400" fill="var(--m-text-tertiary)"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                {'  ' + b.head.s}
              </tspan>
            </text>
          )}

          {b.items.map(it => (
            <g key={it.t}>
              <rect x={it.x} y={it.y} width={it.w} height={it.h} rx="4"
                fill="var(--m-surface)" stroke={b.color} strokeWidth="1.4" />
              <text x={it.x + it.w / 2} y={it.y + (it.s ? it.h / 2 - 2 : it.h / 2 + 4)}
                textAnchor="middle" fontSize={fs.t} fontWeight="700" fill="var(--m-text)">
                {it.t}
              </text>
              {it.s && (
                <text x={it.x + it.w / 2} y={it.y + it.h / 2 + 13} textAnchor="middle"
                  fontSize={fs.s} fill="var(--m-text-tertiary)">{it.s}</text>
              )}
            </g>
          ))}

          {/* 다음 밴드로 가는 화살표 — 가운데 한 줄. 방향이 곧 데이터 흐름이다. */}
          {bi < L.bands.length - 1 && (
            <>
              <line x1={L.W / 2} y1={b.y + b.h + 5} x2={L.W / 2} y2={b.y + b.h + L.FLOW_H - 7}
                stroke="var(--m-text-tertiary)" strokeWidth="1.5" markerEnd="url(#dp-arrow)" />
              {b.flow && (
                <text x={L.W / 2 + 9} y={b.y + b.h + L.FLOW_H / 2 + 3} fontSize={fs.s}
                  fill="var(--m-text-tertiary)">{b.flow}</text>
              )}
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

/* ── 다이어그램이 말하지 못하는 것만 표로 ───────────────────── */
const card = {
  border: '1px solid var(--m-outline-variant)', borderRadius: 4,
  padding: 12, marginBottom: 8, background: 'var(--m-surface)',
}
const h = { fontSize: 12.5, fontWeight: 800, color: 'var(--m-text)', marginBottom: 6 }
const dim = { fontSize: 11, color: 'var(--m-text-tertiary)', lineHeight: 1.65 }

const JOBS = [
  ['매일 07:30', '전략 리포트', '서버 cron', 'API 지갑', '1명 월 ≈ $1.8'],
  ['매주 월 06:00', '전략 + 종목 25', '서버 cron', 'API 지갑', '월 ≈ $8'],
  ['매일 07:00', '발굴 스캔', '서버 cron', '—', 'AI 미사용'],
  ['매일 06:00', '보유 종목 분석', '오너 PC 스케줄러', '구독 OAuth', '0원'],
]

export default function BlueprintSection() {
  /* 미디어쿼리가 아니라 **컨테이너 폭**을 본다. 같은 폰이라도 폴드를 펼치면 넓어지고,
     웹 모드에서는 사이드바에 밀려 좁아진다 — 창 크기만으로는 맞출 수 없다. */
  const boxRef = useRef(null)
  const [narrow, setNarrow] = useState(true)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setNarrow(el.clientWidth < 660)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div>
      <div style={card}>
        <div style={h}>시스템 구조</div>
        <div style={{ ...dim, marginBottom: 10 }}>
          <div>데이터는 위에서 아래로 한 방향으로만 흐릅니다.</div>
          <div>8501은 <code>127.0.0.1</code>에만 바인딩돼 외부에서 직접 닿지 않습니다 — 배포 확인도 운영 주소로 해야 합니다.</div>
        </div>
        {/* 가로 스크롤 래퍼를 쓰지 않는다 — 구조도는 전체가 한 번에 보여야 한다.
            대신 컨테이너 폭을 재서 좁으면 블록을 2열로 접는다. */}
        <div ref={boxRef}>
          <Diagram narrow={narrow} />
        </div>
      </div>

      <div style={card}>
        <div style={h}>자동 갱신 — 지갑이 둘이다</div>
        <div style={{ ...dim, marginBottom: 8 }}>
          <div>서버 cron 은 <strong>API 지갑</strong>(console.anthropic.com)을 씁니다.</div>
          <div>오너 PC 스케줄러는 <strong>구독 OAuth</strong>를 씁니다 — 충전과 무관합니다.</div>
          <div>AI 가 멈추면 어느 쪽이 멈췄는지부터 가려야 합니다.</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 360, fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--m-text-tertiary)', textAlign: 'left' }}>
                {['주기', '무엇', '어디서', '지갑', '비용'].map(t => (
                  <th key={t} style={{ fontWeight: 600, padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {JOBS.map(r => (
                <tr key={r[0] + r[1]} style={{ borderTop: '1px solid var(--m-outline-variant)' }}>
                  <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap', fontWeight: 700 }}>{r[0]}</td>
                  <td style={{ padding: '6px 8px 6px 0', color: 'var(--m-text-secondary)' }}>{r[1]}</td>
                  <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap', color: 'var(--m-text-secondary)' }}>{r[2]}</td>
                  <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap', color: 'var(--m-text-secondary)' }}>{r[3]}</td>
                  <td style={{ padding: '6px 0', whiteSpace: 'nowrap', color: 'var(--m-text-tertiary)' }}>{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

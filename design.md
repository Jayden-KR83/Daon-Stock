# 다온 디자인 시스템

> 마지막 업데이트: 2026-05-24
> 기반: Google **Material 3 (Material You)** + 핀테크 2024-2026 트렌드 (Robinhood, Toss, Cash App 분석)
> 목표: "AI가 흔히 만드는 카드 디자인" 탈피 — 큰 숫자/작은 라벨/둥근 모서리/그라데이션 배경의 식상한 패턴 제거

---

## 🚫 피해야 할 패턴 (Claude/AI 기본 디자인)

| ❌ 식상한 AI 패턴 | ✅ 우리가 지향하는 것 |
|---|---|
| 둥근 모서리 12~16px 카드 + soft shadow | **8px 직사각형** 또는 **무경계(borderless)**. 그림자는 최소 |
| 그라데이션 배경 (#EFF6FF → #F0F9FF) | 단색 surface + 1px hair-line border. 색은 콘텐츠로만 |
| 큰 숫자(30px) + 작은 라벨(9-10px) + 더 작은 sub | **라벨 12px / 숫자 18px** — 위계는 폰트 weight + color로 |
| 형광 그린/레드 강조 | 차분한 emerald(#059669) / amber(#D97706). neon 금지 |
| 이모지 단색 헤더 (💼📈🚀) | SVG line icon (1.5px stroke) 또는 무이모지 |
| 4개 동일 타일 grid | **불균등 grid** (primary 60% / secondary 40%) — 정보 위계 표현 |
| 모든 카드에 동일 패딩 16px | 정보 밀도에 따라 12 / 16 / 24px 분기 |
| "AI POWERED" / "NEW" 보라 그라데이션 배지 | 텍스트 라벨만 (caps · letter-spacing 4%) |

## ✅ Material 3 핵심 채택

### 1. **Tonal Color Roles** (단순 hex 대신 의미적 토큰)
M3는 primary/secondary/tertiary 각각에 0-100 tone scale (예: primary-40, primary-90)을 가짐.
다온은 단순화하여 4단계:

```
--m-primary       : 메인 액션·핵심 데이터 (예: 평가액)
--m-primary-container : primary의 약한 배경 (예: 강조 영역)
--m-on-primary    : primary 위 텍스트
--m-surface       : 카드 배경 (= 현재 --clr-surface)
--m-surface-variant: 카드 내부 구분 영역
--m-outline       : 1px 경계선
--m-outline-variant: 더 옅은 경계선 (그룹 구분용)
```

### 2. **Elevation = 그림자 대신 색조 차이**
M3는 그림자를 줄이고 **surface tint** (primary의 5-10% overlay)로 elevation 표현.
다온: `box-shadow` 최소화, **border-color 강도**로 elevation 위계 표현.

### 3. **Typography Scale** (M3 type system 축약)
| 역할 | 폰트 | 크기 | weight | letter-spacing |
|---|---|---|---|---|
| display-large | Manrope | 32px | 900 | -0.04em |
| display | Manrope | 24px | 800 | -0.03em |
| headline | Manrope | 18px | 800 | -0.02em |
| title | Inter/Pretendard | 14px | 700 | -0.01em |
| body | Inter | 13px | 500 | 0 |
| label | Inter | 11px | 700 | 0.05em (caps) |
| label-small | Inter | 9px | 700 | 0.06em (caps) |

### 4. **Shape Tokens** (각 모양에 의도)
M3는 4-28px의 8단계 corner radius. 다온은 5단계:
```
--m-radius-none   : 0   (제목 line, divider)
--m-radius-xs     : 4   (badge, tag, small button)
--m-radius-sm     : 8   (input, secondary button)
--m-radius-md     : 12  (card — 기본)
--m-radius-lg     : 16  (큰 컨테이너, modal)
--m-radius-full   : 999 (chip, avatar)
```

⚠️ 모든 카드에 `--m-radius-md` 강제하지 말 것. 콘텐츠 위계에 맞게.

### 5. **Motion Token** (이미 적용 중)
- **fast**: 100ms (hover, tap)
- **base**: 200ms (toggle, badge)
- **emphasized**: 320ms easeOutCubic [0.22, 0.61, 0.36, 1] (페이지 전환, 카드 reveal)

---

## 🎨 다온 전용 색상 토큰 (라이트 모드 기준)

```css
:root {
  /* Surface 계층 */
  --m-surface:          #FFFFFF;
  --m-surface-variant:  #F8FAFC;  /* 카드 내부 구분 */
  --m-surface-container:#F1F5F9;  /* 페이지 배경 */

  /* Primary (다온 메인 = 차분한 cobalt blue) */
  --m-primary:          #1F4FD3;
  --m-on-primary:       #FFFFFF;
  --m-primary-container:#E0E8FA;
  --m-on-primary-container: #001A4D;

  /* Financial Semantic */
  --m-positive:         #059669;  /* 수익 — emerald-600 (neon 금지) */
  --m-positive-container:#D1FAE5;
  --m-negative:         #DC2626;  /* 손실 — red-600 */
  --m-negative-container:#FEE2E2;
  --m-neutral:          #64748B;  /* 무변동 — slate-500 */

  /* AI/Premium accent (절제된 보라 — 그라데이션 X) */
  --m-accent:           #7C3AED;  /* violet-600 */
  --m-accent-container: #EDE9FE;

  /* Outline */
  --m-outline:          #CBD5E1;
  --m-outline-variant:  #E2E8F0;

  /* Text */
  --m-text:             #0F172A;
  --m-text-secondary:   #475569;
  --m-text-tertiary:    #94A3B8;
}
```

다크 모드는 동일 토큰명, 다른 색.

---

## 🧱 컴포넌트 패턴 (재사용 권장)

### Pattern 1: **Data Card** (카드 내 데이터 1개)
```
┌──────────────────────────────────┐
│ LABEL                  (선택) →  │   label-small + tertiary
│                                  │
│ 17.8억                            │   headline + text
│ +1,820만 (+1.13%)                │   body + positive
└──────────────────────────────────┘
- padding: 14px
- border: 1px solid outline-variant
- border-radius: 12px (md)
- shadow: 없음
- hover: outline → primary
```

### Pattern 2: **Metric Row** (한 줄에 여러 지표)
큰 숫자 4개 grid 대신 — **타임라인 또는 horizontal flow**.
```
평가액 17.8억  ┃  손익 +1.13%  ┃  보유 50종  ┃  계좌 4
```
- 굵은 구분자 `┃` 사용 (정보 위계)
- 모든 값 동일 크기 (label과 value를 가로로)

### Pattern 3: **Section Header** (탭 안 섹션 구분)
```
┃ 자산 추이 (Net Worth)              [1M][3M][1Y][ALL]
```
- 좌측 1px 색띠 (3px width, primary)
- title 14px / 700
- 우측에 toggle/action — segment control

### Pattern 4: **Empty State** (콘텐츠 없음)
- 큰 SVG icon (32-40px, outline only, opacity 0.4)
- 1줄 안내 (body)
- 1줄 다음 액션 (label, primary color, underlined)

### Pattern 5: **Insight Banner** (위계 있는 안내)
```
┌─[3px primary 띠]─────────────────────────┐
│ 종목 분산이 우수합니다                     │
│ 보유 50종 + 평균 상관계수 0.22 → 분산 효과 ↑│
└─────────────────────────────────────────┘
```
- 그라데이션 배경 X. 단색 surface-variant.
- 좌측 색띠로 의미 (primary/positive/warn/negative)
- title 13px + body 12px

---

## 🚥 금지/주의 (구체 사례)

| 사례 | 왜 금지 | 대신 |
|---|---|---|
| `background: linear-gradient(135deg, #EFF6FF, #F0F9FF)` | "soft pastel ai vibe" 1순위 | `background: var(--m-surface-variant)` |
| `border-radius: 16` + `padding: 18` + soft shadow | 모든 카드가 비슷해 보임 | md(12) 통일하되 padding 12/14/20 분기 |
| `fontSize: 22, fontWeight: 900` (모든 숫자) | 위계 무너짐 | 진짜 핵심 1개만 headline, 나머지 title |
| `<span>🚀</span> 단기·중기 호재` | 컬러 이모지 = AI tell | `<svg>` 또는 무아이콘 |
| `<div style={{ flex: 1, ..., flex: 1, ... }}>` 4개 grid | "AI generated dashboard" 1순위 | 1개 primary block + 보조 inline metrics |
| 모든 텍스트가 `color: var(--clr-text)` | 위계 부재 | text / text-secondary / tertiary 활용 |
| `border: 1px solid var(--clr-info)` (info 색 강조) | 위계 무너짐 | 강조는 폰트·weight로, color는 의미 (pos/neg)만 |

---

## 📐 적용 우선순위 (다온 리디자인)

### Phase 1 (즉시) — 가장 임팩트 큰 곳
1. **비중 탭** — 모든 신규 카드가 같은 패턴이라 가장 식상함
2. **보유 탭 카드 row** — 정보 4단(이름·티커·수량·계좌)이 세로 누적되어 정보 밀도 ↓

### Phase 2 (다음) — 톤 통일
1. Hero 카드 그라데이션 제거 → 단색 + 1px border
2. AI POWERED 배지·BorderBeam 절제 (지금은 곳곳에 떠 있어 산만)
3. 컬러 이모지 → SVG icon

### Phase 3 (선택) — 디테일
1. NumberTicker animation 살리되 폰트 크기 차이 줄임
2. 다크/프로 테마에서도 동일 톤 분리

---

## 🔗 참고 자료

- [Material 3 spec](https://m3.material.io/)
- Robinhood 2024 redesign — 정보 위계 강조 + 무이모지
- Toss UI — 큰 단일 핵심 숫자 + 작은 보조 텍스트의 절제
- Cash App — 단색 + bold weight로 위계 표현 (그라데이션 거의 안 씀)

---

## 변경 로그

| 날짜 | 변경 |
|---|---|
| 2026-05-24 | design.md 생성 — Material 3 + 핀테크 트렌드 통합. 적용 우선순위 비중 탭 > 보유 탭 > 톤 통일 |

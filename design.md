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
자산 추이 (Net Worth)                [1M][3M][1Y][ALL]
```
- **좌측 색띠 금지(R1)** — 제목은 plain text 14px / 800
- 우측에 toggle/action — segment control
- 의미 강조가 필요하면 제목 글자색(pos/neg/accent)으로만

### Pattern 4: **Empty State** (콘텐츠 없음)
- 큰 SVG icon (32-40px, outline only, opacity 0.4)
- 1줄 안내 (body)
- 1줄 다음 액션 (label, primary color, underlined)

### Pattern 5: **Insight Banner** (위계 있는 안내)
```
┌──[4면 hairline · radius 4]───────────────┐
│ 종목 분산이 우수합니다  ← 제목 글자색=의미  │
│ 보유 50종 + 평균 상관계수 0.22 → 분산 효과 ↑│
└─────────────────────────────────────────┘
```
- 그라데이션 배경 X. 단색 `--m-surface-variant`.
- **좌측 색띠 금지(R1).** 4면 `1px solid var(--m-outline-variant)` + `border-radius: 4px`.
- 의미(primary/positive/warn/negative)는 **제목 글자색**으로만.
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

## ✅ 디자인 품질 기본 (코드 작성 시 self-check — 사용자가 매번 지적하지 않아도 지킬 것)

> 아래는 "사용자가 발견하기 전에 정적으로 잡아야 할" 기본 품질 규칙. UI를 추가/수정하면 머지 전 반드시 자가 점검.

### 1. 겹침(overlap) 금지 — 최우선
- `position: absolute`/`fixed` 배지·라벨·아이콘을 **텍스트나 숫자 위에 올리지 말 것**. (예: 카드 우상단 absolute 배지가 우측 정렬된 값 숫자와 겹침 → 실제 발생 사례)
- 배지/태그는 가능하면 **정상 흐름(flow) 안에 flex item**으로 배치 (라벨 옆 inline). absolute가 꼭 필요하면 겹칠 콘텐츠 영역에 `padding-right` 등으로 **안전 영역(reserved space)** 확보.
- 한 컨테이너에서 좌측 콘텐츠 + 우측 값이 `justify-content: space-between`인데, 같은 모서리에 absolute 요소를 두면 100% 겹친다 → 금지.

### 2. 텍스트 색상 = 검정 기본 + 강조만 색 (회색 남용 금지)
- **본문 가독성 텍스트(읽어야 하는 내용)는 `--m-text`(검정) 기본.** 회색(`--m-text-secondary/tertiary`)을 본문에 남발하면 "정보는 많은데 안 읽힘" 현상 발생.
- 위계는 **회색 농도가 아니라 font-weight + size + 색 강조(pos/neg/accent)** 로 표현 (저대비 회색은 가독성·접근성 모두 손해).
- 회색은 **메타 정보 한정**: 카운트(`3건`), 캡션, 보조 라벨, 타임스탬프, 단위. 사용자가 "읽어야 하는 문장"에는 쓰지 않는다.
- 강조는 의미 색만: 수익=positive, 손실=negative, AI/프리미엄=accent. 그 외 강조는 weight로.

### 3. 한 줄 우선 (불필요한 줄바꿈 금지)
- 헤더/타이틀/배지는 **한 줄(flex row)** 로 묶을 수 있으면 묶는다. 행이 많을수록 촌스럽다.
- 설명 문장에 **하드 `<br/>` 금지**: 문장이 마침표(`.`)로 끝나기 전엔 줄을 끊지 않는다. 자연스러운 wrap에 맡길 것.
- 나열형(계좌 등 N개 버튼 한 줄 가득)보다 **filter(드롭다운/칩)** 로 압축. 컨트롤은 같은 행에 모은다.

### 4. 정렬·통일감
- 같은 의미의 배지(심각/관찰/높음 등)는 **모든 섹션에서 동일 위치(좌측 권장)** 로 정렬. 한 곳은 좌측, 다른 곳은 우측 = 통일감 깨짐.

### 5. 좁은 폭(모바일·앱 480px) 오버플로·겹침 / 숫자 줄바뀜 금지 — **최우선·서비스 품질**
> ⚠️ 실제 발생 사례(2026-06): ① 시장 Top10에서 현재가가 티커/종목명 위에 **겹침** ② 동종업계 비교 표의 시가총액·P/E가 `796.5→6B`, `16→3.3→8`처럼 **글자 단위로 줄바뀜**. 둘 다 PC 넓은 화면에선 안 보이고 **앱(≈360–480px)에서만** 터지는 기본 결함 → 출시 불가 품질.

- **flex/grid 텍스트 칸은 줄어드는 자식에도 `min-width: 0`** 을 줘야 한다. 부모에만 주면 안 됨 — 자식 `<div>`가 콘텐츠 폭만큼 늘어나 **옆 칸(값/현재가)을 침범**한다. 텍스트 칸 자식: `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. 로고/아이콘 등 고정폭은 `flex-shrink:0`.
- **숫자·표 값은 절대 글자 단위로 줄바뀌면 안 된다.** 표/지표 셀은 `white-space: nowrap`(+ 숫자는 `font-variant-numeric: tabular-nums`, 우측 정렬). 칸이 좁으면 줄바꿈이 아니라 **가로 스크롤 래퍼(`overflow-x:auto`)** 로 푼다. `table{width:100%}`만 두고 셀 nowrap을 빼면 좁은 폭에서 값이 깨진다.
- **고정 px 그리드 컬럼은 좁은 폭 합계를 검산**한다. `1fr + 고정컬럼합 + gap×n` 이 ~360px 안에 들어오는지 계산하고, 넘치면 컬럼/갭을 줄인다.
- **머지 전 ≈360–400px 폭에서 반드시 육안 점검**(브라우저 반응형 또는 실기기). "PC에서 멀쩡함"은 검증이 아니다 — 앱은 좁은 폭이 기본 타깃.

---

## 🟥 AGENT 필수 규칙 (모든 AI 개발에 강제 — 위반 = 재작업)

> 2026-06-06 추가. 사용자가 "Claude Code 기본 디자인 절대 금지"를 명시했고, 과거에 이 규칙을 어긴 사례(Health Score "S 등급으로 가는 길" 박스가 둥근 테두리 AI-카드 형태로 들어감)가 있었다. **UI를 추가/수정하는 모든 에이전트는 머지 전 아래를 정적 점검할 것.** CLAUDE.md가 이 섹션을 권위로 참조한다.

### R1. 좌측 색 테두리(border-left accent) = 절대 금지 · 모든 컨테이너는 동일 flat 카드
> ⚠️ 사용자가 **수차례** 금지했고 과거 design.md가 거꾸로 이걸 "권장"해서 반복 위반한 핵심 사례. 이전 Pattern 3·5·R1의 "좌측 3px 색띠" 권장은 **폐기**됨.

**`border-left: Npx solid <color>` 로 좌측만 색 테두리를 주는 디자인은 Claude Code 기본 "AI 티" → 다온에서 절대 금지.** (`borderLeft` 인라인도 동일.)
- **모든 섹션/카드/배너는 동일한 단일 컨테이너**로 통일: `border: 1px solid var(--m-outline-variant)` (4면 균일 hairline) · `border-radius: 4px` · `box-shadow: none` · **좌측 색띠 없음**. = `.mono-card` 기본형.
- 섹션 **제목은 plain text**(좌측 색바 `::before` 금지). 의미(위험/긍정/액션)는 **제목 글자색**(pos/neg/accent) 또는 **제목 옆 작은 텍스트 라벨**로만 표현.
- 강조 박스(인사이트)도 좌측 띠 대신 **배경 `--m-surface-variant` + 4면 hairline + radius 4**. 색은 제목 글자색으로.
- 자가 점검 grep(머지 전 필수): **`border-left`·`borderLeft`·`::before` + `background: var(--m-primary/positive/negative)` 조합이 있으면 위반.** 0건이어야 함.

### R1ب. 둥근 모서리·그림자·그라데이션 통일 (인라인이 디자인 시스템 우회 → 반복 위반의 실체)
- 카드/박스 `border-radius`는 **4px 고정**(작은 배지·태그 2px). **인라인 `borderRadius: 8`+ (8/10/12/14/16) 절대 금지** — 클래스(`.card`/`.mono-card`, radius 4) 사용. 기존 발견 시 4로 내린다.
- **인라인 `boxShadow` 금지**(카드 그림자). elevation은 1px hairline border로만.
- **`linear-gradient(...)` 배경 금지**(헤더 포함) → 단색 토큰(`--m-primary` 등).
- **머지 전 전수 self-check (grep 0건 목표):**
  ```bash
  grep -rnE "borderRadius:\s*(8|9|1[0-9]|2[0-9])|boxShadow:|linear-gradient" frontend/src/tabs frontend/src/components | grep -v ui_backup
  grep -rnE "border-left|borderLeft" frontend/src/tabs frontend/src/components | grep -v ui_backup   # 색 accent 0건
  ```
  → 스크린샷 보고 부분 수정(whack-a-mole) 금지. **위 grep을 돌려 전 파일을 한 번에 잡는다.**

### R2. 데이터 시각화 = 무채색 금지, 정규 팔레트 사용
막대/스택/도넛/히스토그램의 채움색을 **검정(`--m-text`)·회색(`greyScale`)으로 칠하지 말 것.** 핀테크 앱처럼 차분한 컬러 팔레트로 카테고리를 구분한다. (Robinhood/Toss 참고 — 채도 있지만 neon 아님.)

```js
// 다온 표준 카테고리 차트 팔레트 (순서대로 사용)
const CHART_COLORS = ['#1F4FD3','#059669','#D97706','#7C3AED','#0891B2','#DB2777'] // 코발트·에메랄드·앰버·바이올렛·시안·로즈
const CHART_REST   = '#94A3B8' // '기타'/잔여 only
// 2색 강약(수령/예정 등): 진한색 = CHART_COLORS[0], 옅은색 = 같은 색 30~40% opacity
```
- 단색 강조(수익/손실)는 의미색(pos/neg) 유지. 카테고리 구분만 팔레트.

### R3. 모든 도형/막대에 hover 금액 노출
막대·세그먼트·도넛 조각 등은 마우스 오버 시 **해당 값(금액/비중)** 이 보여야 한다 (최소 `title` 속성, 가능하면 커스텀 툴팁). 모바일은 탭으로 동일 정보 접근.

### R4. 액션 버튼 = 단일 위계 (검정·초록·그라데이션 혼용 금지)
한 화면(특히 분석 탭)에서 주 액션 버튼 색이 제각각이면 촌스럽다. **주 액션은 `.btn-primary` 한 클래스로 통일**(인라인 `background: var(--m-text)`(검정)·`linear-gradient(...)` 버튼 새로 만들지 말 것). AI 전용 액션만 `ShimmerButton`(violet) 예외. 보조 액션은 `.btn-secondary`(아웃라인).

### R6. 여러 문장 산문(prose) = 문장마다 줄바꿈 + 점수/라벨 나열은 세로 정렬
> 2026-06-25 추가. 사용자가 "전구 해설·AI 심층 분석 문장이 끝나면 줄바꿈" 요청을 **수십 번 반복**(매번 한 덩어리로 뭉쳐 가독성 저하). 이제 강제 규칙으로 못 박는다.
- **2문장 이상 산문은 한 문장 끝(`.`/`?`/`!`)마다 줄바꿈.** AI 심층 분석·💡 해설/툴팁·인사이트·검증 노트 등 모든 서술형 텍스트에 적용.
  - 동적 텍스트: `breakSentences(text)`(숫자 소수점·약어 보존: `/([^\d\s])([.?!])\s+/g → '$1$2\n'`) + 컨테이너에 `whiteSpace: 'pre-line'`. (구현 위치: `ChartTab.jsx`/`DiscoverTab.jsx`의 `breakSentences`.)
  - 정적 텍스트(JSX에 `<b>` 등 포함): 문장 경계에 `<br />` 수동 삽입.
- **점수/지표 라벨 나열은 가로 wrap 금지 → 세로 정렬**(라벨 좌·값 우, `flexDirection:'column'` + `justifyContent:'space-between'`). 가로로 흘리면 "저평가 53 파이프라인 71 …"처럼 뭉쳐 읽기 어렵다. 값은 `title`(hover 설명) 유지.
- 자가 점검 grep(머지 전): AI/해설/insight 문자열을 **`whiteSpace` 없이 raw로** 렌더하면 위반 의심. 다문장 산문에 `breakSentences`/`<br>`/`pre-line` 중 하나는 반드시.

### R5. 머지 전 self-check (이 5개를 반드시 통과)
① R1 둥근 AI-카드 없음 ② R2 차트 무채색 없음 ③ R3 hover 값 노출 ④ R4 버튼 단일 위계 ⑤ **R6 다문장 산문 문장별 줄바꿈·점수 세로정렬**. + 기존 "디자인 품질 기본" 5개(겹침·검정기본·한줄·정렬·**좁은폭 오버플로/숫자줄바뀜**).
- **R5-앱폭 점검(필수):** UI를 추가/수정했으면 **≈360–400px 폭**으로 좁혀(또는 실기기) ① 칸 침범/겹침 없음 ② 숫자가 글자 단위로 줄바뀌지 않음 ③ 표는 가로 스크롤로 풀림 을 육안 확인. PC 화면만 보고 "완료" 금지.

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
| 2026-06-06 | "디자인 품질 기본 (self-check)" 섹션 추가 — ① absolute 배지 겹침 금지 ② 본문 검정 기본·회색은 메타 한정 ③ 한 줄 우선·하드 br 금지 ④ 배지 정렬 통일. Health Score "약점" 배지가 값 위에 겹친 사례 반영 |
| 2026-06-06 | **"AGENT 필수 규칙" 섹션 추가 (강제)** — R1 둥근 AI-인사이트 카드 금지(좌측 띠 banner만) R2 차트 무채색 금지·CHART_COLORS 팔레트 R3 도형 hover 금액 R4 버튼 `.btn-primary` 단일 위계 R5 머지 전 self-check. "S 등급으로 가는 길" 박스가 둥근 AI-카드로 들어간 위반 사례 반영 |
| 2026-06-09 | **"디자인 품질 기본 5" 추가 — 좁은 폭 오버플로·겹침 / 숫자 줄바뀜 금지** (+ R5에 앱폭 점검 강제). 시장 Top10 현재가가 티커 위에 겹치고, 동종업계 표 수치가 글자 단위로 줄바뀐(796.5→6B) 출시불가 사례 반영. flex/grid 자식 min-width:0, 표 셀 white-space:nowrap+가로스크롤, ≈360–400px 육안 점검 의무화 |
| 2026-06-06 | **R1 전면 개정 (근본 원인 교정)** — 이전 R1·Pattern 3·5가 "좌측 3px 색띠"를 *권장*해 사용자가 수차례 금지한 패턴을 반복 생성하던 버그. → **좌측 색 테두리(border-left accent) 절대 금지**, 모든 컨테이너 동일 flat 카드(4면 hairline·radius 4·좌측띠 없음), 의미는 제목 글자색으로. 공용 CSS `.mono-section-title::before`·`.m3-section-title::before`·`.m3-banner` border-left 제거. R1ب: radius 4 고정(8px+ 금지). |
| 2026-06-25 | **R6 추가 (강제)** — 다문장 산문(AI 심층·💡 해설/툴팁·인사이트)은 문장마다 줄바꿈(`breakSentences`+`whiteSpace:pre-line` 또는 `<br/>`), 점수/라벨 나열은 가로 wrap 대신 세로 정렬(라벨좌·값우). 사용자가 "문장 끝 줄바꿈"을 수십 번 반복 요청한 사례 반영. R5 self-check에 ⑤로 편입. |

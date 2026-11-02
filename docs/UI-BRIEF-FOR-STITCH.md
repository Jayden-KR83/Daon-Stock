# 다온(Daon) UI 리디자인 브리프

> **이 문서를 받는 사람/도구에게** — Stitch 같은 UI 생성 도구, 또는 외부 디자이너용 브리프입니다.
> 코드를 바꾸라는 문서가 아니라 **화면을 다시 그려 달라는 요청서**입니다.
> 영어 입력이 필요한 도구를 위해 각 절 끝에 `EN PROMPT` 블록을 붙였습니다 — 그 블록만
> 복사해 붙여 넣으면 됩니다.
>
> 작성 2026-11-02 · 정본 위치 `daon/docs/UI-BRIEF-FOR-STITCH.md`

---

## 0. 한 줄 요청

> 기능은 그대로 두고, **읽히게** 다시 그려 주세요. 더하지 말고 덜어 주세요.

의뢰인(오너)의 말 그대로: *"UI가 딱딱해. 색감도 그렇고 뭔가 전달력 있는 UI로."*
그리고 궁극 목표: *"토스증권처럼 쉽고 깔끔하게."*

---

## 1. 이 앱이 무엇인가

**다온(Daon)** — 개인 주식 포트폴리오 관리 PWA. 한국·미국 주식을 함께 본다.
**매매 기능은 없다**(의도적). 보유 현황·분석·알림이 전부다.

- 사용자: 사실상 **1명(앱 주인)** + 소수. 초보가 아니라 **숙련 개인 투자자**다.
- 기기: **모바일 우선(360~412px)**, PC 병행. 홈 화면에 설치해 쓴다.
- 언어: 한국어. 숫자·티커는 영문·기호 그대로.
- 자산 규모가 크고 **금액 가림(privacy) 모드**가 있다 — 숫자가 `●●●●` 로 바뀌어도
  레이아웃이 무너지면 안 된다.

### 다른 주식 앱과 다른 점 (디자인이 지켜야 할 성격)
1. **판정하지 않고 숫자를 준다.** "사세요/파세요"를 말하지 않는다. 디자인도
   유도하지 않는다 — 큰 초록 '매수' 버튼 같은 것은 없다.
2. **숫자에는 늘 기준이 붙는다.** "지난 12개월", "200일선 기준", "금액 가중"처럼
   분모·기간을 함께 적는 규칙이 있다. 각주를 **지우지 말고 접어** 달라.
3. **알림이 강점이다.** 목표가·급등락·실적·지수·중기 국면 5종.

```
EN PROMPT
Daon is a personal stock portfolio PWA for Korean + US markets. No trading/order
features by design — only holdings, analysis and alerts. One expert user (not a
beginner). Mobile-first (360–412px), also used on desktop, installed as a PWA.
Korean UI. It has a privacy mode that replaces every amount with dots, so layout
must not depend on digit width. Design principle: the app reports numbers and never
tells the user to buy or sell, so no persuasive CTAs. Every number is shown with its
basis (period, denominator) — keep that information but allow it to be collapsed.
```

---

## 2. 지금 무엇이 문제인가 (의뢰인 지적 + 자체 점검)

| # | 문제 | 구체적으로 |
|---|---|---|
| 1 | **딱딱하다** | 전부 `border-radius: 4px` 흰 카드 + 1px 회색 테두리. 위계가 없어 모든 카드가 같은 무게로 보인다 |
| 2 | **색이 말을 안 한다** | 초록(#16A34A)=상승·주버튼, 빨강(#DC2626)=하락. 그 외 색이 거의 없어 **무엇이 중요한지 색으로 구분되지 않는다** |
| 3 | **밀도가 높다** | 분석 탭 한 화면에 Ⅰ·Ⅱ·Ⅲ장 + 부록. 스크롤이 매우 길다 |
| 4 | **전문용어가 날것** | `HHI`, `유효 종목 수`, `MDD`, `샤프`, `이격도`가 라벨에 그대로 |
| 5 | **설명문이 길다** | 정확하지만 길다. 각주가 본문보다 긴 카드가 있다 |
| 6 | **탭이 10개** | 하단 내비가 가로 스크롤된다 |

```
EN PROMPT
Current problems: (1) every surface is the same white card with 4px radius and a 1px
grey border, so nothing reads as more important than anything else; (2) the only
meaningful colours are green for up / red for down, so importance is not encoded;
(3) one screen stacks four chapters and scrolls very long; (4) finance jargon appears
raw in labels; (5) explanatory footnotes are longer than the content they explain;
(6) ten bottom-nav tabs that scroll horizontally.
```

---

## 3. 화면 목록 (현재)

| 탭 | 무엇을 보나 | 상태 |
|---|---|---|
| 포트폴리오 | 보유 종목 목록·총자산·계좌별 | 가장 자주 봄 |
| **분석** | Ⅰ 상태(자산추이·비중) / Ⅱ 진단(AI 리포트·건강도·경고) / Ⅲ 제안 / 부록 | **가장 무거움 — 1순위 개선 대상** |
| 종목 | 개별 종목 차트·재무·뉴스 | 기술적 지표 추가 예정 |
| 관심 | 관심 종목 + 실시간 시세 | |
| 발굴 | 저평가·혁신주 스크리닝 | |
| 시장 | 지수·섹터 히트맵·거래량·실적 캘린더 | |
| 등록 | 종목 추가·증권사 엑셀 임포트 | |
| 설정 / 가이드 / 관리자 | | |

**상단 고정**: 지수 티커 테이프(S&P500·VIX·KOSPI·USD/KRW·BTC 등 12개가 흐름)
**우상단**: 알림 벨(배지) · 가림 모드 토글

```
EN PROMPT
Tabs: Portfolio (holdings list, total assets, per-account), Analysis (4 chapters:
status / diagnosis / suggestions / appendix — the heaviest screen and the main target),
Stock detail (chart, fundamentals, news), Watchlist, Discover (screener), Market
(indices, sector heatmap, volume, earnings calendar), Add (manual + broker Excel import),
Settings, Guide, Admin. A scrolling index ticker tape is pinned at the top; a
notification bell and a privacy toggle sit top-right.
```

---

## 4. 반드시 지켜야 할 제약 (어기면 되돌립니다)

이 제약들은 **사고를 겪고 생긴 규칙**입니다. 예뻐 보여도 어기면 못 씁니다.

1. **둥근 반투명 '글래스' 카드 금지.** 카드는 4면 테두리 1px, radius 4. 8px 이상 금지.
   좌측 색 띠(border-left accent) **절대 금지** — 여러 번 금지된 패턴이다.
2. **주 액션 버튼은 한 가지 위계.** 검정·초록·그라데이션 혼용 금지.
3. **차트에 무채색 금지.** 지정된 차트 팔레트를 쓴다.
4. **두 문장 이상 산문은 문장마다 줄바꿈.**
5. **가변 길이 라벨 목록은 고정폭 열**로 정렬한다(라벨 길이가 달라도 값의 시작 x가 같아야 함).
6. **360~400px에서 겹침·가로 넘침·숫자 글자단위 줄바꿈 0건.**
7. **모션은 상태 변화를 설명할 때만.** 장식 루프·등장 애니메이션·hover 확대 금지.
   끝나지 않는 모션에는 `prefers-reduced-motion` 가드 필수.
8. **이모지를 기능 아이콘으로 쓰지 않는다.** 선 아이콘(stroke 1.8)을 쓴다.
9. **금액은 전부 가림 모드를 통과해야 한다.** 가려진 상태에서도 정렬이 유지될 것.

```
EN PROMPT
Hard constraints (violations will be rejected): no rounded translucent "glassmorphism"
cards — cards are flat, 1px hairline border on all four sides, border-radius 4px, never
8px+; never use a coloured left border accent; one single visual hierarchy for primary
action buttons (no mixing black / green / gradient); charts must use the defined colour
palette, never greyscale; prose of two or more sentences breaks to a new line per
sentence; lists with variable-length labels must use a fixed-width label column so values
align on the same x; zero overlap / horizontal overflow / mid-number wrapping at 360–400px;
motion only when it explains a state change (no decorative loops, no entrance animations,
no hover scaling) and any infinite motion needs a prefers-reduced-motion guard; no emoji
as functional icons — use 1.8px stroke line icons; every monetary value must survive a
privacy mode that replaces digits with dots without breaking alignment.
```

---

## 5. 현재 색·타이포 (바꿔도 되는 것 / 안 되는 것)

### 바꾸면 안 되는 의미색
| 뜻 | 현재 | 비고 |
|---|---|---|
| 상승·긍정 | `#22C55E` / 진한 `#16A34A` | 한국 시장은 **빨강=상승**이 관습이나, 다온은 글로벌 관습(초록=상승)을 택했다. **유지** |
| 하락·부정 | `#EF4444` / 진한 `#DC2626` | 유지 |

### 바꿔도 되는 것 (여기가 작업 대상)
- 배경 `#EEF2F7`, 카드 흰색, 테두리 연회색
- 본문 글자: Slate 계열 `#334155` / 제목 `#0F172A` / 보조 `#64748B` / 3차 `#94A3B8`
- 라운드 `4px`, 타이포 스케일(9.5 / 10.5 / 11 / 12.5 / 22px — **너무 잘다**)
- 테마 3종: light · dark · pro(차콜). **dark 와 pro 가 거의 구분되지 않는다** — 차별화 필요

### 요청
1. **중립색에 온도를 달라.** 지금 Slate 는 차갑고 사무적이다. 금융 신뢰감을 잃지 않는
   선에서 미세한 따뜻함(또는 명확한 브랜드 뉴트럴)을 제안해 달라.
2. **강조색 1개를 새로 제안해 달라.** 초록·빨강은 **등락 전용**이라 "중요함"을 말할 색이 없다.
   그 한 색으로 섹션 제목·활성 상태·AI 영역을 묶는다. (현재 AI 영역만 보라색 계열)
3. **타이포 스케일을 단순화해 달라.** 지금 9.5~22px 사이에 단계가 너무 많다.
   4~5단계로 줄이고 **본문 최소 11px 이상**(모바일 가독성).

```
EN PROMPT
Keep these semantic colours unchanged: green #22C55E / #16A34A = up, red #EF4444 /
#DC2626 = down. Everything else is open: background #EEF2F7, white cards, slate text
(#0F172A heading, #334155 body, #64748B secondary, #94A3B8 tertiary), 4px radius, and a
type scale that currently runs 9.5 / 10.5 / 11 / 12.5 / 22px — too many steps and too
small. Requests: (1) give the neutrals some warmth or a distinct brand-neutral while
keeping financial credibility; (2) propose ONE new accent colour, because green and red
are reserved for price direction and nothing is left to express "important" — the accent
will mark section titles, active states and AI areas; (3) simplify the type scale to 4–5
steps with body text no smaller than 11px. Deliver light and dark variants; the current
dark and "pro" charcoal themes look nearly identical, so make them clearly different or
drop one.
```

---

## 6. 우선순위 — 이 순서로 그려 주세요

### 1순위: 분석 탭 (가장 무겁고 가장 자주 지적됨)
현재 한 스크롤에 네 장(Ⅰ 상태 / Ⅱ 진단 / Ⅲ 제안 / 부록)이 전부 들어 있다.
담긴 것: 자산추이 차트, 목표 카드, 섹터 비중 도넛, AI 리포트(긴 산문 + 불릿),
건강도 배지, 리밸런싱 경고 목록, 배당 시뮬레이터, 상관관계.

**요청**: 한 번에 하나만 읽게 하는 구조를 제안해 달라. 다만 —
⚠ **상단 고정 목차는 이미 한 번 넣었다가 오너 요청으로 제거했다.** 같은 것을
다시 제안하지 말 것. 세그먼트·단계형·요약 후 펼치기 등 **다른 접근**을 원한다.

### 2순위: 알림 센터
바텀시트. 알림 목록 + 설정(급등락·지수 12행 토글). 지금 설정 패널이 조밀한 표처럼 보인다.

### 3순위: 포트폴리오(보유) 목록
행마다 종목명·티커·수량·계좌·평가액·손익률. 정보 6단이 한 줄에 들어가 빽빽하다.

### 4순위: 종목 상세 (기능 추가 예정)
**가격 차트 + 이동평균선(20/60/200일) + RSI 패널**이 상단에 들어갈 예정이다.
그 자리를 미리 설계해 달라 — 차트와 보조지표의 비율·범례·기간 선택.

```
EN PROMPT
Priority order. (1) Analysis tab — currently one endless scroll containing four chapters
(status / diagnosis / suggestions / appendix) with: net-worth line chart, goal card,
sector donut, a long AI report (prose + bullets), a health badge, a rebalancing warning
list, a dividend simulator, a correlation matrix. Propose a structure that shows one
thing at a time. IMPORTANT: a sticky table-of-contents was already tried and removed at
the owner's request — do not propose that again; segmented control, stepper, or
summary-then-expand are welcome. (2) Notification centre bottom sheet: alert list plus a
settings panel with 12 index toggles that currently reads like a dense spreadsheet.
(3) Holdings list: each row carries name, ticker, quantity, account, value and P/L% —
six fields crammed into one line. (4) Stock detail: a price chart with 20/60/200-day
moving averages plus an RSI sub-panel will be added at the top — design that area now
(chart-to-indicator ratio, legend, range selector).
```

---

## 7. 톤 — 피해야 할 인상

의뢰인이 싫어하는 것이 분명합니다.

- ❌ **"AI가 만든 티"** — 둥근 반투명 카드, 청록/보라 그라데이션, 큰 이모지, 네온 글로우
- ❌ **게임/대시보드 느낌** — 게이지·레벨·배지·움직이는 장식
- ❌ **코인 앱 느낌** — 검정 배경에 형광색
- ✅ **지향**: 조용하고 밀도 있게 정돈된 금융 문서. 숫자가 주인공.
  색은 **의미가 있을 때만** 등장. 토스증권의 "쉬운 말·한 화면 한 가지" 감각.

⚠ 단, 토스가 겪은 실패도 피해야 한다: 2024년 '미수거래'를 '외상'으로 바꿨다가
금융감독원 시정명령으로 되돌렸다. **쉬운 단어와 위험이 작아 보이는 것은 다르다.**
'추세 이탈'을 '조정 중' 같은 부드러운 말로 바꾸지 말 것.

```
EN PROMPT
Tone. Avoid: anything that reads as AI-generated template (rounded translucent cards,
teal/purple gradients, oversized emoji, neon glows); game or gamified dashboards (gauges,
levels, badges, animated decoration); crypto-app look (black background with fluorescent
accents). Aim for: a quiet, densely organised financial document where the numbers are
the subject and colour appears only when it carries meaning — the clarity of Toss
Securities. One caution: making language easier must never make risk look smaller.
Do not soften risk vocabulary.
```

---

## 8. 산출물로 받고 싶은 것

1. **화면 4종 시안**(6절 우선순위 순) — 라이트·다크 각각, 390px 기준
2. **컬러 토큰 표** — 배경/표면/테두리/글자 4단계/강조 1색/등락 2색 (hex)
3. **타이포 스케일** 4~5단계 (크기·굵기·용도)
4. **카드·목록·배지·버튼** 컴포넌트 예시
5. 가능하면 **가림(privacy) 모드** 상태 1컷 — 금액이 점으로 바뀐 화면

받은 뒤 다온 쪽에서 할 일: 토큰을 `frontend/src/tokens.css` 에 반영하고
`npm run check`(미정의 토큰·모션 검사)를 통과시킨 뒤 화면별로 적용한다.

```
EN PROMPT
Deliverables: four screen mockups in the priority order above, light and dark, at 390px
width; a colour token table (background / surface / border / four text levels / one accent
/ up / down, as hex); a 4–5 step type scale with size, weight and usage; component examples
for card, list row, badge and button; and one frame showing privacy mode where every amount
is replaced by dots.
```

---

## 9. 참고 — 화면에 실제로 쓰이는 문구 예시

시안에 실제 텍스트를 넣을 때 쓰세요(길이 감각용).

```
주식 평가액 추이        ₩116,120,857
+0.19%  1Y
기록 시작 2026-07-30 대비 +0.19% (+151,081원)
+ 예수금 ₩6,362,217 = 총자산 ₩122,483,074

종합 리스크 진단
• 반도체(31.0%) + AI·빅테크(23.8%) 합계 54.8%로 기술주에 편중돼 있습니다.
• NVDA 단일 종목 비중이 24.2%입니다.

자동 리밸런싱 경고
  종목 집중   NVDA 24.2%    임계 20%
  섹터 집중   반도체 31.0%  임계 25%

[관심] SK하이닉스 +5.2% 급등 · 현재 ₩1,492,000
[지수] KOSPI +2.3% 급등 · 현재 5,861
```

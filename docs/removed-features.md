# 제거한 기능 — 왜 뺐고, 어떻게 되살리나

> **이 문서의 목적은 "다시 만들지 않게" 하는 것이다.**
> 코드는 git 에 그대로 있다. 여기 적을 것은 코드가 아니라 **판단**이다 —
> 무엇이었는지, 왜 뺐는지, 어떤 조건이면 되살릴 가치가 있는지.
> 기록 없이 지우면 6개월 뒤 누군가 같은 것을 처음부터 다시 만든다.

제거 전 확인 절차(이 문서에 항목을 추가할 때 같이 한다):
1. 해당 파일이 **git 에 커밋되어 있고 로컬 수정이 없는가** — 없으면 지우는 순간 사라진다
2. 백엔드 엔드포인트에 **내부 호출자가 없는가** (`grep` 으로 함수명 참조 수를 센다)
3. 아래 표에 **제거 시점의 커밋 해시**를 적었는가 — 복구 명령이 그걸 가리킨다

---

## 2026-10-11 · 차트 비교 · 한·미 ETF 비교

**제거 사유**: 오너가 **한 번도 쓰지 않았다.** 기능이 틀려서가 아니라 필요가 없었다.
시장 탭이 길어져 정작 매일 보는 것(시황·섹터)이 아래로 밀리고 있었다.

**제거 시점 커밋**: `b0a43d5` (파일 자체의 마지막 변경은 `c506ada`)

| 무엇 | 파일 | 줄 |
|---|---|---|
| 차트 비교 모드 | `frontend/src/components/CompareChart.jsx` | 298 |
| 한·미 ETF 비교 | `frontend/src/components/EtfCompare.jsx` | 462 |
| 임베드 지점 | `frontend/src/tabs/TrendsTab.jsx` (import 2 + 사용 2) | — |
| 클라이언트 | `frontend/src/api.js` — `getCompareSeries` · `getEtfCompare` · `getEtfCompareAi` | 3 |
| 서버 | `backend/main.py` — `GET /api/etf/compare` · `POST /api/etf/compare/ai` · `POST /api/compare/series` | 3 |

**무엇이었나**
- **차트 비교**: 2~6종목을 100 으로 정규화해 같은 축에 겹쳐 그린다. 상대 성과 비교용.
- **한·미 ETF 비교**: ETF 2~4개를 고르면 비교표 + AI 시사점. 한국 6자리 코드와 미국 티커를
  같이 받았다. `/api/etf/compare/ai` 는 Anthropic 호출이라 **쓰지 않아도 코드는 유지비가 든다**
  (AI 응답 파싱 규약이 바뀌면 같이 고쳐야 하는 자리가 하나 더 늘어난다).

**되살릴 가치가 있는 조건**
- 보유 종목이 늘어 "A 와 B 중 무엇이 더 나았나"를 **반복해서** 묻게 될 때
- 신규 매수 검토 시 같은 섹터 ETF 를 **정기적으로** 비교하게 될 때
- 둘 다 "가끔 궁금하다" 수준이면 되살리지 말 것 — AI 챗에게 물으면 되는 일이다

**되살리는 법**
```bash
git checkout b0a43d5 -- frontend/src/components/CompareChart.jsx \
                        frontend/src/components/EtfCompare.jsx
# TrendsTab.jsx 에 import 2줄 + 사용 2블록, api.js 에 클라이언트 3개,
# main.py 에 엔드포인트 3개를 되돌린다 — 전부 같은 커밋에 있다.
git show b0a43d5 -- backend/main.py | grep -n "etf/compare\|compare/series"
```

**지우면서 같이 본 것**: `EtfCompare` 가 한국 ETF 를 `A` 접두 코드로도 받고 있었다.
같은 날 운영 DB 의 `A` 접두를 6자리로 정규화했으므로, 되살린다면 그 부분도 같이 고쳐야 한다
(→ `CLAUDE.md` 섹터 규약, `backend/sectors.py`).

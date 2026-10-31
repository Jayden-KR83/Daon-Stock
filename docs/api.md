# 다온 — API 엔드포인트 · 캐시 · AI 정책

## 1. 캐시 TTL 정책

| 함수 | TTL | 비고 |
|---|---|---|
| `_market_data` | 300s | 마켓 인덱스 |
| `_price_fast` | 90s | US 종목 현재가 |
| `_kr_price` fresh | 300s | KR 종목 1차 캐시 |
| `_kr_price` stale | 1800s | Naver/yfinance 모두 실패 시 fallback |
| `_stock_full` | 120s | 종목 상세 (차트+meta) |
| `_kr_history`, 섹터/거래량 | 1800s | |
| `_dividends_cache` | 12h | 배당 데이터 |
| stock 분석 캐시 (`stock_v2:{TICKER}:{name}`) | 24h | Sonnet 4.6 응답 |
| `metrics_cache` / `strategy_cache` | persistent | DB 영구 저장, 사용자 명시 갱신 |

## 2. AI 분석 타임아웃

| 엔드포인트 | 백엔드 | 프론트 | 모델 |
|---|---|---|---|
| `POST /api/portfolio/strategy` | 90s | 180s | Haiku 4.5 |
| `POST /api/portfolio/analyze` | 80s | 90s | Haiku 4.5 |
| `POST /api/stock/{ticker}/analyze` | 180s | 200s | **Sonnet 4.6 + web_search (max_uses=4, max_tokens=8192)** |
| `GET /api/stock/{ticker}/analyze/cached` | 즉시 | 30s | 캐시 read only |

## 3. 종목 심층 분석 (Sonnet 5 + web_search)

- **헬퍼**: `_call_claude_with_search(api_key, model, prompt, ...)` → `(text, citations)` 반환
- **마지막 text 블록만 JSON으로 파싱** — web_search 사고과정은 무시 (마지막 `{...}` 매치 fallback)
- **JSON 파싱 실패 시 502 반환** — 영문 raw 텍스트를 캐시에 저장 금지 ([incident_claude_json_parse](../memory)에 명시)
- **응답 메타**: `_cached: bool`, `_computed_at: epoch`
- **응답 스키마**: `recommendation`, `priceTarget`, `summary`, `company_overview`, `earnings_ir`, `catalysts_short[]`, `catalysts_medium[]`, `backlog`, `analyst_views`, `bull[]`, `bear[]`, `verdict`, `sources[]`
- **force_refresh**: `POST /analyze` body에 `{ "force_refresh": true }` → 캐시 무시

## 4. 인증 구조

- 비밀번호: PBKDF2-SHA256 + random salt (`salt:hash.hex()` 형식)
- 세션 토큰: `secrets.token_hex(32)` → SQLite sessions 테이블
- 토큰 만료: 30일 (`time() + 30 * 86400`)
- 프론트엔드: `localStorage["authToken"]`, axios interceptor가 모든 요청에 자동 첨부
- **모든 portfolio/watchlist 쿼리에 `WHERE user_id=?` 필수** (사용자 데이터 분리)

## 5. 의존성 패턴
```python
@app.get("/api/...")
def endpoint(cu: dict = Depends(require_approved)):
    uid = cu["user_id"]
    ...
```
- `get_current_user`: 토큰만 검증 (가입은 됐지만 status가 어떤 값이든)
- `require_approved`: status=approved 검증 (대다수 endpoint)
- 관리자 전용: `cu.get("is_admin")` 직접 확인

## 6. 핵심 엔드포인트 그룹

### 6.1 인증
- `POST /api/auth/signup` · `POST /api/auth/login` · `GET /api/auth/me` · `PUT /api/auth/profile`
- `GET /api/admin/status` · `POST /api/admin/users/{user_id}/approve` (admin)

### 6.2 포트폴리오
- `GET /api/portfolio` — 모든 계좌 + watchlist
- `POST/PUT/DELETE /api/portfolio/holdings`
- `POST /api/portfolio/strategy` · `POST /api/portfolio/analyze` (AI)
- `POST /api/portfolio/metrics` · `GET /api/portfolio/metrics/cached` (수익률·MDD·샤프)
- `POST /api/portfolio/alerts` (룰 기반 경고)
- `POST /api/portfolio/dividends` (배당 이력 + 연간 예상)

### 6.3 종목
- `GET /api/stock/{ticker}` — 메인 데이터 (현재가 + 차트 + meta)
- `GET /api/fundamentals/{ticker}` · `GET /api/peers/{ticker}`
- `GET /api/news/{ticker}` (Yahoo/Naver)
- `GET /api/financials/{ticker}/trend` (EPS·Revenue 한글화)
- `POST /api/stock/{ticker}/analyze` (Sonnet + web_search)

### 6.4 시장
- `GET /api/market` — 12개 지수 + 환율 + 10Y
- `GET /api/sector/heatmap/{market}` (S&P500, KOSPI)
- `GET /api/volume/{market}` (거래량 Top)

### 6.5 가격 알림 (V1 인앱 + V2 Web Push)
- `GET/POST/DELETE /api/alerts` — 종목별 목표가·손절가 규칙
- `GET/POST /api/alerts/move` — **급등락 알림 설정**(사용자 1행). `{enabled, threshold_pct(1~50), scope: both|holdings|watchlist}`. 행이 없으면 `MOVE_ALERT_DEFAULTS`(켜짐·5%·both)로 동작 — 무설정 기본 ON. 저장 시 `move_alert_state` 삭제(재무장).
- `GET/POST /api/alerts/index` — **지수 알림 설정**(상단 마켓바 지수). `GET` → `{enabled(마스터), items[{ticker,name,enabled,threshold_pct,default_enabled,default_threshold_pct,customized}], scan_interval_sec, threshold_range}`. `POST {enabled?, items[], reset?}`.
  - **임계는 지수별이다**(`INDEX_ALERT_RULES`). 종목과 같은 ±5%를 쓰면 VIX는 거의 매일 울리고 USD/KRW는 영원히 조용하다 — 하나의 숫자는 둘 중 하나를 반드시 속인다.
  - 기본 켜짐 6종: S&P500(1.5%) · Nasdaq(2%) · VIX(10%) · KOSPI(2%) · BTC(5%) · USD/KRW(1%). 꺼짐 6종: Dow·Russell·ETH·Gold·Silver·10Y채권(화면에서 켤 수 있다).
  - **기본값·허용 범위·스캔 주기는 서버가 응답에 실어 보낸다.** 화면은 그 값을 쓴다 (두 곳에 적으면 어긋나고, 어긋나도 아무도 모른다).
  - 마스터 스위치는 `index_alert_prefs`, 지수별 override 는 `index_alert_rules` — `move_alert_prefs` 에 컬럼으로 붙이지 않았다. 그쪽 `INSERT OR REPLACE` 가 행을 갈아끼울 때 조용히 기본값으로 돌아가기 때문이다.
  - 임계를 바꾸면 **그 지수의** `index_alert_state` 행만 삭제(재무장).
- `GET /api/notifications` (unread_only=bool) · `POST /api/notifications/{id}/read` · `POST /api/notifications/read_all`
  - `kind`: `high`|`low`(목표가/손절가) · `surge`|`plunge`(급등락) · `info`. `change_pct`는 surge/plunge에만 채워짐.
- `POST /api/cron/check_alerts` — cron_secret 검증, 5분 간격. 내부에서 두 스캔 수행:
  1. **목표가 스캔** — 등록된 `price_alerts` 전수, 24h 재발화 방지
  2. **급등락 스캔**(`_run_move_scan`) — approved 사용자별 보유(quantity>0)+관심 합집합의 일간 `change_pct` 대 임계 비교. **15분 스로틀**(`settings.move_scan_at`)이라 5분 cron 3회 중 1회만 실제 조회. 티커 상한 `MOVE_SCAN_MAX_TICKERS=200`(초과분은 응답 `move.truncated`에 표시). 시세는 `quotes` dict로 두 스캔이 공유해 중복 호출 없음. 전체 try/except 격리 — 실패해도 목표가 알림에 영향 없음.
  - 재발화 규칙(`_decide_move_alert`, 순수함수·pytest 12건): 최초 돌파 발화 → 같은 방향은 임계만큼 더 벌어질 때만(−5% 후 −10%) → 방향 전환은 즉시 → `|변동률|<임계`로 되돌아오면 `move_alert_state` 행 삭제해 재무장. **날짜 경계가 아닌 되돌림 기준**이라 장 마감 후 값이 고정된 미국장에서 자정마다 중복 발화하지 않음.
  3. **지수 스캔**(`_run_index_scan`) — `_market_data()`(TTL 300초, 대시보드와 공유) 의 12개 지수를 사용자별 지수 규칙과 비교. 판정은 급등락과 같은 `_decide_move_alert` 를 쓰고, 상태만 `index_alert_state` 로 분리했다 — 급등락 설정 저장이 상태를 통째로 지우므로(재무장) 섞으면 지수가 덤으로 울린다. **15분 스로틀**(`settings.index_scan_at`, 급등락과 별도 키). 알림 문구는 `[지수] VIX +18.4% 급등 · 현재 24.80`, 푸시 태그 `index-<티커>`. 값 표기는 지수마다 다르다(`_fmt_index_value`: 원·달러·포인트·수익률%).
- `GET /api/midterm/regime` — **중기 국면**(요청 #12 의 바닥). 보유 종목별 + 포트폴리오 한 장.
  - 계산은 `backend/midterm.py` 순수 함수(네트워크·DB 없음)가 한다. 엔드포인트는 시세를 모아 넘기고 캐시만 한다.
  - `phase` = **200일선 위/아래 × 200일선이 최근 60일간 올랐는가** 네 칸(상승추세·반등 시도·추세 이탈·하락추세). **예측이 아니라 분류다** — 규칙(`phase_rule`)과 조건(`basis`)을 값과 함께 보내므로 화면은 그것을 그대로 쓴다.
  - 그 밖에: `ma_gap_pct`·`ret_3m/6m/12m`·`band_pct`(52주 밴드 위치)·`drawdown_pct`·`vol_annual_pct`.
  - **이력이 모자라면 그 항목은 `None`** 이고 그 종목은 포트폴리오 집계의 **분모에서 빠진다**. 얼마나 못 봤는지는 `covered_weight_pct`/`unknown_weight_pct` 로 밝힌다 — 모르는 것을 '중립'으로 채우지 않는다.
  - 집계는 **금액 가중**이다(종목 수로 세면 9천만원짜리와 1천만원짜리가 같은 표를 던진다). 상한 `MIDTERM_MAX_TICKERS=60`.
  - 캐시: 종목별 종가 2년치 `_closes_2y` TTL 3600초.
- `POST /api/cron/midterm_scan` — **중기 자비스**(일 1회, cron_secret). 국면이 **바뀐 날에만** 인앱 알림 + 푸시(`kind='midterm'`, tag `midterm`).
  - 오너 결정(2026-10-31) 두 가지가 이 기능의 모양이다. **① 방향을 단언하지 않고 조건을 말한다** — "하락 우위"가 아니라 "삼성전자 ₩78,400을 회복하면 '추세 아래' 과반이 깨진다". 틀릴 수 있는 형태라 나중에 채점된다. **② 바뀐 날에만 보낸다** — 매주 같은 말을 보내면 읽히지 않고, 읽히지 않는 알림은 중요한 날에도 무시당한다.
  - 조건 계산은 순수 함수다: `change_trigger`(종목이 뒤집히는 가격 = 200일선) · `flip_requirement`(**금액 기준**으로 과반을 잃게 만드는 최소 묶음).
  - 소음 차단: `MIDTERM_MIN_WEIGHT_PCT=10` 미만 종목의 전환은 알리지 않는다. **다만 상태(`midterm_state`)는 갱신한다** — 안 울렸다고 상태를 안 남기면 다음에 중복 발화한다.
  - **첫 관측은 전환이 아니다**(기준선만 저장하고 조용히 넘어간다). 데모 계정 제외. 사용자별 실패는 격리된다.
- `POST /api/usage/tab` · `GET /api/usage/tabs?days&scope` — **화면 사용 로그**(오너 결정 2026-10-31).
  - 탭을 합칠 때 느낌이 아니라 기록으로 정하기 위한 것. **남기는 것은 탭 이름과 머문 시간뿐** — 클릭 위치·스크롤·입력값은 남기지 않는다(판단에 필요 없고, 더 모으면 지우기 어려운 것이 쌓인다).
  - 2초 미만은 버리고(스쳐 지나감), 30분 초과는 30분으로 자른다(자리 비움). 보관 180일, 쓸 때 같이 정리.
  - `scope='all'` 은 **관리자만**이며 사용자 구분 없는 합계다. 기본 `'me'` 는 본인 것만(🟥 개인 데이터 격리).
  - 비중의 **분모와 기록 시작일**을 `basis` 로 함께 보낸다 — 쌓인 날이 짧으면 표가 아무것도 말하지 못한다.
- `GET /api/cash/ledger` — **예수금 변동 이력**. `PUT /api/accounts/{key}/cash` 가 값이 바뀔 때만 1건 남긴다.
  - ⚠ **`delta` 를 입금액으로 읽으면 안 된다.** 예수금은 입금·매매·배당 셋으로 변한다. 가르는 단서는 `net_worth_snapshots.cost_krw`(매입원가) 다 — 매수면 예수금이 줄고 원가가 그만큼 늘어 합이 0, 입금이면 예수금만 는다. **평가액으로는 못 가른다**(시세가 같이 움직인다).
  - 둘 다 2026-10-31 부터 쌓기 시작했다. 그 전 구간은 가를 수 없다 — 모르는 것을 지어내지 않는다.
- `GET /api/push/public_key` · `POST /api/push/subscribe|unsubscribe|test` — Web Push(VAPID 자동 생성). 앱이 닫혀 있어도 도달.

### 6.6 자산 추이
- `POST /api/cron/snapshot` — 일별 평가액 자동 저장
- `GET /api/networth/snapshots` (기간)
- `GET /api/holding_pnl/snapshots/{ticker}`

### 6.7 거래내역
- `GET/POST/DELETE /api/transactions` · `GET /api/transactions/{ticker}/fifo`

### 6.8 비교/검색
- `POST /api/compare/series` (2~6 종목)
- `GET /api/search/{query}` (US + KR)

## 6-2. 채팅 (`/api/chat`) — 2026-08-28

| 엔드포인트 | 설명 |
|---|---|
| `POST /api/chat` | 한 턴. **SSE 스트리밍**(`text/event-stream`). 본문 `{message, scope, use_search}` |
| `GET /api/chat/history?scope=` | 그 맥락의 대화 |
| `DELETE /api/chat/history?scope=` | 그 맥락의 대화 삭제 |

`scope` = `general` | `strategy` | `stock:<TICKER>` — 대화를 화면 맥락에 묶는 열쇠다.

**🟥 지켜야 할 것**
- **컨텍스트는 서버가 조립한다.** 프론트는 질문만 보낸다. 프론트가 보유 데이터를
  실어 보내면 그 자체가 위조·유출 경로가 된다.
- **데모 계정은 대화를 저장하지 않는다.** 공용 계정이라 저장하면 앞사람의 질문이
  다음 방문자에게 보인다(2026-08-26 자산 노출과 같은 종류).
- **응답에는 금액이 그대로 들어온다.** 프론트에서 `maskText` 를 반드시 통과시킨다.
- 대화는 `chat_messages`(user_id 스코프)에만. 공유 캐시 금지.

**비용**
- 시스템+보유 스냅샷을 `cache_control` 로 캐싱한다. 실측: 접두 1,348토큰이
  2번째 턴부터 `cache_read` 로 잡힌다(기본 입력가의 10%).
  ⚠ 보유 목록 정렬을 고정할 것 — 순서가 흔들리면 접두가 달라져 캐시가 통째로 무효화된다.
- 웹 검색은 기본 끔(`use_search: false`). 검색은 **1,000회당 $10**(회당 약 14원)으로
  토큰비와 맞먹는다. "구조"를 묻는 질문에는 필요 없다.
- 월 쿼터 `CHAT_MONTHLY_QUOTA = 200`. 종목분석과 달리 채팅은 자유 입력이라
  캐시가 자연 상한이 되어주지 않는다.
- 사용량(`input/cache_read/cache_creation/output`)은 `audit_log`의 `ai_chat`에 남는다.
  `cache_read` 가 계속 0 이면 캐시가 깨진 것 — 조용히 비용만 두 배가 된다.

## 7. API Key 보안
- Anthropic API Key는 SQLite `settings` 테이블에만 저장
- `GET /api/settings/apikey` → `{"has_key": bool}` 만 반환 (키값 노출 X)
- 프론트 store: `hasAnthropicKey: bool` (키값 메모리에 없음)

## 8. 에러 처리 원칙
- 외부 API 함수: `try/except → None 반환`
- AI 오류: "AI 비서가 잠시 자리를 비웠습니다" 메시지
- DB: `with _db() as conn` — 자동 commit/rollback
- HTTPException: 400 (잘못된 입력), 401 (인증 실패), 403 (권한 부족), 404 (없음), 502 (외부/AI 오류)

## 9. 한국 주식 처리
- 정규식: `^A?\d{6}$` — 6자리 숫자 (A 접두사 옵션) = KR
- 현재가: Naver 1차 → yfinance `.KS/.KQ` 2차 → stale 30분 3차
- 차트 히스토리: yfinance `.KS/.KQ` suffix
- 통화 환산: `usd_krw` (환율 캐시 300s) — KR mul=1, US mul=usd_krw

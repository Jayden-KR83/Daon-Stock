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

## 3. 종목 심층 분석 (Sonnet 4.6 + web_search)

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
- `GET /api/notifications` (unread_only=bool) · `POST /api/notifications/{id}/read` · `POST /api/notifications/read_all`
  - `kind`: `high`|`low`(목표가/손절가) · `surge`|`plunge`(급등락) · `info`. `change_pct`는 surge/plunge에만 채워짐.
- `POST /api/cron/check_alerts` — cron_secret 검증, 5분 간격. 내부에서 두 스캔 수행:
  1. **목표가 스캔** — 등록된 `price_alerts` 전수, 24h 재발화 방지
  2. **급등락 스캔**(`_run_move_scan`) — approved 사용자별 보유(quantity>0)+관심 합집합의 일간 `change_pct` 대 임계 비교. **15분 스로틀**(`settings.move_scan_at`)이라 5분 cron 3회 중 1회만 실제 조회. 티커 상한 `MOVE_SCAN_MAX_TICKERS=200`(초과분은 응답 `move.truncated`에 표시). 시세는 `quotes` dict로 두 스캔이 공유해 중복 호출 없음. 전체 try/except 격리 — 실패해도 목표가 알림에 영향 없음.
  - 재발화 규칙(`_decide_move_alert`, 순수함수·pytest 12건): 최초 돌파 발화 → 같은 방향은 임계만큼 더 벌어질 때만(−5% 후 −10%) → 방향 전환은 즉시 → `|변동률|<임계`로 되돌아오면 `move_alert_state` 행 삭제해 재무장. **날짜 경계가 아닌 되돌림 기준**이라 장 마감 후 값이 고정된 미국장에서 자정마다 중복 발화하지 않음.
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

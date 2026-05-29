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

### 6.5 가격 알림 (V1 인앱)
- `GET/POST/DELETE /api/alerts` — 사용자 알림 규칙
- `GET /api/notifications` (unread_only=bool) · `POST /api/notifications/{id}/read` · `POST /api/notifications/read_all`
- `POST /api/cron/check_alerts` — cron_secret 검증, 5분 간격

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

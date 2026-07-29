# 다온 사전 AI 종목분석 — 운영 런북

전 유저 공유 캐시(Tier 0)를 **구독(Claude Code) 용량으로 미리 채워** 미래 API 과금을 줄이는 파이프라인.

## 비용 버킷 (핵심)

| 경로 | 생성 주체 | 비용 |
|---|---|---|
| daon `/analyze` 실호출 (`warm_analysis_cache.py`) | 저장된 Anthropic **API 키** | 종량제 ~$0.22/건 |
| **구독-생성 배치** (이 런북) | **Claude Code 구독** | 이미 낸 정액 (한계비용 ≈ 0) |

둘 다 결과는 `ai_cache`(`stock_v2:{TICKER}`) 공유 캐시에 들어가고, 이후 모든 유저가 Tier 0(무료)로 열람. 구독으로 채울수록 종량제 캐시미스가 줄어든다.

## 대상 우선순위

1. **수요 갭** (최고 ROI) — 유저가 보유·관심·발굴·분석요청했으나 미캐시인 종목 → `cache_gap_report.py`
2. **기본 세트** — 시총 top-50 × 3시장(127종목) → `analysis_targets.json` (`build_analysis_targets.py`로 갱신)
3. 그 외 breadth는 stale 비용 때문에 비추천

---

## 흐름

### A. 기본 세트 (주기적, 종량제 or 구독)
```bash
python scripts/build_analysis_targets.py          # analysis_targets.json 갱신(시총 top50×3)
# 종량제로 빠르게 채우려면:
python scripts/warm_analysis_cache.py --base-url <운영> --token <ADMIN> [--limit N]
```

### B. 수요-기반 구독 배치 (매일 남는 구독 용량 활용) ★

**1) 갭 리포트** — 운영 daon.db 읽기전용, 어디서 미래 과금이 날지 데이터로 확인
```bash
python scripts/cache_gap_report.py --top 40
# → cache_gap_report.json (점수순: 보유×3 + 관심×2 + 분석요청×1.5 + 거래×1 + 발굴×1)
#   in_default=true 는 기본세트라 A로도 채워짐. 진짜 롱테일은 in_default=false.
```

**2) 프롬프트 빌드** — daon 운영 엔드포인트와 **동일 프롬프트** 재사용(`_build_stock_analysis_prompt`)
```bash
python scripts/build_analysis_prompts.py --from cache_gap_report.json --top 15
# → analysis_prompts.jsonl  (종목별 {ticker,name,market,prompt})
#   실재하지 않는 티커는 404로 자동 스킵. 운영 DB 미접촉(temp cwd에서 import).
```

**3) 생성 (Claude Code 세션 = 구독 용량)**
- 이 세션에서 `analysis_prompts.jsonl`의 각 `prompt`로 웹리서치 후, daon JSON 스키마로 분석 생성.
- 종목별 결과를 `generated/<TICKER>.json` 로 저장. 형식:
  ```json
  { "ticker":"RXRX", "name":"...", "market":"US",
    "data": { "recommendation":"매수|보유|매도", "priceTarget":숫자|null, "summary":"...",
              "company_overview":"...", "earnings_ir":"...",
              "catalysts_short":[...], "catalysts_medium":[...], "backlog":"...",
              "analyst_views":"...", "bull":[...], "bear":[...], "verdict":"...",
              "sources":[...] } }
  ```
- 필수: `recommendation`, `summary`. 모든 수치는 출처·시점 명기, 미확인은 "확인 필요".
- 참고 완성 예시: `generated/RXRX.json` (TechBio 섹터 분기까지 반영된 실제 분석).

**4) 조립 + 검증 + 임포트**
```bash
python scripts/assemble_payload.py --in generated --out ai_cache_payload.json
#   → 필수필드 검증 + daon _audit_stock_analysis(TechBio 감사) 실행 → ai_cache_payload.json
python insert_ai_cache.py --payload ai_cache_payload.json --dry-run           # 크기/스키마 검증만
python insert_ai_cache.py --base-url <운영> --token <ADMIN> --payload ai_cache_payload.json
#   → 공유 캐시 주입(source='claude_code'). 이후 전 유저 Tier 0 열람.
```

---

## 품질·안전 원칙
- **운영 daon.db 절대 수정 금지** — gap/prompt/assemble 스크립트는 모두 읽기전용(`mode=ro`) 또는 temp cwd import.
- **프롬프트 단일 소스** — `backend.main._build_stock_analysis_prompt` 하나를 엔드포인트·배치가 공유(복제 아님). 프롬프트 개선 시 양쪽 자동 반영.
- **신선도** — 분석엔 recommendation/priceTarget/실적이 있어 시간이 지나면 낡음. 활발히 조회되는 종목은 월 1회 재생성 권장. UI는 `_computed_at`(분석 기준일)을 표시.
- **재실행 안전** — warm/import는 `force_refresh=False`/overwrite로 중복 시 건너뛰거나 갱신.

## 산출 파일
| 파일 | 생성 | 성격 |
|---|---|---|
| `analysis_targets.json` | build_analysis_targets.py | 기본세트(top50×3) |
| `cache_gap_report.json` | cache_gap_report.py | 수요 갭(점수순) |
| `analysis_prompts.jsonl` | build_analysis_prompts.py | daon 프롬프트 |
| `generated/<TICKER>.json` | Claude Code 생성 | 종목별 분석 |
| `ai_cache_payload.json` | assemble_payload.py | 임포트 페이로드 |

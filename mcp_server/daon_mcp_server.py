#!/usr/bin/env python3
"""
다온(Daon) 포트폴리오 — MCP 서버
==================================
Claude Desktop / Cowork 에서 보유 종목을 직접 읽고, AI 분석 결과를 다온 캐시에
직접 저장한다. 복붙(copy-paste) 없이 "다온 보유종목 분석해서 저장해줘" 한 마디로 동작.

권장 흐름:
  1) get_work_plan()        → 아직 분석 안 된(pending) 종목만 받는다 (이미 된 건 건너뜀)
  2) get_analysis_schema()  → 저장 시 따라야 할 분석 JSON 형식을 확인한다
  3) (Claude가 web_search로 pending 종목 분석 — 5~10개씩 나눠서)
  4) save_analysis(items)   → 결과를 다온 캐시에 저장 → 종목 탭에서 즉시 cached 표시

환경변수:
  DAON_BASE_URL  — 다온 서버 주소 (기본: http://168.107.13.20:8501)
  DAON_TOKEN     — admin 세션 Bearer 토큰
                   (브라우저 DevTools Console 에서 `localStorage.authToken`, admin 계정)

백엔드 변경 불필요 — 기존 GET /api/portfolio · GET /api/admin/ai_cache/list ·
POST /api/admin/ai_cache/import 재사용.
"""
import os
import re
import sys
import requests
from mcp.server.fastmcp import FastMCP

DAON_BASE_URL = os.environ.get("DAON_BASE_URL", "http://168.107.13.20:8501").rstrip("/")
DAON_TOKEN    = os.environ.get("DAON_TOKEN", "").strip()
READ_TIMEOUT  = 60     # 조회(보유/캐시 목록)
SAVE_TIMEOUT  = 120    # 저장(import) — 항목이 많으면 길어질 수 있어 넉넉히

mcp = FastMCP("daon-portfolio")


def _log(msg: str) -> None:
    # stderr 로만 출력 — stdout 은 MCP JSON-RPC 전용이라 절대 오염시키지 않는다.
    print(f"[daon-mcp] {msg}", file=sys.stderr, flush=True)


def _headers() -> dict:
    if not DAON_TOKEN:
        raise RuntimeError(
            "DAON_TOKEN 환경변수가 비어 있습니다. "
            "브라우저 Console 의 localStorage.authToken(admin 계정) 값을 설정하세요."
        )
    return {"Authorization": f"Bearer {DAON_TOKEN}", "Content-Type": "application/json"}


def _is_kr(ticker: str) -> bool:
    return bool(re.match(r"^A?\d{6}$", ticker or ""))


def _get_holdings() -> list:
    """보유 종목을 ticker 단위로 집계해 리스트로 반환 (내부 헬퍼)."""
    r = requests.get(f"{DAON_BASE_URL}/api/portfolio",
                     headers=_headers(), timeout=READ_TIMEOUT)
    if r.status_code == 401:
        raise RuntimeError("401 — DAON_TOKEN 만료/오류. 다시 로그인해 토큰을 갱신하세요.")
    r.raise_for_status()
    portfolios = (r.json() or {}).get("portfolios", {}) or {}

    agg: dict = {}
    for acc, holdings in portfolios.items():
        for h in holdings or []:
            tkr = str(h.get("ticker") or "").upper()
            if not tkr:
                continue
            e = agg.setdefault(tkr, {
                "ticker": tkr,
                "name": h.get("name") or tkr,
                "market": "KR" if _is_kr(tkr) else "US",
                "accounts": [],
                "quantity_total": 0.0,
            })
            if acc not in e["accounts"]:
                e["accounts"].append(acc)
            try:
                e["quantity_total"] += float(h.get("quantity") or 0)
            except (TypeError, ValueError):
                pass
    return sorted(agg.values(), key=lambda x: x["ticker"])


def _fetch_cached_tickers() -> dict:
    """이미 캐시된 분석의 ticker(대문자) → {age_hours, source} 맵.
    cache_key 형식: stock_v2:TICKER:name."""
    r = requests.get(f"{DAON_BASE_URL}/api/admin/ai_cache/list",
                     headers=_headers(), timeout=READ_TIMEOUT)
    r.raise_for_status()
    out: dict = {}
    for it in (r.json() or {}).get("items") or []:
        parts = str(it.get("cache_key") or "").split(":", 2)
        if len(parts) >= 2 and parts[0] == "stock_v2":
            out[parts[1].upper()] = {
                "age_hours": it.get("age_hours"),
                "source": it.get("source"),
            }
    return out


@mcp.tool()
def get_work_plan() -> dict:
    """분석이 '필요한 종목만' 골라준다 — 보유 종목 중 아직 캐시 안 된(pending) 목록.

    분석을 시작하기 전에 이 도구를 먼저 호출하면, 이미 분석된 종목을 다시 하지 않아
    검색 횟수와 시간이 크게 줄어든다. pending 종목만 web_search 로 분석하면 된다.
    반환: {total, cached_count, pending_count, pending:[{ticker,name,market}], cached_tickers:[...]}
    """
    holdings = _get_holdings()
    try:
        cached = _fetch_cached_tickers()
    except Exception as e:
        _log(f"cache list 조회 실패(전체를 pending 처리): {e}")
        cached = {}
    pending = [h for h in holdings if h["ticker"] not in cached]
    return {
        "total": len(holdings),
        "cached_count": len(holdings) - len(pending),
        "pending_count": len(pending),
        "pending": [{"ticker": h["ticker"], "name": h["name"], "market": h["market"]}
                    for h in pending],
        "cached_tickers": sorted(cached.keys()),
        "hint": "pending 종목만 5~10개씩 나눠 분석한 뒤 save_analysis 로 저장하세요.",
    }


@mcp.tool()
def list_holdings() -> dict:
    """다온에 등록된 내 보유 종목 전체 목록(캐시 여부 무관)을 반환한다.
    필드: ticker, name, market(KR/US), accounts, quantity_total.
    보통은 get_work_plan() 으로 pending 만 받는 게 효율적이다.
    """
    h = _get_holdings()
    return {"count": len(h), "holdings": h}


@mcp.tool()
def get_analysis_schema() -> dict:
    """save_analysis 의 각 종목 `data` 가 따라야 할 다온 분석 스키마(stock_v2)와
    필드 설명·예시를 반환한다. 분석 전에 이 스키마를 확인해 동일 형식으로 결과를 만들 것.
    """
    return {
        "required": ["recommendation", "summary"],
        "depth_rule": (
            "【필수】 각 산문 필드(company_overview·earnings_ir·analyst_views·backlog)는 최소 4문장 이상 상세 서술. "
            "catalysts/bull/bear 의 각 항목도 완결된 1-2문장(근거+구체 수치). "
            "'신제품 사이클', '높은 현금흐름' 같은 키워드·단어 나열은 금지 — 왜·얼마나·언제를 문장으로 풀 것."
        ),
        "sector_rules": [
            "STEP 0 — 섹터를 먼저 판별해 분기하라.",
            "TechBio/바이오 플랫폼(AI 신약개발 — RXRX·SDGR·EXAI 등 임상단계사)인 경우: "
            "① 공동창업자 이사회 퇴임 + 전문경영인(신약개발·상업화 전문가) 경영 전담은 '단순 경영진 불확실성 리스크'로 분류하지 말 것 "
            "— '연구 단계 → 상업화·파트너십/계약 단계 전환'의 중립~긍정 맥락으로 해석. "
            "② backlog는 제조식 수주잔고를 강제하지 말고 '잠재 마일스톤(Potential Milestones) 총액·기술수출(License-out) 계약 잠재력'으로 서술. "
            "③ peer/비교는 'AI' 키워드만으로 데이터센터(APLD)·로봇(SERV) 등 이종 섹터를 넣지 말고 'AI 신약개발 플랫폼'(SDGR·EXAI 등)으로만 구성.",
            "그 외 섹터(제조·반도체·SW·소비재 등)는 표준 절차를 따른다.",
        ],
        "fields": {
            "recommendation": "buy | hold | sell (소문자)",
            "priceTarget": "목표 주가 (숫자). US=USD, KR=KRW",
            "summary": "핵심 투자 논거 3-4문장 서술형",
            "company_overview": "회사/사업 개요·최근 동향·신사업·미래 전략을 5-7문장 상세 서술 (핵심 수치 포함)",
            "earnings_ir": "최근 분기 매출/영업이익/EPS를 컨센서스·전년동기 대비 수치로, 가이던스·CEO 발언 함의까지 5-7문장",
            "catalysts_short": "단기(0-6개월) 촉매 3개 — 각 항목 1-2문장(근거·정량 수치·시점)",
            "catalysts_medium": "중기(6-18개월) 촉매 3개 — 각 항목 1-2문장(근거·수치)",
            "backlog": "(제조·SW형) 수주 잔고/백로그/RPO 현황·추이 2-3문장. (TechBio/바이오 플랫폼) 대신 잠재 마일스톤 총액·기술수출(License-out) 잠재력을 서술. 해당 없으면 빈 문자열",
            "analyst_views": "최근 애널리스트 보고서를 기관명·목표가·의견 변동과 논거까지 4-5문장 상세",
            "bull": "강세 논거 3개 — 각 항목 1-2문장(근거)",
            "bear": "약세/리스크 3개 — 각 항목 1-2문장(근거·발생 가능성)",
            "verdict": "최종 의견 2-3문장 — 판단 근거와 조건",
            "sources": "[{url, title}] web_search 근거 배열 (환각 금지)",
        },
        "example": {
            "ticker": "AAPL",
            "name": "Apple Inc.",
            "data": {
                "recommendation": "buy",
                "priceTarget": 260,
                "summary": "FY26 Q2 서비스 매출이 두 자릿수 성장하며 전사 성장을 견인했고, 아이폰 교체 수요와 대규모 자사주 매입이 EPS를 끌어올렸다. 온디바이스 AI 전략이 서비스 ARPU를 추가로 끌어올릴 여지가 크다. 밸류에이션 부담은 있으나 현금흐름과 생태계 락인이 이를 정당화한다.",
                "company_overview": "Apple은 아이폰·맥·웨어러블 하드웨어와 앱스토어·구독 서비스를 결합한 생태계 기업이다. 최근 Apple Intelligence(온디바이스 AI)를 핵심 전략으로 제시하며 기기 교체 사이클을 자극하고 있다. 서비스 부문은 전사 매출의 약 X%까지 확대되어 마진 구조를 개선 중이다. (… 총 5-7문장, 수치 포함)",
                "earnings_ir": "FY26 Q2 매출 $X십억(YoY +x%, 컨센서스 대비 +y%), EPS $z로 컨센서스를 상회했다. 서비스 매출은 사상 최대치를 기록했고, 그로스 마진은 전분기 대비 개선됐다. 경영진은 다음 분기 가이던스로 한 자릿수 후반 성장을 제시했다. (… 총 5-7문장)",
                "catalysts_short": [
                    "2026년 하반기 신형 아이폰 출시로 교체 수요가 확대되며, 상위 모델 비중 상승으로 ASP가 오를 전망이다 (9월 출시 예정).",
                    "(… 1-2문장씩 2개 더)",
                ],
                "catalysts_medium": [
                    "Apple Intelligence 유료화와 신규 서비스로 서비스 ARPU가 추가 상승해 향후 12개월 매출 기여가 본격화될 전망이다.",
                    "(… 2개 더)",
                ],
                "backlog": "하드웨어 특성상 전통적 수주잔고 개념은 제한적이나, 서비스 구독의 이연매출이 분기마다 꾸준히 증가하며 실적 가시성을 높이고 있다.",
                "analyst_views": "최근 30일 Morgan Stanley는 목표가 $X로 상향(비중확대 유지), Goldman Sachs는 매수 의견을 재확인했다. 컨센서스 평균 목표가는 $Y로 현재가 대비 상승 여력을 시사한다. (… 4-5문장)",
                "bull": [
                    "서비스 매출 비중 확대로 마진 구조가 개선되어 밸류에이션 프리미엄을 정당화한다.",
                    "(… 2개 더)",
                ],
                "bear": [
                    "중국 시장 매출 의존도가 높아 지정학·수요 둔화 리스크에 노출된다.",
                    "(… 2개 더)",
                ],
                "verdict": "서비스·AI 수익화가 본격화되는 국면의 중장기 보유 우량주다. 단기 밸류에이션 부담이 있어 분할 매수를 권장한다.",
                "sources": [{"url": "https://...", "title": "AAPL FY26 Q2 실적"}],
            },
        },
        "notes": [
            "위 example 처럼 '문장'으로 작성. 키워드 나열은 다온 화면에서 무성의하게 보이므로 금지.",
            "한국 종목(6자리 코드)도 가능하면 분석 시도. 외부 시세는 제한적일 수 있음.",
            "sources 는 web_search 로 찾은 실제 URL 만. 추측 URL 금지.",
            "recommendation/priceTarget 은 개인 투자권유가 아니라 리서치 요약임을 전제.",
        ],
    }


@mcp.tool()
def save_analysis(items: list, overwrite: bool = False) -> dict:
    """분석 결과를 다온 캐시에 저장한다. 저장 즉시 종목 탭에서 cached 로 표시된다.

    items: [{ticker, name, data}] — data 는 get_analysis_schema 형식(recommendation, summary 필수).
    overwrite=False(기본): 이미 캐시가 있으면 건너뜀(skipped). 새로 덮어쓰려면 True.
    ⚠ 한 번에 5~10개 이하로 나눠 저장하면 타임아웃 위험이 줄어든다.
    반환: {imported, skipped, failed, total_in_cache, audit_warnings} 또는 {error}.

    ★ 응답의 audit_warnings 에 항목이 있으면(예: TechBio 종목의 경영진 오분류·제조식 백로그),
      해당 종목을 sector_rules 에 맞게 다시 작성해 overwrite=True 로 재저장하라. (출력 품질 자가 교정 루프)
    """
    if not isinstance(items, list) or not items:
        return {"error": "items 는 {ticker, name, data} 객체의 비어있지 않은 배열이어야 합니다."}

    payload = {"items": items, "overwrite": bool(overwrite)}
    last_err = None
    for attempt in (1, 2):
        try:
            r = requests.post(f"{DAON_BASE_URL}/api/admin/ai_cache/import",
                              headers=_headers(), json=payload, timeout=SAVE_TIMEOUT)
            if r.status_code == 401:
                return {"error": "401 — DAON_TOKEN 만료/오류. 다시 로그인해 토큰을 갱신하세요."}
            if r.status_code == 403:
                return {"error": "403 — DAON_TOKEN 이 admin 계정 토큰이어야 합니다."}
            r.raise_for_status()
            return r.json()
        except requests.exceptions.Timeout:
            last_err = f"timeout({SAVE_TIMEOUT}s) — 시도 {attempt}/2"
            _log(f"save {last_err}")
        except Exception as e:
            last_err = f"{type(e).__name__}: {str(e)[:200]}"
            _log(f"save 실패 시도 {attempt}/2: {last_err}")
    return {"error": f"저장 실패(재시도 후): {last_err}. "
                     f"items 개수를 5개 이하로 줄여 다시 시도하세요."}


if __name__ == "__main__":
    _log(f"start — base={DAON_BASE_URL} token={'set' if DAON_TOKEN else 'MISSING'}")
    # 기본 stdio 트랜스포트 — Claude Desktop 이 프로세스를 직접 실행/통신
    mcp.run()

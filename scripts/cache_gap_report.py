#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
다온 — 수요 기반 캐시-갭 리포트 (읽기 전용).

"유저가 실제로 건드렸는데(보유·관심·발굴·거래·분석요청) 아직 공유 캐시에 없는 종목"을
수요 점수 순으로 뽑는다. 이 목록이 곧 '다음에 구독 용량으로 미리 생성하면 미래 API 과금을
가장 많이 줄일 종목'이다.

⚠️ 운영 daon.db는 절대 수정하지 않는다 — sqlite `mode=ro`(읽기전용 URI)로만 연다.

수요 신호 & 가중치:
  - 보유(portfolios)      : 보유 유저 수 × 3   (가장 강한 신호 — 반드시 본다)
  - 관심(watchlist)       : 관심 유저 수 × 2
  - 분석요청(audit_log)   : stock_analyze ai_call 횟수 × 1.5  (이미 API 비용 발생분)
  - 거래(transactions)    : 거래 유저 수 × 1
  - 발굴(discovery_scores): 등재 1건당 × 1

캐시 판정: ai_cache 에 'stock_v2:{TICKER}:%' 키가 있으면 '캐시됨' → 갭에서 제외.
기본세트(analysis_targets.json)에 포함된 종목은 in_default=true 로 표시(어차피 워머로 채워짐).

출력: cache_gap_report.json + 상위 N 표 출력.
사용:
  python scripts/cache_gap_report.py [--db ../daon.db] [--top 40] [--out cache_gap_report.json]
"""
import argparse
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp949 콘솔에서도 한글/기호 출력 안전
except Exception:
    pass

KR_RE = re.compile(r"^A?\d{6}$")

W_HOLD = 3.0
W_WATCH = 2.0
W_ANALYZE = 1.5
W_TX = 1.0
W_DISCOVER = 1.0


def _market(ticker: str) -> str:
    return "KR" if KR_RE.match(ticker or "") else "US"


def _norm(ticker: str) -> str:
    t = (ticker or "").strip().upper()
    if t.startswith("A") and re.match(r"^A\d{6}$", t):  # A005930 → 005930
        t = t[1:]
    return t


def _ro_conn(db_path: str) -> sqlite3.Connection:
    if not os.path.exists(db_path):
        sys.exit(f"DB 없음: {db_path}")
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)  # 읽기 전용 — 운영 DB 보호
    con.row_factory = sqlite3.Row
    return con


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_db = os.path.normpath(os.path.join(here, "..", "daon.db"))
    default_targets = os.path.normpath(os.path.join(here, "..", "analysis_targets.json"))

    ap = argparse.ArgumentParser(description="다온 수요 기반 캐시-갭 리포트 (읽기 전용)")
    ap.add_argument("--db", default=default_db)
    ap.add_argument("--targets", default=default_targets,
                    help="기본세트 파일(in_default 표시용). 없으면 무시.")
    ap.add_argument("--top", type=int, default=40, help="표에 출력할 상위 종목 수")
    ap.add_argument("--out", default="cache_gap_report.json")
    ap.add_argument("--include-cached", action="store_true",
                    help="이미 캐시된 종목도 리포트에 포함(디버그)")
    args = ap.parse_args()

    con = _ro_conn(args.db)
    c = con.cursor()

    # 종목별 수요 누적: {ticker: {name, market, hold, watch, analyze, tx, discover, score}}
    demand = defaultdict(lambda: {"name": "", "hold": 0, "watch": 0,
                                  "analyze": 0, "tx": 0, "discover": 0})

    def note_name(tk, nm):
        if nm and not demand[tk]["name"]:
            demand[tk]["name"] = nm.strip()

    # 보유 — 보유 유저 수(distinct)
    for r in c.execute("SELECT ticker, name, COUNT(DISTINCT user_id) AS n "
                       "FROM portfolios WHERE ticker IS NOT NULL AND ticker!='' "
                       "GROUP BY ticker"):
        tk = _norm(r["ticker"]); demand[tk]["hold"] += r["n"]; note_name(tk, r["name"])
    # 관심
    for r in c.execute("SELECT ticker, name, COUNT(DISTINCT user_id) AS n "
                       "FROM watchlist WHERE ticker IS NOT NULL AND ticker!='' "
                       "GROUP BY ticker"):
        tk = _norm(r["ticker"]); demand[tk]["watch"] += r["n"]; note_name(tk, r["name"])
    # 거래
    try:
        for r in c.execute("SELECT ticker, name, COUNT(DISTINCT user_id) AS n "
                           "FROM transactions WHERE ticker IS NOT NULL AND ticker!='' "
                           "GROUP BY ticker"):
            tk = _norm(r["ticker"]); demand[tk]["tx"] += r["n"]; note_name(tk, r["name"])
    except sqlite3.Error:
        pass
    # 발굴
    try:
        for r in c.execute("SELECT ticker, name FROM discovery_scores "
                           "WHERE ticker IS NOT NULL AND ticker!=''"):
            tk = _norm(r["ticker"]); demand[tk]["discover"] += 1; note_name(tk, r["name"])
    except sqlite3.Error:
        pass
    # 분석요청 (audit_log details JSON)
    for r in c.execute("SELECT details FROM audit_log WHERE event_type='ai_call'"):
        try:
            o = json.loads(r["details"] or "{}")
        except Exception:
            continue
        if o.get("kind") == "stock_analyze" and o.get("ticker"):
            demand[_norm(o["ticker"])]["analyze"] += 1

    # 이미 캐시된 티커 (stock_v2:{TICKER}:...)
    cached = set()
    for r in c.execute("SELECT cache_key FROM ai_cache WHERE cache_key LIKE 'stock_v2:%'"):
        m = re.match(r"stock_v2:([^:]+):", r["cache_key"])
        if m:
            cached.add(_norm(m.group(1)))
    con.close()

    # 기본세트(analysis_targets.json)
    default_set = set()
    if os.path.exists(args.targets):
        try:
            td = json.load(open(args.targets, encoding="utf-8"))
            default_set = {_norm(t["ticker"]) for t in td.get("targets", [])}
        except Exception:
            pass

    # 점수 계산 + 갭 필터
    rows = []
    for tk, d in demand.items():
        score = (d["hold"] * W_HOLD + d["watch"] * W_WATCH + d["analyze"] * W_ANALYZE
                 + d["tx"] * W_TX + d["discover"] * W_DISCOVER)
        if score <= 0:
            continue
        is_cached = tk in cached
        if is_cached and not args.include_cached:
            continue
        srcs = [s for s, v in (("hold", d["hold"]), ("watch", d["watch"]),
                               ("analyze", d["analyze"]), ("tx", d["tx"]),
                               ("discover", d["discover"])) if v]
        rows.append({
            "ticker": tk,
            "name": d["name"],
            "market": _market(tk),
            "score": round(score, 1),
            "holders": d["hold"], "watchers": d["watch"],
            "analyzed": d["analyze"], "traders": d["tx"], "discovered": d["discover"],
            "sources": srcs,
            "in_default": tk in default_set,
            "cached": is_cached,
        })
    rows.sort(key=lambda x: (-x["score"], x["ticker"]))

    payload = {
        "_note": "수요 기반 캐시-갭 — 유저가 건드렸으나 미캐시인 종목(점수순). "
                 "구독 용량으로 이 순서대로 미리 생성하면 미래 API 과금 절감이 가장 크다.",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "db": os.path.abspath(args.db),
        "cached_count": len(cached),
        "demand_universe": len(demand),
        "gap_count": sum(1 for r in rows if not r["cached"]),
        "gap_not_in_default": sum(1 for r in rows if not r["cached"] and not r["in_default"]),
        "weights": {"hold": W_HOLD, "watch": W_WATCH, "analyze": W_ANALYZE,
                    "tx": W_TX, "discover": W_DISCOVER},
        "gaps": rows,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # 콘솔 요약
    print(f"캐시됨 {payload['cached_count']}종목 · 갭 {payload['gap_count']}종목 "
          f"(그중 기본세트 밖 {payload['gap_not_in_default']}종목) → {args.out}")
    print(f"{'rank':>4} {'ticker':<8}{'mkt':<4}{'score':>6}  {'signals':<22} name")
    for i, r in enumerate(rows[:args.top], 1):
        sig = f"H{r['holders']} W{r['watchers']} A{r['analyzed']} T{r['traders']} D{r['discovered']}"
        flag = " ★기본" if r["in_default"] else ""
        print(f"{i:>4} {r['ticker']:<8}{r['market']:<4}{r['score']:>6.1f}  {sig:<22} {r['name'][:24]}{flag}")


if __name__ == "__main__":
    main()

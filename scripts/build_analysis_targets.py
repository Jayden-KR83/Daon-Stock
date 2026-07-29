#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
다온 — 사전 AI 종목분석 타깃 리스트 생성기 (top-50 × 3개 시장).

대상 (오너 지시, 2026-07): 시가총액 기준
  - S&P 500 상위 50종목
  - NASDAQ-100 상위 50종목  (나스닥 대형주 = 시총 상위)
  - KOSPI 상위 50종목

출력: analysis_targets.json  (ai_cache_targets.json 과 동일 스키마)
  { _note, generated_at, count, targets:[{ticker,name,market,source,rank}] }

이 파일이 사전분석 배치의 '기본(default) 대상'이다. 주기적으로 재실행해 갱신하면
시총 순위 변동이 반영된다. US 심볼은 yfinance 규약(BRK.B→BRK-B)으로 정규화.

데이터 출처:
  US : stockanalysis.com/list/{sp-500,nasdaq-100}-stocks (시총 컬럼 제공)
  KR : finance.naver.com/sise/sise_market_sum (시총 내림차순 기본 정렬)
스크래핑이 막히면(HTTP 403 등) 해당 시장은 건너뛰고 경고만 남긴다.
"""
import json
import re
import sys
from datetime import datetime
from io import StringIO

import pandas as pd
import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp949 콘솔에서도 한글/기호 출력 안전
except Exception:
    pass

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
TOP_N = 50
OUT_PATH = "analysis_targets.json"


def _parse_mktcap(s) -> float:
    """'3.85T' / '512.30B' / '$45,000M' → USD 실수. 파싱 불가면 0."""
    if s is None:
        return 0.0
    t = str(s).strip().upper().replace("$", "").replace(",", "")
    m = re.match(r"^([0-9.]+)\s*([TBMK]?)", t)
    if not m:
        return 0.0
    val = float(m.group(1))
    mult = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3, "": 1.0}[m.group(2)]
    return val * mult


def _norm_us(sym: str) -> str:
    """US 심볼 정규화 — yfinance/daon 규약 (BRK.B → BRK-B)."""
    return str(sym).strip().upper().replace(".", "-")


def fetch_us(url: str, source: str) -> list:
    """stockanalysis.com 상장 리스트 → 시총 상위 TOP_N."""
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    df = pd.read_html(StringIO(r.text))[0]
    df = df.rename(columns={"Company Name": "name", "Market Cap": "cap", "Symbol": "sym"})
    df["cap_usd"] = df["cap"].map(_parse_mktcap)
    df = df[df["sym"].notna() & (df["cap_usd"] > 0)]
    df = df.sort_values("cap_usd", ascending=False).head(TOP_N)
    out = []
    for rank, (_, row) in enumerate(df.iterrows(), 1):
        out.append({
            "ticker": _norm_us(row["sym"]),
            "name": str(row["name"]).strip(),
            "market": "US",
            "source": source,
            "rank": rank,
        })
    return out


def fetch_kospi() -> list:
    """네이버 시가총액 순위(코스피, sosok=0) 1~2페이지 → 상위 TOP_N."""
    out, rank = [], 0
    for page in (1, 2):
        url = f"https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page={page}"
        r = requests.get(url, headers=HEADERS, timeout=12)
        r.encoding = "euc-kr"
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.select("table.type_2 a.tltle"):
            href = a.get("href", "")
            m = re.search(r"code=(\d{6})", href)
            if not m:
                continue
            rank += 1
            if rank > TOP_N:
                break
            out.append({
                "ticker": m.group(1),
                "name": a.get_text(strip=True),
                "market": "KR",
                "source": "naver_market_sum",
                "rank": rank,
            })
        if rank >= TOP_N:
            break
    return out


def main():
    targets, warnings = [], []

    # ── US: S&P500 + NASDAQ-100 (심볼 기준 dedupe, S&P500 우선) ──
    us_by_sym = {}
    for url, src in (
        ("https://stockanalysis.com/list/sp-500-stocks/", "sp500_top50"),
        ("https://stockanalysis.com/list/nasdaq-100-stocks/", "nasdaq100_top50"),
    ):
        try:
            for t in fetch_us(url, src):
                key = t["ticker"]
                if key in us_by_sym:
                    # 이미 있으면 출처만 병합 (예: S&P500 ∩ NASDAQ)
                    us_by_sym[key]["source"] += f",{src}"
                else:
                    us_by_sym[key] = t
        except Exception as e:
            warnings.append(f"US {src} 실패: {e}")
    targets.extend(us_by_sym.values())

    # ── KR: KOSPI 시총 50위 ──
    try:
        targets.extend(fetch_kospi())
    except Exception as e:
        warnings.append(f"KOSPI 실패: {e}")

    payload = {
        "_note": ("다온 사전 AI 종목분석 기본 대상 — 시총 상위 S&P500 50 + NASDAQ-100 50 "
                  "(US는 심볼 dedupe) + KOSPI 50. scripts/build_analysis_targets.py 로 갱신."),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(targets),
        "us_count": len(us_by_sym),
        "kr_count": sum(1 for t in targets if t["market"] == "KR"),
        "warnings": warnings,
        "targets": targets,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"저장: {OUT_PATH}")
    print(f"  US(dedupe) {payload['us_count']}종목 · KR {payload['kr_count']}종목 · 합계 {payload['count']}")
    if warnings:
        print("경고:", *warnings, sep="\n  ")
        sys.exit(2)


if __name__ == "__main__":
    main()

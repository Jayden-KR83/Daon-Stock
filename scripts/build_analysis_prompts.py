#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
다온 — 구독-생성 배치 1/3: 프롬프트 빌드.

캐시-갭(또는 임의 티커 목록)에 대해 **daon 운영 엔드포인트와 동일한 프롬프트**를
조립한다(= backend.main._build_stock_analysis_prompt 재사용, 코드 복제 아님).
결과를 analysis_prompts.jsonl 로 저장 → Claude Code(구독)가 이 프롬프트로 웹리서치+생성.

⚠️ 운영 daon.db 보호: main.py 를 import하면 _init_db()가 cwd에 daon.db를 만들고
   마이그레이션(ALTER)까지 돌린다. 그래서 이 스크립트는 **임시 디렉터리로 chdir 후**
   main을 import한다(운영 DB 미접촉). 종목 컨텍스트(가격/펀더/뉴스)는 네트워크로 가져온다.

입력 우선순위:
  --tickers AAPL,RXRX ...     (직접 지정)
  또는 --from cache_gap_report.json  (기본; 기본세트 밖 갭을 점수순으로 top N)
사용:
  python scripts/build_analysis_prompts.py --from cache_gap_report.json --top 15
  python scripts/build_analysis_prompts.py --tickers RXRX,AVGO --include-default
"""
import argparse
import json
import os
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp949 콘솔에서도 한글/기호 출력 안전
except Exception:
    pass


def _load_targets(args):
    if args.tickers:
        return [{"ticker": t.strip().upper(), "name": ""}
                for t in args.tickers.split(",") if t.strip()]
    if not os.path.exists(args.from_):
        sys.exit(f"입력 파일 없음: {args.from_} (먼저 cache_gap_report.py 실행 또는 --tickers 지정)")
    data = json.load(open(args.from_, encoding="utf-8"))
    gaps = data.get("gaps", data.get("targets", []))
    out = []
    for g in gaps:
        if g.get("cached"):
            continue
        if (not args.include_default) and g.get("in_default"):
            continue
        out.append({"ticker": g["ticker"], "name": g.get("name", "")})
        if args.top and len(out) >= args.top:
            break
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    backend = os.path.normpath(os.path.join(here, "..", "backend"))

    ap = argparse.ArgumentParser(description="다온 구독-생성 배치: daon 프롬프트 빌드")
    ap.add_argument("--from", dest="from_", default="cache_gap_report.json")
    ap.add_argument("--tickers", help="쉼표구분 티커 직접지정 (예: RXRX,AVGO)")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--include-default", action="store_true",
                    help="기본세트(analysis_targets.json) 포함 종목도 빌드")
    ap.add_argument("--out", default="analysis_prompts.jsonl")
    args = ap.parse_args()

    targets = _load_targets(args)
    if not targets:
        sys.exit("빌드할 종목이 없습니다.")

    # 운영 DB 보호: 임시 cwd에서 main import (여기서 _init_db는 버려지는 temp DB에 실행)
    sys.path.insert(0, backend)
    os.chdir(tempfile.mkdtemp(prefix="daon-prompt-"))
    import main  # noqa: E402
    from fastapi import HTTPException  # noqa: E402

    outpath = os.path.join(here, "..", args.out)
    outpath = os.path.normpath(outpath)
    ok, skipped = 0, []
    with open(outpath, "w", encoding="utf-8") as f:
        for t in targets:
            tk, nm = t["ticker"], t.get("name", "")
            try:
                prompt, company = main._build_stock_analysis_prompt(tk, nm)
            except HTTPException as e:
                skipped.append((tk, f"{e.status_code} {str(e.detail)[:40]}"))
                print(f"  skip {tk}: {e.status_code} {str(e.detail)[:40]}")
                continue
            except Exception as e:
                skipped.append((tk, str(e)[:50]))
                print(f"  skip {tk}: {str(e)[:50]}")
                continue
            rec = {"ticker": tk, "name": company or nm,
                   "market": "KR" if main.is_kr(tk) else "US", "prompt": prompt}
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            ok += 1
            print(f"  built {tk} ({company})  prompt {len(prompt):,}자")

    print(f"\n완료 — {ok}종목 프롬프트 → {outpath}"
          + (f" · 건너뜀 {len(skipped)}" if skipped else ""))
    print("다음 단계: Claude Code 세션에서 이 jsonl 의 각 prompt로 웹리서치+생성 → "
          "종목별 결과를 generated/<TICKER>.json 로 저장 → assemble_payload.py")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
다온 — 구독-생성 배치 3/3: 페이로드 조립 + 검증.

Claude Code(구독)가 생성한 종목별 결과(generated/<TICKER>.json)를 모아
insert_ai_cache.py 가 먹는 스키마([{ticker,name,data,source}])로 병합한다.

각 결과 파일 형식(생성 단계 산출물):
  { "ticker":"RXRX", "name":"Recursion Pharmaceuticals", "market":"US",
    "data": { recommendation, priceTarget, summary, company_overview, earnings_ir,
              catalysts_short[], catalysts_medium[], backlog, analyst_views,
              bull[], bear[], verdict, sources[] } }

검증:
  - 필수(import 요구): data.recommendation, data.summary  → 없으면 제외
  - 권장 필드 누락은 경고만
  - daon _audit_stock_analysis(TechBio 섹터 로직) 위반 시 경고 (운영 서버 감사와 동일 로직 재사용)

출력: ai_cache_payload.json  (source 기본 'claude_code')
사용:
  python scripts/assemble_payload.py --in generated --out ai_cache_payload.json
  이후: python insert_ai_cache.py --base-url <운영> --token <ADMIN> --payload ai_cache_payload.json
"""
import argparse
import glob
import json
import os
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp949 콘솔에서도 한글/기호 출력 안전
except Exception:
    pass

REQUIRED = ("recommendation", "summary")
RECOMMENDED = ("company_overview", "earnings_ir", "catalysts_short", "catalysts_medium",
               "backlog", "analyst_views", "bull", "bear", "verdict")


def _load_items(inpath):
    items = []
    if os.path.isdir(inpath):
        files = sorted(glob.glob(os.path.join(inpath, "*.json")))
        for fp in files:
            try:
                items.append((os.path.basename(fp), json.load(open(fp, encoding="utf-8"))))
            except Exception as e:
                print(f"  [무시] {fp} 로드 실패: {e}", file=sys.stderr)
    elif inpath.endswith(".jsonl"):
        for i, line in enumerate(open(inpath, encoding="utf-8")):
            line = line.strip()
            if line:
                items.append((f"line{i}", json.loads(line)))
    else:
        items = [(inpath, o) for o in json.load(open(inpath, encoding="utf-8"))]
    return items


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    backend = os.path.normpath(os.path.join(here, "..", "backend"))

    ap = argparse.ArgumentParser(description="다온 생성결과 → insert 페이로드 조립 + 검증")
    ap.add_argument("--in", dest="inpath", default="generated",
                    help="생성결과 디렉터리 / .jsonl / .json 배열")
    ap.add_argument("--out", default="ai_cache_payload.json")
    ap.add_argument("--source", default="claude_code")
    ap.add_argument("--no-audit", action="store_true", help="daon TechBio 감사 생략")
    args = ap.parse_args()

    raw = _load_items(args.inpath)
    if not raw:
        sys.exit(f"입력 없음: {args.inpath}")

    audit = None
    if not args.no_audit:
        sys.path.insert(0, backend)
        os.chdir(tempfile.mkdtemp(prefix="daon-assemble-"))  # 운영 DB 보호
        import main  # noqa: E402
        audit = main._audit_stock_analysis

    payload, dropped, warns = [], [], []
    for label, obj in raw:
        tk = (obj.get("ticker") or "").strip().upper()
        data = obj.get("data") if isinstance(obj.get("data"), dict) else None
        if not tk or not data:
            dropped.append((label, "ticker/data 누락")); continue
        miss_req = [k for k in REQUIRED if not (isinstance(data.get(k), str) and data[k].strip())]
        if miss_req:
            dropped.append((tk, f"필수필드 누락: {miss_req}")); continue
        miss_rec = [k for k in RECOMMENDED if not data.get(k)]
        if miss_rec:
            warns.append((tk, f"권장필드 누락: {miss_rec}"))
        if audit:
            issues = audit(tk, data)
            if issues:
                warns.append((tk, f"감사경고: {issues}"))
        payload.append({
            "ticker": tk,
            "name": obj.get("name", ""),
            "data": data,
            "source": args.source,
        })

    outpath = os.path.join(here, "..", args.out) if not os.path.isabs(args.out) else args.out
    outpath = os.path.normpath(outpath)
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"조립 완료 — {len(payload)}종목 → {outpath}")
    if warns:
        print(f"경고 {len(warns)}건:")
        for tk, m in warns[:20]:
            print(f"  {tk}: {m}")
    if dropped:
        print(f"제외 {len(dropped)}건(필수필드 미충족):")
        for tk, m in dropped[:20]:
            print(f"  {tk}: {m}")
    print("\n다음: python insert_ai_cache.py --base-url <운영> --token <ADMIN> "
          f"--payload {args.out}  (검증만: --dry-run)")
    if not payload:
        sys.exit(2)


if __name__ == "__main__":
    main()

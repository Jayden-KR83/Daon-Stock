#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
다온 — 사전 AI 종목분석 캐시 워머 (default 세트 채우기).

analysis_targets.json(시총 top-50 × 3시장)의 각 종목에 대해 운영 서버의
  POST /api/stock/{ticker}/analyze  (Sonnet 4.6 + web_search)
를 호출해 **전 유저 공유 캐시**(stock_v2:{TICKER})를 미리 채운다.
→ 이후 모든 유저는 Tier 0(무료·무제한)로 이 분석을 열람할 수 있다.

특징:
  - force_refresh=False → 이미 캐시된 종목은 서버가 즉시 반환(재분석 비용 0).
    따라서 재실행 시 '빠진 종목만' 새로 생성한다(증분).
  - 429/529는 대기 후 1회 재시도. 실패 종목은 목록으로 리포트.
  - --limit N 으로 이번 실행에서 신규 생성할 종목 수 상한(비용 제어).

인증: insert_ai_cache.py 와 동일 (admin --token 또는 --email/--password 로그인).

사용:
  python scripts/warm_analysis_cache.py --base-url https://<도메인> \
      --email admin@example.com --password '****'
  python scripts/warm_analysis_cache.py --base-url http://localhost:8000 \
      --token <ADMIN_BEARER> --limit 20
"""
import argparse
import json
import sys
import time

import requests

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp949 콘솔에서도 한글/기호 출력 안전
except Exception:
    pass

FRESH_COST_EST = 0.22  # 신규 생성 1건당 대략 비용(USD) — Sonnet4.6+web_search


def _login(base_url, email, password):
    r = requests.post(f"{base_url}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    tok = r.json().get("token")
    if not tok:
        sys.exit(f"로그인 응답에 토큰이 없습니다: {r.text[:200]}")
    return tok


def _analyze(base_url, token, ticker, name):
    url = f"{base_url}/api/stock/{ticker}/analyze"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"name": name, "force_refresh": False}
    resp = requests.post(url, headers=headers, json=body, timeout=210)
    if resp.status_code in (429, 529):
        ra = resp.headers.get("retry-after")
        time.sleep(min(30, max(5, int(float(ra)))) if ra else 15)
        resp = requests.post(url, headers=headers, json=body, timeout=210)
    return resp


def main():
    ap = argparse.ArgumentParser(description="다온 사전 종목분석 캐시 워머")
    ap.add_argument("--targets", default="analysis_targets.json")
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--token")
    ap.add_argument("--email")
    ap.add_argument("--password")
    ap.add_argument("--limit", type=int, default=0,
                    help="이번 실행에서 신규 생성할 종목 수 상한(0=무제한). 비용 제어용.")
    ap.add_argument("--only", choices=["US", "KR"], help="특정 시장만")
    args = ap.parse_args()

    try:
        data = json.load(open(args.targets, encoding="utf-8"))
    except Exception as e:
        sys.exit(f"타깃 로드 실패({args.targets}): {e}")
    targets = data.get("targets", [])
    if args.only:
        targets = [t for t in targets if t.get("market") == args.only]
    if not targets:
        sys.exit("대상 종목이 없습니다.")

    token = args.token
    if not token:
        if not args.email:
            sys.exit("--token 또는 --email 필요")
        pw = args.password
        if not pw:
            import getpass
            pw = getpass.getpass(f"{args.email} 비밀번호 (입력 숨김): ")
        token = _login(args.base_url, args.email, pw)

    print(f"대상 {len(targets)}종목 — 캐시된 것은 건너뜀(비용 0), 신규만 생성"
          + (f" (신규 상한 {args.limit})" if args.limit else ""))
    hit = fresh = fail = 0
    failed = []
    for i, t in enumerate(targets, 1):
        tk, name = t["ticker"], t.get("name", "")
        if args.limit and fresh >= args.limit:
            print(f"  [{i}/{len(targets)}] 신규 상한 {args.limit} 도달 — 나머지 중단")
            break
        try:
            resp = _analyze(args.base_url, token, tk, name)
            if resp.status_code != 200:
                fail += 1
                failed.append((tk, resp.status_code, resp.text[:120]))
                print(f"  [{i}/{len(targets)}] {tk:6} 실패 {resp.status_code}")
                continue
            j = resp.json()
            if j.get("_cached"):
                hit += 1
                print(f"  [{i}/{len(targets)}] {tk:6} 캐시됨(skip)")
            else:
                fresh += 1
                print(f"  [{i}/{len(targets)}] {tk:6} 신규 생성 ✓  ({j.get('recommendation','?')})")
                time.sleep(1.0)  # 신규 생성 간 완충
        except Exception as e:
            fail += 1
            failed.append((tk, "EXC", str(e)[:120]))
            print(f"  [{i}/{len(targets)}] {tk:6} 예외: {e}")

    print(f"\n완료 — 캐시히트 {hit} · 신규생성 {fresh} · 실패 {fail}")
    print(f"이번 실행 추정 비용: 약 ${fresh * FRESH_COST_EST:.2f} (신규 {fresh}건 × ~${FRESH_COST_EST})")
    if failed:
        print("실패 목록:")
        for tk, code, msg in failed[:20]:
            print(f"  {tk} [{code}] {msg}")
        sys.exit(2)


if __name__ == "__main__":
    main()

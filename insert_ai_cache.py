#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
다온 — AI 분석 결과 일괄 import 스크립트 (재구성판, 방어 로직 내장).

용도:
  Claude가 웹리서치로 생성한 종목 분석 JSON(ai_cache_payload.json)을
  운영 서버의 /api/admin/ai_cache/import 엔드포인트로 일괄 inject.

왜 방어 로직이 여기에 또 필요한가 (사전 분석 결론):
  - 기존 배치(Batch 4)가 'no low surrogate' + '4.8MB 초과 → 400'으로 멈춘 지점은
    backend/main.py의 FastAPI 경로가 아니라 바로 이 스크립트의 requests.post(json=...) 였다.
  - backend의 _anthropic_post 방어는 이 스크립트를 거치지 않으므로 혜택이 없다.
  - 따라서 동일한 sanitize(서로게이트 제거) + truncate(종목당 50,000자) +
    배치 청크/바디 크기 가드를 이 스크립트 안에 직접 심어 재발을 차단한다.

사용법:
  # 1) 토큰 직접 지정
  python insert_ai_cache.py --base-url https://<도메인> --token <ADMIN_BEARER> \
      --payload ai_cache_payload.json

  # 2) 이메일/비번으로 로그인 후 토큰 획득
  python insert_ai_cache.py --base-url https://<도메인> \
      --email admin@example.com --password '****' --payload ai_cache_payload.json

  # 3) 서버 없이 정제/청크 결과만 검증 (전송 안 함)
  python insert_ai_cache.py --payload ai_cache_payload.json --dry-run
"""
import argparse
import json
import sys
import time

import requests

# ── 종목당 텍스트 필드 상한 (backend.MAX_STOCK_PAYLOAD_CHARS와 동일) ──
MAX_FIELD_CHARS = 50_000
# ── 한 번의 POST 바디 최대 크기 (4.8MB 400 재발 방지). 초과 시 배치를 더 잘게 분할 ──
MAX_BODY_BYTES = 3_000_000          # 3MB — 서버/프록시 기본 한도 여유분
DEFAULT_BATCH_SIZE = 8              # 한 배치 종목 수 (10 → 8로 보수적)


def _sanitize_unicode(s):
    """lone surrogate 등 JSON 직렬화 불가 문자를 제거 (encode utf-8 ignore → decode)."""
    if not isinstance(s, str):
        return s
    return s.encode("utf-8", "ignore").decode("utf-8", "ignore")


def _truncate_head(s, limit=MAX_FIELD_CHARS):
    """텍스트가 limit를 넘으면 상위(최신) 내용만 남기고 잘라냄."""
    if not isinstance(s, str) or len(s) <= limit:
        return s
    return s[:limit] + "\n…(이하 생략 — 입력 길이 제한)"


def _clean(obj, truncate=True):
    """payload를 재귀적으로 정제: 모든 문자열을 sanitize + (옵션) truncate."""
    if isinstance(obj, str):
        s = _sanitize_unicode(obj)
        return _truncate_head(s) if truncate else s
    if isinstance(obj, dict):
        return {k: _clean(v, truncate) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v, truncate) for v in obj]
    return obj


def _body_bytes(items):
    """이 items 묶음을 POST할 때의 실제 바디 크기(bytes) 추정."""
    return len(json.dumps({"items": items, "overwrite": True},
                          ensure_ascii=True).encode("utf-8"))


def _chunk(items, batch_size):
    """items를 batch_size로 1차 분할하고, 바디가 MAX_BODY_BYTES를 넘으면 반으로 재분할."""
    out = []
    for i in range(0, len(items), batch_size):
        group = items[i:i + batch_size]
        # 바디 크기 초과 시 1개가 될 때까지 절반씩 쪼갬
        stack = [group]
        while stack:
            g = stack.pop(0)
            if len(g) > 1 and _body_bytes(g) > MAX_BODY_BYTES:
                mid = len(g) // 2
                stack.insert(0, g[mid:])
                stack.insert(0, g[:mid])
            else:
                out.append(g)
    return out


def _login(base_url, email, password):
    r = requests.post(f"{base_url}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    tok = r.json().get("token")
    if not tok:
        sys.exit(f"로그인 응답에 토큰이 없습니다: {r.text[:200]}")
    return tok


def _post_batch(base_url, token, items):
    """정제된 items 한 묶음을 import 엔드포인트로 POST. 429/529 1회 재시도."""
    url = f"{base_url}/api/admin/ai_cache/import"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"items": items, "overwrite": True}
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    if resp.status_code in (429, 529):
        ra = resp.headers.get("retry-after")
        time.sleep(min(8, max(2, int(float(ra)))) if ra else 6)
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
    return resp


def main():
    ap = argparse.ArgumentParser(description="다온 AI 분석 캐시 일괄 import (방어 내장)")
    ap.add_argument("--payload", default="ai_cache_payload.json",
                    help="분석 결과 JSON 배열 파일 (기본: ai_cache_payload.json)")
    ap.add_argument("--base-url", help="서버 베이스 URL (예: https://daon.example.com)")
    ap.add_argument("--token", help="admin Bearer 토큰")
    ap.add_argument("--email", help="admin 이메일 (token 미지정 시 로그인)")
    ap.add_argument("--password", help="admin 비밀번호")
    ap.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    ap.add_argument("--dry-run", action="store_true",
                    help="전송하지 않고 정제/청크 결과만 출력")
    args = ap.parse_args()

    # ── 1) payload 로드 ──
    try:
        with open(args.payload, encoding="utf-8") as f:
            raw_items = json.load(f)
    except FileNotFoundError:
        sys.exit(f"payload 파일 없음: {args.payload}")
    except json.JSONDecodeError as e:
        sys.exit(f"payload JSON 파싱 실패: {e}")
    if not isinstance(raw_items, list):
        sys.exit("payload는 JSON 배열이어야 합니다: [{ticker,name,data,source}, ...]")

    # ── 2) 방어: 정제(sanitize) + 종목당 50,000자 truncate ──
    items = [_clean(it, truncate=True) for it in raw_items]

    # 최소 스키마 점검 (서버 REQUIRED_FIELDS = recommendation, summary)
    bad = [it.get("ticker", "?") for it in items
           if not isinstance(it.get("data"), dict)
           or "recommendation" not in it["data"] or "summary" not in it["data"]]
    if bad:
        print(f"[경고] 필수필드(recommendation/summary) 누락 종목 {len(bad)}건: "
              f"{', '.join(map(str, bad[:10]))}", file=sys.stderr)

    # ── 3) 4.8MB 방지: 배치 청크 + 바디 크기 가드 ──
    batches = _chunk(items, args.batch_size)
    print(f"총 {len(items)}종목 → {len(batches)}개 배치 "
          f"(배치당 ≤{args.batch_size}종목, 바디 ≤{MAX_BODY_BYTES//1_000_000}MB)")
    for i, b in enumerate(batches, 1):
        kb = _body_bytes(b) / 1024
        print(f"  배치 {i}: {len(b)}종목, {kb:,.0f} KB "
              f"[{', '.join(it.get('ticker','?') for it in b)}]")

    if args.dry_run:
        print("\n[dry-run] 전송하지 않고 종료. 위 배치 크기가 모두 한도 내면 400 재발 없음.")
        return

    # ── 4) 인증 ──
    if not args.base_url:
        sys.exit("--base-url 필요 (또는 --dry-run)")
    token = args.token
    if not token:
        if not args.email:
            sys.exit("--token 또는 --email 필요")
        pw = args.password
        if not pw:
            # 보안: --password를 명령어에 넣지 않으면 숨김 입력으로 받음
            # (셸 기록·프로세스 인자에 비밀번호가 남지 않음)
            import getpass
            pw = getpass.getpass(f"{args.email} 비밀번호 (입력 숨김): ")
        token = _login(args.base_url, args.email, pw)

    # ── 5) 배치별 전송 ──
    tot_imp = tot_skip = tot_fail = 0
    for i, b in enumerate(batches, 1):
        resp = _post_batch(args.base_url, token, b)
        if resp.status_code != 200:
            print(f"  배치 {i} 실패 ({resp.status_code}): {resp.text[:300]}", file=sys.stderr)
            tot_fail += len(b)
            continue
        r = resp.json()
        tot_imp += r.get("imported", 0)
        tot_skip += r.get("skipped", 0)
        tot_fail += len(r.get("failed", []))
        print(f"  배치 {i}: 저장 {r.get('imported',0)} · 건너뜀 {r.get('skipped',0)} "
              f"· 실패 {len(r.get('failed',[]))} (서버 캐시 총 {r.get('total_in_cache','?')})")
        time.sleep(0.5)

    print(f"\n완료 — 저장 {tot_imp} · 건너뜀 {tot_skip} · 실패 {tot_fail} / 총 {len(items)}종목")


if __name__ == "__main__":
    main()

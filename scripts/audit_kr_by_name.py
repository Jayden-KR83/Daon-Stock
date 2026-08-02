"""한국 종목 전수 감사 — **종목명을 권위로** 코드를 역산해 대조한다.

왜 이 방향인가:
  코드 → 이름 방향은 "코드가 실재하고 그 코드의 이름과도 맞으면" 통과시킨다.
  하지만 사용자가 실제로 산 것은 '이름'이다. 이름으로 코드를 역산해야
  "내가 산 종목의 진짜 단축코드가 무엇인가"에 답할 수 있다.

분류
  ✅ 일치      저장 코드 == 이름으로 찾은 코드
  ❌ 불일치    이름으로 찾은 코드가 다름 → 정정 후보 (코드가 실재해도 다른 종목)
  ❓ 후보제시  이름을 못 찾음 → 유사 후보를 나열, 오너가 판단
  ⚪ 면제      비상장 펀드(거래소 마스터 대상 아님)

사용: python3 audit_kr_by_name.py            (읽기 전용, 아무것도 바꾸지 않음)
"""
import difflib
import re
import sqlite3
import sys
import time

import requests

sys.path.insert(0, '/home/ubuntu/portfolio/backend')
import main  # noqa: E402

DB = 'file:/home/ubuntu/portfolio/daon.db?mode=ro'
UA = {'User-Agent': 'Mozilla/5.0'}


def norm(s):
    """비교용 정규화 — 공백·괄호·하이픈·가운뎃점 제거, 대문자화.
    'TIGER 미국S&P500' 과 'TIGER 미국S&P500(H)' 를 구분하되 표기 흔들림은 흡수."""
    return re.sub(r'[\s()\[\]&·\-_/,]', '', str(s or '')).upper()


def search(q, limit=8):
    """네이버 자동완성 — (코드, 이름, 타입) 목록."""
    try:
        r = requests.get('https://ac.stock.naver.com/ac',
                         params={'q': q, 'target': 'stock,etf,etn,fund,index'},
                         headers=UA, timeout=8)
        out = []
        for grp in (r.json().get('items') or []):
            for it in (grp if isinstance(grp, list) else [grp]):
                if isinstance(it, dict) and it.get('code'):
                    out.append((it['code'], it.get('name', ''), it.get('typeCode', '')))
        return out[:limit]
    except Exception:
        return []


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


c = sqlite3.connect(DB, uri=True)
c.row_factory = sqlite3.Row
rows = c.execute("""
    SELECT DISTINCT ticker, name, COALESCE(asset_type,'') at, 'portfolio' src
      FROM portfolios WHERE quantity > 0
    UNION
    SELECT DISTINCT ticker, name, '' at, 'watchlist' src FROM watchlist
""").fetchall()

# 한국 종목만 — 숫자로 시작하는 코드(A접두 포함) 또는 한글 이름
kr = [r for r in rows if main.is_kr(r['ticker']) or re.match(r'^A?\d', str(r['ticker']))]

match, wrong, unknown, exempt = [], [], [], []

for r in sorted(kr, key=lambda x: x['ticker']):
    code, name, at = r['ticker'], (r['name'] or '').strip(), r['at']
    if main.is_unlisted(at):
        exempt.append((code, name))
        continue
    if not name:
        unknown.append((code, name, [], '저장된 종목명이 없음'))
        continue

    hits = search(name)
    time.sleep(0.18)
    exact = [h for h in hits if norm(h[1]) == norm(name)]
    if exact:
        found = exact[0][0]
        if main.kr_code(found) == main.kr_code(code):
            match.append((code, name))
        else:
            wrong.append((code, name, found, exact[0][1]))
        continue

    # 정확 일치 없음 → 유사도 상위 후보
    scored = sorted(((sim(name, h[1]), h) for h in hits), reverse=True, key=lambda x: x[0])
    top = [(round(s, 2), h[0], h[1]) for s, h in scored[:5] if s > 0.45]
    unknown.append((code, name, top, '이름으로 정확히 일치하는 종목을 못 찾음'))

W = 96
print('=' * W)
print('  한국 종목 전수 감사 — 종목명 기준으로 코드 역산')
print('=' * W)
print(f'  대상 {len(kr)}건 ·  ✅일치 {len(match)}  ❌불일치 {len(wrong)}  '
      f'❓후보제시 {len(unknown)}  ⚪면제 {len(exempt)}')
print()

if wrong:
    print('❌ 불일치 — 저장 코드가 그 종목명의 코드가 아님 (정정 필요)')
    print('-' * W)
    for code, name, found, fname in wrong:
        print(f'  종목명   : {name}')
        print(f'  저장 코드: {code}')
        cur = main.lookup_kr_master(code)
        print(f'      └ 이 코드의 실제 종목: {cur["name"] if cur else "(마스터에 없음)"}')
        print(f'  올바른 코드: {found}  ({fname})')
        print()

if unknown:
    print('❓ 이름으로 못 찾음 — 아래 후보 중에서 판단해 주세요')
    print('-' * W)
    for code, name, cands, why in unknown:
        cur = main.lookup_kr_master(code)
        print(f'  종목명   : {name or "(비어 있음)"}')
        print(f'  저장 코드: {code}  → 이 코드의 실제 종목: '
              f'{cur["name"] if cur else "(마스터에 없음)"}')
        if cands:
            print('  유사 후보:')
            for s, hc, hn in cands:
                print(f'      유사도 {s}  {hc:8}  {hn}')
        else:
            print('  유사 후보: 없음')
        print()

if exempt:
    print('⚪ 검증 면제 — 비상장 펀드')
    print('-' * W)
    for code, name in exempt:
        print(f'  {code:9} {name}')
    print()

print('✅ 일치 — 종목명과 코드가 맞음')
print('-' * W)
for code, name in match:
    print(f'  {code:9} {name}')

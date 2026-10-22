#!/usr/bin/env python3
"""A 접두 종목코드 정리 — 같은 종목이 두 줄로 들어가 있는 것을 합친다.

무엇이 문제였나
---------------
증권사 HTS 엑셀은 한국 종목을 'A005490' 으로 내보낸다. 'A' 는 KRX 의 공식 코드가
아니라 **증권사 표기 관례**다(주식임을 표시하고, 엑셀이 앞자리 0 을 지우지 못하게 한다).
KRX·네이버·야후가 쓰는 단축코드는 6자리 '005490' 이다.

그런데 손으로 붙여 넣은 행은 'A005490' 로, 다른 경로로 들어온 행은 '005490' 로 저장돼
**같은 종목이 서로 다른 키로 두 줄** 존재하게 됐다. 2026-10-10 서버 로그에서 확인:
  /api/prices?tickers=...,381170,...,A381170,A005490,A051910,A373220,...
시세 조회가 두 번 나가고, 배분 탭은 한 종목을 두 조각으로 그리고,
AI 분석 대상도 중복으로 잡혔다.

무엇을 하나
-----------
  · A + 6자리 숫자 → 6자리로 정규화
  · 같은 (user, account) 안에서 충돌하면 **수량을 합치고 평단은 가중평균**한다.
    한쪽을 버리면 보유 수량이 조용히 줄어든다 — 돈이 사라지는 것처럼 보인다.
  · 섹터·이름은 비어 있지 않은 쪽을 남긴다.

기본은 미리보기(dry-run)다. 실제 반영은 --apply 를 붙여야 한다.
반영 전 portfolios 테이블을 통째로 백업한다(portfolios_bak_20261011).
"""
import argparse
import sqlite3
import sys

TABLE = 'portfolios'
BAK = 'portfolios_bak_20261011'


def is_prefixed(t: str) -> bool:
    t = (t or '').strip()
    return len(t) == 7 and t[0].upper() == 'A' and t[1:].isdigit()


def norm(t: str) -> str:
    t = (t or '').strip()
    return t[1:] if is_prefixed(t) else t


def merge(rows: list) -> dict:
    """같은 종목의 여러 행 → 한 행. 수량 합, 평단 가중평균."""
    qty = sum(float(r['quantity'] or 0) for r in rows)
    if qty > 0:
        cost = sum(float(r['quantity'] or 0) * float(r['avg_price'] or 0) for r in rows)
        avg = cost / qty
    else:
        avg = float(rows[0]['avg_price'] or 0)
    pick = lambda f: next((r[f] for r in rows if str(r[f] or '').strip()), '')
    out = dict(rows[0])
    out.update(ticker=norm(rows[0]['ticker']), quantity=qty, avg_price=avg,
               name=pick('name'), sector=pick('sector'))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default='daon.db')
    ap.add_argument('--apply', action='store_true', help='실제로 반영 (없으면 미리보기)')
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    cols = [r['name'] for r in conn.execute(f'PRAGMA table_info({TABLE})')]
    rows = [dict(r) for r in conn.execute(f'SELECT * FROM {TABLE}')]
    print(f'{TABLE}: {len(rows)}행, 컬럼 {len(cols)}개')

    prefixed = [r for r in rows if is_prefixed(r['ticker'])]
    if not prefixed:
        print('A 접두 행이 없습니다 — 할 일 없음.')
        return 0
    print(f'A 접두 행: {len(prefixed)}개')

    groups: dict = {}
    for r in rows:
        groups.setdefault((r['user_id'], r['account'], norm(r['ticker'])), []).append(r)

    renames = [g for g in groups.values() if len(g) == 1 and is_prefixed(g[0]['ticker'])]
    merges = [g for g in groups.values() if len(g) > 1]

    print(f'\n이름만 바뀌는 행: {len(renames)}개')
    for g in renames:
        r = g[0]
        print(f"  {r['account']:12s} {r['ticker']:8s} -> {norm(r['ticker']):7s} "
              f"{str(r['name'])[:18]:20s} q={r['quantity']}")

    print(f'\n합쳐지는 종목: {len(merges)}건')
    for g in merges:
        m = merge(g)
        print(f"  {g[0]['account']:12s} {norm(g[0]['ticker']):7s} {str(m['name'])[:18]:20s}")
        for r in g:
            print(f"      {r['ticker']:8s} q={r['quantity']:<12} avg={r['avg_price']}")
        print(f"      => q={m['quantity']:<12} avg={round(m['avg_price'], 4)}")

    if not args.apply:
        print('\n[미리보기] 반영하려면 --apply 를 붙이세요.')
        return 0

    conn.execute(f'DROP TABLE IF EXISTS {BAK}')
    conn.execute(f'CREATE TABLE {BAK} AS SELECT * FROM {TABLE}')
    n_bak = conn.execute(f'SELECT COUNT(*) FROM {BAK}').fetchone()[0]
    print(f'\n백업: {BAK} ({n_bak}행)')

    final = [merge(g) if len(g) > 1 else
             (merge(g) if is_prefixed(g[0]['ticker']) else dict(g[0]))
             for g in groups.values()]
    conn.execute(f'DELETE FROM {TABLE}')
    ph = ','.join('?' * len(cols))
    conn.executemany(f'INSERT INTO {TABLE} ({",".join(cols)}) VALUES ({ph})',
                     [tuple(r.get(c) for c in cols) for r in final])
    conn.commit()

    left = conn.execute(
        f"SELECT COUNT(*) FROM {TABLE} WHERE LENGTH(ticker)=7 AND UPPER(SUBSTR(ticker,1,1))='A'"
    ).fetchone()[0]
    print(f'반영 완료: {len(rows)}행 -> {len(final)}행, 남은 A접두 {left}개')
    print(f'되돌리기: DELETE FROM {TABLE}; INSERT INTO {TABLE} SELECT * FROM {BAK};')
    return 0 if left == 0 else 1


if __name__ == '__main__':
    sys.exit(main())

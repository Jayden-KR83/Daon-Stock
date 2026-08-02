"""4단계 후속 — '존재하지만 다른 종목'인 코드 정정.

1단계(447180/470000)는 코드가 아예 없어서 시세가 안 떴다 → 눈에 보이는 실패.
이번 건은 코드가 실재해서 시세도 정상으로 보이지만 **다른 종목**이다 → 조용한 오평가.
평가액이 계속 틀린 채로 표시되고 있었다.

  447660  저장이름 'TIGER 미국나스닥100채권혼합50'  실제 그 코드 = PLUS 애플채권혼합(13,705)
          → 올바른 코드 435420 (14,045)
  448300  저장이름 'ACE 엔비디아채권혼합'          실제 그 코드 = TIGER 미국나스닥100(H)(22,165)
          → 올바른 코드 448540 (25,870)

480310(1Q 미국우주항공테크 → 0131V0)은 제외한다. 0131V0 는 KRX 영숫자 단축코드라
앱의 한국종목 판정(^A?\\d{6}$)에 걸리지 않아 코드 지원이 선행돼야 한다.

사용: python3 migrate_2026-08-02b_wrong_security.py [--apply|--rollback]
"""
import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

DB = os.environ.get('DAON_DB', '/home/ubuntu/portfolio/daon.db')
RENAMES = [('447660', '435420'), ('448300', '448540')]
TABLES = ['portfolios', 'holding_pnl_snapshots']


def backup():
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    dst = os.path.join(os.path.dirname(DB), 'backup', f'daon-pre-wrongsec-{ts}.db')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(DB, dst)
    print(f'  백업 → {dst}')


def run(conn, reverse=False):
    pairs = [(b, a) for a, b in RENAMES] if reverse else RENAMES
    total = 0
    for old, new in pairs:
        for t in TABLES:
            clash = conn.execute(f'SELECT COUNT(*) FROM {t} WHERE ticker=?', (new,)).fetchone()[0]
            if clash:
                print(f'   ⚠ {t}: 대상 코드 {new} 가 이미 {clash}행 존재 — 건너뜀')
                continue
            cur = conn.execute(f'UPDATE {t} SET ticker=? WHERE ticker=?', (new, old))
            if cur.rowcount:
                print(f'   {t:24} {old} → {new}  {cur.rowcount}행')
                total += cur.rowcount
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--rollback', action='store_true')
    a = ap.parse_args()
    print(f'DB: {DB}\n')
    conn = sqlite3.connect(DB)
    try:
        if not a.apply and not a.rollback:
            print('[DRY-RUN]\n')
            for old, new in RENAMES:
                for t in TABLES:
                    n = conn.execute(f'SELECT COUNT(*) FROM {t} WHERE ticker=?', (old,)).fetchone()[0]
                    if n:
                        print(f'   {t:24} {old} → {new}  {n}행')
            print('\n적용: --apply')
            return 0
        backup()
        mode = '롤백' if a.rollback else '적용'
        print(f'\n■ {mode}')
        n = run(conn, reverse=a.rollback)
        conn.commit()
        print(f'   총 {n}행\n')
        print('■ 검증')
        for old, new in RENAMES:
            a_n = conn.execute('SELECT COUNT(*) FROM portfolios WHERE ticker=?', (old,)).fetchone()[0]
            b_n = conn.execute('SELECT COUNT(*) FROM portfolios WHERE ticker=?', (new,)).fetchone()[0]
            print(f'   {old} 잔존 {a_n} / {new} {b_n}행')
        return 0
    finally:
        conn.close()


if __name__ == '__main__':
    sys.exit(main())

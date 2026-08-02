"""1단계 마이그레이션 — 잘못된 KR ETF 단축코드 정정 + TDF 매입/기준가 정정.

배경
  447180 / 470000 은 어느 시세 소스에도 없는 코드였다(네이버·다음·yfinance 전부 미등록).
  실제 단축코드는 447770 / 472170 이며, 네이버 모바일 API + 이름 역검색으로 교차 확인함.

  404610(미래에셋 TDF)은 비상장 공모펀드라 애초에 거래소 시세가 없다. 코드 정정으로
  해결되지 않으며 2단계(asset_type/nav)에서 다룬다. 다만 avg_price 가 1원으로 들어가
  매입금액·수익률이 전부 틀려 있었으므로 여기서 함께 바로잡는다.

  좌수 13,153,391 은 실제값으로 확인됨:
    19,000,000 / 13,153,391 = 1.4444944 원/좌 (= 1,444.49 원/1000좌)  ← 매입 기준가
    26,151,117 / 13,153,391 = 1.9881654 원/좌 (= 1,988.17 원/1000좌)  ← 7/31 기준가
    수익률 37.6375% → 증권사 앱 37.64% 와 일치

사용
  적용:   python3 migrate_2026-08-02_ticker_fix.py --apply
  롤백:   python3 migrate_2026-08-02_ticker_fix.py --rollback
  미리보기: python3 migrate_2026-08-02_ticker_fix.py            (기본 = dry-run)
"""
import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

DB = os.environ.get('DAON_DB', '/home/ubuntu/portfolio/daon.db')

# (기존코드, 새코드) — 전 테이블 일괄 치환 대상
RENAMES = [('447180', '447770'), ('470000', '472170')]
TABLES = ['portfolios', 'holding_pnl_snapshots']

# 404610 TDF — 좌당 단가 정정 (좌수는 실제값이라 유지)
TDF = {
    'ticker': '404610',
    'avg_price_new': 19000000 / 13153391,     # 1.4444944 원/좌
    'manual_price_new': 26151117 / 13153391,  # 1.9881654 원/좌 (2026-07-31 종가 기준)
    'avg_price_old': 1.0,
    'manual_price_old': 0.0,
}


def backup():
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    dst = os.path.join(os.path.dirname(DB), 'backup', f'daon-pre-tickerfix-{ts}.db')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(DB, dst)
    print(f'  백업 → {dst}')
    return dst


def preview(conn):
    print('■ 티커 정정 대상')
    for old, new in RENAMES:
        for t in TABLES:
            n = conn.execute(f'SELECT COUNT(*) FROM {t} WHERE ticker=?', (old,)).fetchone()[0]
            clash = conn.execute(f'SELECT COUNT(*) FROM {t} WHERE ticker=?', (new,)).fetchone()[0]
            if n:
                flag = f'  ⚠ 대상코드 이미 {clash}행 존재' if clash else ''
                print(f'   {t:24} {old} → {new}  {n}행{flag}')
    print('\n■ TDF 단가 정정 대상')
    r = conn.execute('SELECT user_id, account, quantity, avg_price, manual_price '
                     'FROM portfolios WHERE ticker=?', (TDF['ticker'],)).fetchone()
    if r:
        q = r[2]
        print(f'   좌수 {q:,.0f}')
        print(f'   avg_price    {r[3]:.7f} → {TDF["avg_price_new"]:.7f}  '
              f'(매입 {q * TDF["avg_price_new"]:,.0f}원)')
        print(f'   manual_price {r[4]:.7f} → {TDF["manual_price_new"]:.7f}  '
              f'(평가 {q * TDF["manual_price_new"]:,.0f}원)')
    else:
        print('   (해당 보유 없음)')


def apply(conn, reverse=False):
    pairs = [(b, a) for a, b in RENAMES] if reverse else RENAMES
    total = 0
    for old, new in pairs:
        for t in TABLES:
            cur = conn.execute(f'UPDATE {t} SET ticker=? WHERE ticker=?', (new, old))
            if cur.rowcount:
                print(f'   {t:24} {old} → {new}  {cur.rowcount}행')
                total += cur.rowcount
    avg = TDF['avg_price_old'] if reverse else TDF['avg_price_new']
    man = TDF['manual_price_old'] if reverse else TDF['manual_price_new']
    cur = conn.execute('UPDATE portfolios SET avg_price=?, manual_price=? WHERE ticker=?',
                       (avg, man, TDF['ticker']))
    if cur.rowcount:
        print(f'   portfolios               404610 단가 정정 {cur.rowcount}행')
        total += cur.rowcount
    return total


def verify(conn):
    print('\n■ 검증')
    ok = True
    for _, new in RENAMES:
        n = conn.execute('SELECT COUNT(*) FROM portfolios WHERE ticker=?', (new,)).fetchone()[0]
        print(f'   portfolios {new}: {n}행 ' + ('✅' if n else '❌'))
        ok &= n > 0
    for old, _ in RENAMES:
        n = conn.execute('SELECT COUNT(*) FROM portfolios WHERE ticker=?', (old,)).fetchone()[0]
        print(f'   portfolios {old} 잔존: {n}행 ' + ('✅' if n == 0 else '❌'))
        ok &= n == 0
    r = conn.execute('SELECT quantity, avg_price, manual_price FROM portfolios '
                     'WHERE ticker=?', (TDF['ticker'],)).fetchone()
    if r:
        buy, val = r[0] * r[1], r[0] * r[2]
        pct = (val / buy - 1) * 100 if buy else 0
        print(f'   TDF 매입 {buy:,.0f}원 / 평가 {val:,.0f}원 / 수익률 {pct:.2f}%')
        good = abs(buy - 19000000) < 1 and abs(val - 26151117) < 1
        print('   증권사 앱 대조: ' + ('✅ 일치' if good else '❌ 불일치'))
        ok &= good
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--rollback', action='store_true')
    a = ap.parse_args()

    print(f'DB: {DB}\n')
    conn = sqlite3.connect(DB)
    try:
        if not a.apply and not a.rollback:
            print('[DRY-RUN] 변경하지 않습니다.\n')
            preview(conn)
            print('\n적용하려면 --apply')
            return 0
        backup()
        mode = '롤백' if a.rollback else '적용'
        print(f'\n■ {mode} 중')
        n = apply(conn, reverse=a.rollback)
        conn.commit()
        print(f'   총 {n}행 변경')
        if not a.rollback:
            ok = verify(conn)
            if not ok:
                print('\n❌ 검증 실패 — --rollback 으로 되돌리세요')
                return 1
        print(f'\n✅ {mode} 완료')
        return 0
    finally:
        conn.close()


if __name__ == '__main__':
    sys.exit(main())

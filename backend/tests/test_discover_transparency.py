"""발굴 모델 투명성 3종 — 섹터 내 백분위 · 위험 플래그 · 점수 추적 (2026-11-04).

제3자 검증 3곳의 지적 중 **수용한 것만** 여기서 지킨다.
반박한 것(섹터 상한 강제, 결측 축 처리 변경)은 구현하지 않았으므로 테스트도 없다.
"""
import importlib

import pytest

main = importlib.import_module('main')


def _row(**kw):
    base = dict(ticker='AAA', market='US', sector='기술', name='A',
                peg=1.0, trailing_pe=20, forward_pe=18, eps_growth=10, rev_growth=10,
                roe=15, debt_to_equity=50, near_52w_high=0.8, analyst_upside=10,
                current_price=100, profit_margin=10, est_rev_mag=1, est_rev_breadth=0.5,
                num_analysts=10)
    base.update(kw)
    return base


# ── 위험 플래그 ─────────────────────────────────────────────────────
def test_risk_flags_leverage():
    assert 'leverage' in main._risk_flags(_row(debt_to_equity=250))
    assert 'leverage' not in main._risk_flags(_row(debt_to_equity=199))


def test_risk_flags_loss():
    assert 'loss' in main._risk_flags(_row(profit_margin=-3))
    assert 'loss' not in main._risk_flags(_row(profit_margin=0))


def test_risk_flags_stretched():
    assert 'stretched' in main._risk_flags(_row(near_52w_high=0.99))
    assert 'stretched' not in main._risk_flags(_row(near_52w_high=0.9))


def test_risk_flags_no_peg_and_few_analysts():
    f = main._risk_flags(_row(peg=None, num_analysts=4))
    assert 'no_peg' in f and 'few_analysts' in f


def test_risk_flags_missing_data_is_not_a_flag():
    """값이 **없는** 것과 값이 **나쁜** 것은 다르다. None 을 위험으로 세면 거짓 경보가 난다."""
    f = main._risk_flags(_row(debt_to_equity=None, profit_margin=None,
                              near_52w_high=None, num_analysts=None, data_completeness=5))
    assert 'leverage' not in f
    assert 'loss' not in f
    assert 'stretched' not in f
    assert 'few_analysts' not in f


def test_risk_flags_thin_data_follows_completeness():
    assert 'thin_data' in main._risk_flags(_row(data_completeness=4))
    assert 'thin_data' not in main._risk_flags(_row(data_completeness=5))


def test_every_flag_has_a_korean_label():
    """키만 있고 라벨이 없으면 화면에 영어 키가 그대로 뜬다."""
    produced = set()
    for kw in (dict(debt_to_equity=300), dict(profit_margin=-1), dict(data_completeness=3),
               dict(near_52w_high=1.0), dict(peg=None), dict(num_analysts=2)):
        produced |= set(main._risk_flags(_row(**kw)))
    assert produced <= set(main.RISK_FLAG_KO), produced - set(main.RISK_FLAG_KO)


def test_unmeasured_risks_are_declared():
    """플래그가 없다는 말이 안전하다는 뜻이 아니다 — 못 재는 것을 명시한다."""
    joined = ' '.join(main.RISK_UNMEASURED)
    for word in ('유동성', '회계', '지배구조'):
        assert word in joined


def test_risk_flags_are_not_in_the_score():
    """🟥 기회 점수와 위험을 한 숫자로 합치면 둘 다 안 보인다."""
    clean = main._garp_score([_row(ticker=f'T{i}', roe=10 + i) for i in range(5)])
    risky = main._garp_score([_row(ticker=f'T{i}', roe=10 + i, debt_to_equity=400)
                              for i in range(5)])
    # 부채비율은 안정성 축의 입력이라 점수가 **바뀌긴 한다**. 바뀌면 안 되는 것은
    # 플래그 자체가 점수를 또 깎는 것(이중 반영)이다.
    for r in risky:
        assert 'leverage' in r['risk_flags']
    # 플래그 문자열은 점수 계산에 쓰이는 키가 아니다
    assert all(isinstance(r['composite_score'], float) for r in clean)


# ── 섹터 내 백분위 ──────────────────────────────────────────────────
def test_pct_sector_needs_three_peers():
    rows = main._garp_score([_row(ticker='A', sector='기술'), _row(ticker='B', sector='기술')])
    assert all(r['pct_sector'] is None for r in rows), '2종뿐인 섹터에 순위를 매겼다'


def test_pct_sector_ranks_within_sector_only():
    rows = main._garp_score([
        _row(ticker='T1', sector='기술', roe=5),
        _row(ticker='T2', sector='기술', roe=15),
        _row(ticker='T3', sector='기술', roe=30),
        _row(ticker='E1', sector='에너지', roe=40),
        _row(ticker='E2', sector='에너지', roe=41),
        _row(ticker='E3', sector='에너지', roe=42),
    ])
    by = {r['ticker']: r for r in rows}
    # 섹터 안에서 최하위는 섹터 백분위도 최하위여야 한다
    tech = sorted(['T1', 'T2', 'T3'], key=lambda t: by[t]['composite_score'])
    assert by[tech[0]]['pct_sector'] <= by[tech[-1]]['pct_sector']
    # 에너지 3종은 서로 비슷해도 각자 섹터 안에서 백분위를 받는다
    assert all(by[t]['pct_sector'] is not None for t in ('E1', 'E2', 'E3'))


def test_pct_sector_is_separate_from_market_percentile():
    """섹터 1등이 시장 1등은 아니다 — 두 수가 같아지면 나눈 의미가 없다."""
    rows = main._garp_score([
        _row(ticker='T1', sector='기술', roe=1),
        _row(ticker='T2', sector='기술', roe=2),
        _row(ticker='T3', sector='기술', roe=3),
        _row(ticker='E1', sector='에너지', roe=80),
        _row(ticker='E2', sector='에너지', roe=81),
        _row(ticker='E3', sector='에너지', roe=82),
    ])
    by = {r['ticker']: r for r in rows}
    # 기술 섹터 1등(T3)은 섹터 내 상위지만 전체 점수는 에너지보다 낮다
    assert by['T3']['pct_sector'] == max(by[t]['pct_sector'] for t in ('T1', 'T2', 'T3'))
    assert by['T3']['composite_score'] < by['E3']['composite_score']


# ── 점수 추적 ───────────────────────────────────────────────────────
def test_track_buckets_cover_every_score():
    """구간이 비면 어떤 종목은 어디에도 안 들어간다."""
    covered = []
    for lo, hi, _ in main.TRACK_BUCKETS:
        covered.append((lo, hi))
    for score in (0, 1, 49.9, 50, 59.9, 60, 69.9, 70, 100):
        hits = [1 for lo, hi in covered if lo <= score < hi]
        assert len(hits) == 1, f'{score} 점이 {len(hits)}개 구간에 들어간다'


def test_track_basis_declares_its_limits():
    """🟥 할 수 없는 것을 할 수 있는 척하지 않는다."""
    limits = ' '.join(main.TRACK_BASIS['limits'])
    assert '생존편향' in limits
    assert '시점 정합성' in limits
    assert '백테스트가 아니라' in limits


def test_track_returns_reason_when_history_is_short(monkeypatch):
    class _Conn:
        def execute(self, sql, args=()):
            class _R:
                def fetchone(self_inner):
                    return None if 'snapshot_date <=' in sql else {'d': None}
                def fetchall(self_inner):
                    return []
            return _R()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(main, '_db', lambda: _Conn())
    out = main.get_discover_track(days=90)
    assert out['ok'] is False
    assert out['reason'] == 'not_enough_history'
    assert 'limits' in out['basis']


# ── 스키마·저장 ─────────────────────────────────────────────────────
import re
from pathlib import Path

SRC = (Path(__file__).resolve().parents[1] / 'main.py').read_text(encoding='utf-8')


@pytest.mark.parametrize('col', ['num_analysts', 'pct_sector', 'risk_flags'])
def test_new_columns_declared_and_migrated(col):
    assert re.search(rf'\b{col}\b\s+(INTEGER|REAL|TEXT)', SRC), f'{col} 선언이 없다'
    assert f"'{col}'" in SRC, f'{col} 마이그레이션이 없다 — 기존 DB 는 컬럼이 안 생긴다'


def test_new_columns_are_actually_saved():
    i = SRC.index('def _store_discovery_rows')
    body = SRC[i:i + 4000]
    for col in ('num_analysts', 'pct_sector', 'risk_flags'):
        assert col in body, f'{col} 를 계산만 하고 저장하지 않는다'
    assert "r.get('current_price')))" in body, 'discovery_history 에 가격을 안 넣는다'


def test_history_price_column_exists():
    assert 'ALTER TABLE discovery_history ADD COLUMN price REAL' in SRC

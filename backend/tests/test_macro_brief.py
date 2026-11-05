"""거시 시황 브리핑 (2026-11-05) — 회귀 보호.

이 기능이 조용히 망가지는 방식은 셋이다:
  (1) **돈이 샌다** — 탭을 열 때마다 모델을 부르거나, cron 중복 실행으로 두 번 만든다.
  (2) **개인 데이터가 섞인다** — 공용 브리핑에 보유 종목이 들어간다.
  (3) **없는 것을 있는 척한다** — 못 읽은 지표가 '0%'나 '조용했다'로 보인다.
셋 다 화면에서는 멀쩡해 보이기 때문에 테스트로만 잡힌다.
"""
import importlib
import json
import re
from pathlib import Path

import pytest

main = importlib.import_module('main')
SRC = (Path(__file__).resolve().parents[1] / 'main.py').read_text(encoding='utf-8')


# ── 세션 키 ─────────────────────────────────────────────────────────
@pytest.mark.parametrize('hour,expect', [
    (0, 'pre'), (7, 'pre'), (14, 'pre'),
    (15, 'post'), (16, 'post'), (23, 'post'),
])
def test_session_key_splits_at_kr_close(hour, expect):
    """15시(한국 장 마감)가 경계다. 경계가 흔들리면 같은 날 브리핑이 셋이 된다."""
    from datetime import datetime
    k = main._macro_session_key(datetime(2026, 11, 5, hour, 30))
    assert k == f'2026-11-05:{expect}'


def test_session_key_is_unique_per_half_day():
    from datetime import datetime
    keys = {main._macro_session_key(datetime(2026, 11, 5, h)) for h in range(24)}
    assert len(keys) == 2, keys


# ── 스냅샷: 못 읽은 것을 빼지 않는다 ─────────────────────────────────
def test_snapshot_keeps_failed_tickers_with_null(monkeypatch):
    """🟥 조회 실패를 **목록에서 빼면** '오늘 금리는 조용했다'로 읽힌다.
    실제로는 못 읽은 것이다. 행은 남기고 값만 비운다."""
    monkeypatch.setattr(main, '_yf_chart', lambda *a, **k: None)
    snap = main._macro_snapshot()
    assert len(snap) == len(main.MACRO_TICKERS), '실패한 티커가 목록에서 사라졌다'
    assert all(x['pct'] is None and x['price'] is None for x in snap)
    assert all(x['label'] and x['ticker'] and x['group'] for x in snap)


def test_snapshot_order_matches_declaration(monkeypatch):
    monkeypatch.setattr(main, '_yf_chart', lambda *a, **k: None)
    snap = main._macro_snapshot()
    assert [x['ticker'] for x in snap] == [t for _, t, _ in main.MACRO_TICKERS]


def test_every_group_has_a_korean_label():
    groups = {g for _, _, g in main.MACRO_TICKERS}
    assert groups <= set(main.MACRO_GROUP_KO), groups - set(main.MACRO_GROUP_KO)


def test_owner_requested_indicators_are_all_covered():
    """오너가 이름을 댄 것: 코스피·나스닥·S&P·다우·환율·미국채(장/단기)·금·은·유가·비트코인."""
    tickers = {t for _, t, _ in main.MACRO_TICKERS}
    for t in ('^KS11', '^IXIC', '^GSPC', '^DJI', 'KRW=X',
              '^TNX', '^IRX', 'GC=F', 'SI=F', 'CL=F', 'BTC-USD'):
        assert t in tickers, f'{t} 가 빠졌다'


def test_missing_two_year_is_declared_not_faked():
    """야후에 미국 2년물이 없다. **없는 만기에 다른 값을 붙이면** 장단기 역전을
    그 숫자로 판단하게 된다. 라벨에 '2년'이 없어야 하고, 한계에 적혀 있어야 한다."""
    labels = [l for l, _, _ in main.MACRO_TICKERS]
    assert not any('2년' in l for l in labels), labels
    assert any('2년물' in u for u in main.MACRO_UNMEASURED)


def test_unmeasured_declares_cpi_and_rate_limits():
    joined = ' '.join(main.MACRO_UNMEASURED)
    for word in ('물가', '실적', '수급'):
        assert word in joined


# ── 내 종목 연결: 계산이지 추론이 아니다 ─────────────────────────────
def _snap(**pcts):
    out = []
    for label, tkr, grp in main.MACRO_TICKERS:
        out.append({'label': label, 'ticker': tkr, 'group': grp,
                    'price': 100.0, 'pct': pcts.get(tkr)})
    return out


def test_link_rules_all_have_korean_text():
    for r in main.MACRO_LINK_RULES:
        for f in ('title', 'why', 'look'):
            assert r[f] and isinstance(r[f], str), r['key']
        assert r['ticker'] in {t for _, t, _ in main.MACRO_TICKERS}, r['key']


def test_link_rule_thresholds_do_not_fire_on_noise():
    """임계값이 낮으면 매일 모든 줄이 뜬다. 매일 뜨는 경고는 경고가 아니다."""
    quiet = _snap(**{'^TNX': 0.4, 'CL=F': 1.0, 'KRW=X': 0.3,
                     '^VIX': 3.0, 'BTC-USD': 2.0})
    for r in main.MACRO_LINK_RULES:
        q = next(x for x in quiet if x['ticker'] == r['ticker'])
        assert not r['when'](q['pct']), f"{r['key']} 가 평범한 날에도 뜬다"


def test_link_rule_none_is_not_a_trigger():
    """조회 실패(None)를 '0% 움직였다'로 읽으면 안 되고, 발동시켜서도 안 된다."""
    for r in main.MACRO_LINK_RULES:
        assert not r['when'](None), r['key']


def test_links_empty_without_holdings(monkeypatch):
    class _C:
        def execute(self, *a):
            class _R:
                def fetchall(self_inner): return []
                def fetchone(self_inner): return {'c': 0}
            return _R()
        def __enter__(self): return self
        def __exit__(self, *a): return False
    monkeypatch.setattr(main, '_db', lambda: _C())
    assert main._user_macro_links('u1', _snap(**{'^TNX': 9.0})) == []


def test_links_report_weight_and_names(monkeypatch):
    """🟥 '관련 있다'가 아니라 **몇 종목·몇 %** 를 낸다."""
    rows = [
        {'ticker': 'NVDA', 'name': '엔비디아', 'quantity': 10, 'avg_price': 100, 'sector': '기술'},
        {'ticker': 'XOM',  'name': '엑슨',     'quantity': 10, 'avg_price': 100, 'sector': '에너지'},
    ]
    class _C:
        def execute(self, sql, args=()):
            class _R:
                def fetchall(self_inner): return rows
                def fetchone(self_inner): return {'c': len(rows)}
            return _R()
        def __enter__(self): return self
        def __exit__(self, *a): return False
    monkeypatch.setattr(main, '_db', lambda: _C())
    monkeypatch.setattr(main, '_cached_prices_only',
                        lambda t: {x: {'current_price': 100.0} for x in t})
    monkeypatch.setattr(main, '_usd_krw', lambda: 1300.0)

    links = main._user_macro_links('u1', _snap(**{'^TNX': 3.0}))
    by = {l['key']: l for l in links}
    assert 'rate_up' in by, links
    l = by['rate_up']
    assert l['count'] == 1 and '엔비디아' in l['names']
    assert 45 < l['weight'] < 55, l['weight']     # 둘이 같은 평가액 → 약 50%
    assert '+3.00%' in l['metric']


def test_links_weight_basis_is_published(monkeypatch):
    """비중을 주면서 분모를 안 적으면 같은 수에서 서로 다른 값이 나온다(2026-10-27)."""
    class _C:
        def execute(self, *a):
            class _R:
                def fetchone(self_inner): return {'c': 3}
            return _R()
        def __enter__(self): return self
        def __exit__(self, *a): return False
    monkeypatch.setattr(main, '_db', lambda: _C())
    b = main._macro_link_basis('u1')
    assert '평가액' in b['weight_basis'] and '예수금' in b['weight_basis']
    assert b['holdings_counted'] == 3


# ── 돈이 새지 않는가 ────────────────────────────────────────────────
def test_read_endpoint_never_calls_the_model():
    """🟥 /api/market/brief 는 **읽기 전용**이다. 여기서 모델을 부르면
    탭을 연 횟수만큼 돈이 나간다. 생성은 cron 만 한다."""
    # ⚠ 범위를 '다음 @app.' 까지로 잡으면 사이에 낀 일반 함수(_gen_user_macro_note)
    #   까지 삼켜 **멀쩡한 코드를 고발한다**. 실제로 1차에서 그렇게 실패했다.
    #   함수 하나만 자른다.
    i = SRC.index('def get_market_brief')
    body = SRC[i:SRC.index('\ndef _gen_user_macro_note', i)]
    for banned in ('_call_claude', '_gen_macro_brief', '_gen_user_macro_note'):
        assert banned not in body, f'읽기 엔드포인트가 {banned} 를 부른다'


def test_cron_skips_when_session_already_exists():
    i = SRC.index('def cron_macro_brief')
    body = SRC[i:i + 4000]
    assert 'already_exists' in body, 'cron 중복 실행 시 두 번 만든다'
    assert body.index('already_exists') < body.index('_gen_macro_brief'), \
        '중복 검사가 생성보다 뒤에 있다 — 이미 돈을 쓴 뒤다'


def test_cron_requires_secret():
    i = SRC.index('def cron_macro_brief')
    body = SRC[i:i + 2000]
    assert 'invalid cron secret' in body


def test_only_pre_session_uses_web_search():
    """검색에는 건당 비용이 든다. 같은 발표값(CPI·기준금리)을 하루 두 번 찾을 이유가 없다."""
    i = SRC.index('def _gen_macro_brief')
    body = SRC[i:SRC.index('\ndef _save_macro_brief')]
    assert '_call_claude_with_search' in body
    assert 'if is_pre:' in body, '검색이 세션과 무관하게 돈다'


def test_personal_note_uses_the_light_model():
    """사용자 수만큼 도는 호출이다. 여기서 무거운 모델을 쓰면 비용이 N 배로 는다."""
    i = SRC.index('def _gen_user_macro_note')
    body = SRC[i:SRC.index('\nclass MacroBriefReq')]
    assert 'MODEL_LIGHT' in body
    assert 'MODEL_DEEP' not in body and 'MODEL_ANALYSIS' not in body


# ── 개인 데이터가 공용으로 새지 않는가 ───────────────────────────────
def test_shared_brief_prompt_has_no_holdings():
    """🟥 공용 브리핑은 모든 사용자가 같은 글을 본다. 여기에 보유가 들어가면
    남의 화면에 내 종목이 뜬다 (2026-08-26 사고와 같은 모양)."""
    i = SRC.index('def _gen_macro_brief')
    body = SRC[i:SRC.index('\ndef _save_macro_brief')]
    for banned in ('_chat_portfolio_context', '_chat_live_context',
                   '_user_macro_links', 'portfolios'):
        assert banned not in body, f'공용 브리핑 생성에 {banned} 가 있다'


def test_shared_brief_table_has_no_user_column():
    # ⚠ 고정 길이(400자)로 자르면 다음 테이블의 **주석**까지 삼킨다. 그 주석에
    #   'user_id' 라는 글자가 있다는 이유로 1차에서 실패했다 — 코드는 멀쩡했다.
    #   닫는 괄호까지만 자른다.
    i = SRC.index('CREATE TABLE IF NOT EXISTS macro_brief (')
    body = SRC[i:SRC.index(');', i)]
    assert 'user_id' not in body, '공용 테이블에 user_id 가 있다 — 설계가 섞였다'
    assert 'session_key  TEXT PRIMARY KEY' in body


def test_personal_note_table_is_user_scoped():
    i = SRC.index('CREATE TABLE IF NOT EXISTS macro_brief_user (')
    body = SRC[i:SRC.index(');', i)]
    assert 'user_id' in body and 'PRIMARY KEY(user_id, session_key)' in body


def test_brief_is_not_in_shared_ai_cache():
    """ai_cache 는 stock_v2 전용이라는 규약을 이 기능이 깨지 않았는지."""
    i = SRC.index('def _save_macro_brief')
    body = SRC[i:SRC.index('\ndef _load_macro_brief')]
    assert '_set_ai_cache' not in body and 'ai_cache' not in body


def test_demo_user_gets_no_personal_note():
    i = SRC.index('def cron_macro_brief')
    body = SRC[i:i + 4000]
    assert '_is_demo' in body, '데모 계정에도 개인 코멘트를 만든다 — 공용 계정이다'


# ── 프롬프트 규약 ───────────────────────────────────────────────────
@pytest.mark.parametrize('rule', ['확인 필요', '상관', '추천'])
def test_brief_rules_cover_the_house_style(rule):
    assert rule in main.MACRO_BRIEF_RULES, rule


def test_rules_forbid_reciting_quotes():
    """🟥 2026-11-05 오너: "그냥 숫자 등락에 대한 나열 밖에 없네?"

    원인은 **내 프롬프트**였다. 1차 규칙 1번이 "모든 문장에 숫자가 들어가야
    합니다" 였고, 숫자를 넣는 가장 쉬운 길은 시세를 옮겨 적는 것이다.
    모델은 규칙대로 했다. **규칙이 결과를 만든다 — 그래서 규칙을 테스트한다.**
    """
    r = main.MACRO_BRIEF_RULES
    assert '시세를 옮겨 적지' in r, '시세 나열을 금지하는 규칙이 없다'
    assert '그래서 무엇을' in r, '결론의 방향을 지시하는 규칙이 없다'
    assert '조건을 붙이세요' in r, '주의사항에 조건을 요구하는 규칙이 없다'
    # 역행 방지: 1차의 "모든 문장에 숫자" 규칙이 되살아나면 실패한다
    assert '모든 문장에 **숫자**' not in r, '숫자 나열을 부르던 규칙이 되살아났다'


def test_views_cover_the_asset_classes_owner_named():
    """오너가 이름을 댄 것: 빅테크 · 채권 · 비트코인(가상자산).
    칸이 없으면 모델은 지수 이야기만 하고 끝낸다 — 섹션을 강제한다."""
    t = main.MACRO_BRIEF_SCHEMA
    for a in ('빅테크', '채권', '가상자산', '원자재', '한국 증시'):
        assert a in t, f'{a} 칸이 스키마에 없다'
    assert 'caution' in t and 'stance' in t
    assert '모두' in main.MACRO_BRIEF_SHAPE


def test_max_tokens_grew_with_the_schema():
    """views 5칸이 늘었는데 출력 상한이 그대로면 잘린다. 잘린 JSON 은 부분
    복구가 안 되므로 **브리핑이 통째로 사라진다**(화면엔 빈 카드만 남는다)."""
    i = SRC.index('def _gen_macro_brief')
    body = SRC[i:SRC.index('\ndef _save_macro_brief')]
    nums = [int(x) for x in re.findall(r'max_tokens=(\d+)', body)]
    nums += [int(x) for x in re.findall(r'MODEL_ANALYSIS, prompt, (\d+),', body)]
    assert nums, '출력 상한을 못 찾았다'
    assert min(nums) >= 4000, f'출력 상한이 작다: {nums}'


def test_brief_schema_is_valid_json_shape():
    """스키마 문자열이 깨져 있으면 모델이 엉뚱한 모양을 돌려준다."""
    txt = main.MACRO_BRIEF_SCHEMA
    assert txt.strip().startswith('{') and txt.strip().endswith('}')
    assert txt.count('{') == txt.count('}')
    for key in ('headline', 'movers', 'views', 'actions', 'watch', 'facts'):
        assert f'"{key}"' in txt


def test_post_session_must_not_invent_facts():
    """검색을 안 쓰는 세션에서 CPI·기준금리를 '아는 척'하면 그게 환각이다."""
    i = SRC.index('def _gen_macro_brief')
    body = SRC[i:SRC.index('\ndef _save_macro_brief')]
    assert '확인 필요' in body
    assert '지어내지' in body


# ── 스키마·마이그레이션 ─────────────────────────────────────────────
@pytest.mark.parametrize('table', ['macro_brief', 'macro_brief_user'])
def test_tables_are_created(table):
    assert f'CREATE TABLE IF NOT EXISTS {table} (' in SRC
    with main._db() as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,)).fetchone()
    assert row, f'{table} 이 실제 DB 에 없다 — CREATE 가 실행 경로 밖에 있다'


def test_old_briefs_are_pruned():
    """지난 시황은 다시 읽히지 않는다. 안 지우면 테이블만 자란다."""
    i = SRC.index('def _save_macro_brief')
    body = SRC[i:SRC.index('\ndef _load_macro_brief')]
    assert 'DELETE FROM macro_brief WHERE created_at' in body


def test_frontend_reads_the_same_keys():
    """백엔드 키와 화면 키가 어긋나면 **빈 칸이 조용히 생긴다**(에러가 안 난다)."""
    jsx = (Path(__file__).resolve().parents[2] / 'frontend' / 'src' /
           'components' / 'MarketBriefCard.jsx').read_text(encoding='utf-8')
    for key in ('headline', 'movers', 'views', 'actions', 'watch', 'quotes',
                'links', 'note'):
        assert key in jsx, f'화면이 {key} 를 안 읽는다'
    # 세 층을 섞지 않았는가 — 서버 계산분에 'AI 가 아니라'가 적혀 있어야 한다
    assert 'AI 가 아니라' in jsx

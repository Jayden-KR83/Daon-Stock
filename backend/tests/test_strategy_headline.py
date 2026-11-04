"""핵심 3줄(headline) — 긴 리포트 맨 앞의 '먼저 읽을 것' (2026-11-04).

왜 생겼나: 제3자 검증 3곳(Gemini·ChatGPT·Perplexity)이 **따로따로** 같은 것을
1순위로 꼽았다 — 결론·근거·다음 행동이 산문 속에 섞여 있어 매번 전부 훑어야 한다.

여기서 지키는 것은 두 가지다.
1. 프롬프트가 headline 을 **실제로 요구하는가** (스키마 + 규칙)
2. headline 이 **없어도** 알림·저장이 깨지지 않는가 (예전 캐시 리포트 호환)
"""
import re
from pathlib import Path

import pytest

MAIN = Path(__file__).resolve().parents[1] / 'main.py'
SRC = MAIN.read_text(encoding='utf-8')


# ── 1) 프롬프트 스키마 ──────────────────────────────────────────────
def test_prompt_declares_headline_schema():
    assert '"headline"' in SRC, '전략 프롬프트 JSON 스키마에 headline 이 없다'
    for key in ('"risk"', '"evidence"', '"choice"'):
        assert key in SRC, f'headline 하위 키 {key} 가 없다'


def test_headline_comes_before_expert_review_in_schema():
    """맨 위에 있어야 '먼저 읽을 것'이다. 뒤에 붙이면 또 훑어야 한다."""
    i_h = SRC.index('"headline"')
    i_e = SRC.index('"expert_review": "전문가 총평')
    assert i_h < i_e, 'headline 이 expert_review 뒤에 선언돼 있다'


def test_prompt_has_headline_rules():
    """규칙 없이 필드만 추가하면 AI 가 총평을 한 번 더 쓴다."""
    assert '[절대 규칙 — 핵심 3줄 (headline)]' in SRC
    block = SRC[SRC.index('[절대 규칙 — 핵심 3줄 (headline)]'):]
    block = block[:block.index('[절대 규칙 — 3렌즈 해석')]
    # 핵심 제약 3개가 글자 그대로 들어 있어야 한다
    assert '한 가지만' in block, 'risk 를 한 가지로 제한하는 규칙이 없다'
    assert '숫자' in block, 'evidence 에 숫자를 강제하는 규칙이 없다'
    assert '판정이 아니라 선택지' in block, 'choice 가 판정이 되지 않게 막는 규칙이 없다'


def test_headline_rules_forbid_imperative_choice():
    """'~하십시오'는 판정이다. 이 앱은 대신 판정하지 않는다."""
    block = SRC[SRC.index('[절대 규칙 — 핵심 3줄 (headline)]'):]
    block = block[:block.index('[절대 규칙 — 3렌즈 해석')]
    assert '확인해 보실 수 있습니다' in block


# ── 2) 알림 미리보기 ────────────────────────────────────────────────
def _notify_src():
    i = SRC.index('def _notify_strategy_done')
    return SRC[i:SRC.index('\ndef ', i + 10)]


def test_notification_prefers_headline_risk():
    body = _notify_src()
    assert "get('headline')" in body, '알림이 headline 을 보지 않는다'
    # headline 을 보는 코드가 expert_review 루프보다 **위**에 있어야 먼저 쓰인다
    assert body.index("get('headline')") < body.index("'expert_review'")


def test_notification_survives_missing_headline():
    """예전 캐시 리포트에는 headline 이 없다 — 그래도 총평 첫 문장으로 떨어져야."""
    body = _notify_src()
    assert 'if not head:' in body, 'headline 이 없을 때의 대체 경로가 없다'
    assert "for k in ('expert_review'" in body


def test_notification_guards_non_dict_headline():
    """AI 가 headline 을 문자열로 뱉어도 터지면 안 된다."""
    body = _notify_src()
    assert 'isinstance(hl, dict)' in body


# ── 3) 실제 동작 ────────────────────────────────────────────────────
@pytest.mark.parametrize('headline,expect_in_msg', [
    ({'risk': '엔비디아 한 종목이 전체의 24.2%입니다.',
      'evidence': '총 ₩100,000,000 중 ₩24,200,000.',
      'choice': '그 확신의 근거가 아직 유효한지 보셔야 합니다.'},
     '엔비디아'),
    (None, '총평'),                 # 예전 리포트 — 총평 첫 문장으로 떨어짐
    ('문자열로 왔다', '총평'),       # 잘못된 타입 — 무시하고 총평으로
    ({}, '총평'),                   # 빈 dict
    ({'risk': '   '}, '총평'),      # 공백만
])
def test_notify_picks_right_preview(monkeypatch, headline, expect_in_msg, tmp_path):
    import importlib
    main = importlib.import_module('main')

    saved = {}

    class _FakeConn:
        def execute(self, sql, args=()):
            saved['sql'] = sql
            saved['args'] = args
            return self
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(main, '_db', lambda: _FakeConn())
    monkeypatch.setattr(main, '_send_push', lambda *a, **k: None)

    result = {'expert_review': '총평 첫 문장입니다. 두 번째 문장.'}
    if headline is not None:
        result['headline'] = headline

    main._notify_strategy_done('u1', 'ALL', result)
    msg = saved['args'][4]
    assert expect_in_msg in msg


def test_notify_error_path_ignores_headline(monkeypatch):
    """실패 알림에 headline 이 섞이면 안 된다 — 실패엔 결과가 없다."""
    import importlib
    main = importlib.import_module('main')
    saved = {}

    class _FakeConn:
        def execute(self, sql, args=()):
            saved['args'] = args
            return self
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(main, '_db', lambda: _FakeConn())
    monkeypatch.setattr(main, '_send_push', lambda *a, **k: None)
    main._notify_strategy_done('u1', 'ALL', {'headline': {'risk': '안 나와야 함'}},
                               error='토큰 한도 초과')
    msg = saved['args'][4]
    assert '토큰 한도 초과' in msg
    assert '안 나와야 함' not in msg


# ── 4) 프런트가 같은 키를 읽는가 ────────────────────────────────────
FE = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'tabs' / 'AllocationTab.jsx'


def test_frontend_reads_headline():
    """백엔드가 보내는 키와 프런트가 읽는 키가 어긋나면 화면이 조용히 빈다."""
    fe = FE.read_text(encoding='utf-8')
    assert 'HeadlineCard' in fe
    assert 'strategyReport?.headline' in fe
    for key in ('hl.risk', 'hl.evidence', 'hl.choice'):
        assert key in fe, f'프런트가 {key} 를 읽지 않는다'


def test_frontend_headline_is_outside_chapters():
    """장 안에 두면 Ⅲ 을 보는 사람에게는 안 보인다."""
    fe = FE.read_text(encoding='utf-8')
    i_card = fe.index('<HeadlineCard headline=')
    i_ch1 = fe.index("{chapter === '1' && (")
    assert i_card < i_ch1, 'HeadlineCard 가 장(chapter) 블록 안에 들어가 있다'


def test_frontend_md_export_flattens_headline():
    """교차검증 MD 에 headline 이 JSON 덩어리로 나가면 읽는 쪽도 훑어야 한다."""
    fe = FE.read_text(encoding='utf-8')
    skip = re.search(r"const skip = new Set\(\[([^\]]*)\]\)", fe).group(1)
    assert "'headline'" in skip, 'headline 이 일반 덤프 경로로 새 나간다'
    assert '핵심 3줄' in fe

"""AI 응답 파싱 회귀 테스트 — 화면에 빨간 'text' 가 다시 뜨지 않게 고정한다.

사고 경위(2026-10-11)
---------------------
`_call_claude` 가 `resp.json()["content"][0]["text"]` 한 줄이었다.
content[0] 이 text 블록이 아니면(thinking 등) KeyError 가 나고,
**KeyError 의 str() 은 따옴표 붙은 'text' 한 단어**다. 그 값이 그대로
전략 작업의 error 로 저장돼 화면에 `'text'` 만 떴다. 다온의 핵심 기능인
AI 분석이 통째로 멈췄는데 화면에는 단어 하나뿐이라 원인을 알 수 없었다.

규약 — AI 응답에서 본문을 꺼낼 때는 **블록 배열을 훑는다. 인덱스로 집지 않는다.**
모델·옵션에 따라 thinking·tool_use·web_search_tool_result 가 앞에 올 수 있고,
최종 JSON 은 늘 마지막 text 블록에 온다.
"""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402


class _Resp:
    status_code = 200

    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


@pytest.fixture
def post(monkeypatch):
    """_anthropic_post 를 갈아끼워 응답 모양만 바꿔 본다(네트워크 없음)."""
    holder = {}

    def _fake(payload, api_key, timeout):
        return _Resp(holder['body'])

    monkeypatch.setattr(main, '_anthropic_post', _fake)
    return holder


def test_text_only(post):
    post['body'] = {'content': [{'type': 'text', 'text': '{"ok":1}'}]}
    assert main._call_claude('k', 'm', 'p', 100, 10) == '{"ok":1}'


def test_thinking_block_first(post):
    """이것이 실제로 터졌던 모양이다 — 첫 블록에 'text' 키가 없다."""
    post['body'] = {'content': [
        {'type': 'thinking', 'thinking': '...'},
        {'type': 'text', 'text': '{"ok":2}'},
    ]}
    assert main._call_claude('k', 'm', 'p', 100, 10) == '{"ok":2}'


def test_tool_use_block_first(post):
    post['body'] = {'content': [
        {'type': 'server_tool_use', 'name': 'web_search', 'input': {}},
        {'type': 'web_search_tool_result', 'content': []},
        {'type': 'text', 'text': '{"ok":3}'},
    ]}
    assert main._call_claude('k', 'm', 'p', 100, 10) == '{"ok":3}'


def test_multiple_text_blocks_takes_last(post):
    """앞 블록은 조사 과정일 수 있다. 최종 JSON 은 마지막 text 블록이다."""
    post['body'] = {'content': [
        {'type': 'text', 'text': '조사 중입니다...'},
        {'type': 'text', 'text': '{"ok":4}'},
    ]}
    assert main._call_claude('k', 'm', 'p', 100, 10) == '{"ok":4}'


def test_blank_text_blocks_skipped(post):
    post['body'] = {'content': [
        {'type': 'text', 'text': '{"ok":5}'},
        {'type': 'text', 'text': '   '},
    ]}
    assert main._call_claude('k', 'm', 'p', 100, 10) == '{"ok":5}'


@pytest.mark.parametrize('body', [
    {'content': [{'type': 'thinking', 'thinking': '...'}], 'stop_reason': 'max_tokens'},
    {'content': [], 'stop_reason': 'max_tokens'},
    {'stop_reason': 'end_turn'},
])
def test_no_text_block_raises_readable_error(post, body):
    """본문이 없으면 사람이 읽을 수 있는 메시지여야 한다 — 단어 하나는 금지."""
    post['body'] = body
    with pytest.raises(HTTPException) as e:
        main._call_claude('k', 'm', 'p', 100, 10)
    detail = e.value.detail
    assert e.value.status_code == 502
    assert len(detail) > 24, f"오류 메시지가 너무 짧다: {detail!r}"
    assert 'stop_reason' in detail


def test_keyerror_never_surfaces_as_bare_word(post):
    """사고의 본질 — 예외 메시지가 'text' 같은 한 단어로 화면에 나가면 안 된다."""
    post['body'] = {'content': [{'type': 'thinking', 'thinking': '...'}]}
    try:
        main._call_claude('k', 'm', 'p', 100, 10)
    except HTTPException as e:
        assert str(e.detail).strip(" '\"") != 'text'
    except KeyError as e:          # 옛 구현이면 여기로 떨어진다
        pytest.fail(f"KeyError 가 그대로 올라왔다 — 화면에 {str(e)} 만 뜬다")

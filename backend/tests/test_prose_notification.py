"""주간 리밸런싱 알림이 raw JSON 으로 나오던 것 — 2026-11-02 회귀 보호.

무슨 일이 있었나
----------------
알림 목록에 이런 것이 떴다:

    ```json { "portfolio_review": { "analysis_date": "This Week Rebalancing
    Review", "total_assets": "₩583,579,336", "key_recommendations": [ { ...

원인은 **요청과 시스템 프롬프트가 서로 다른 것을 시켰다**는 것이다.
`_call_claude` 의 시스템 프롬프트는 "JSON 으로만 답하라"를 강제하는데,
주간 리밸런싱은 "한국어 불릿(•)만"을 요청했다. 모델은 시스템 쪽을 따랐고,
코드는 받은 글자를 그대로 알림에 넣었다.

두 겹으로 막는다
----------------
① 산문이 필요한 호출은 `system=PROSE_SYSTEM` 으로 시스템 프롬프트를 바꾼다.
② 그래도 JSON 이 오면 `_prose_from_ai_text` 가 **글로 바꾼다.**
   ①만 고치면 모델이 변덕을 부리는 날 같은 화면이 다시 나온다.

규칙은 하나다: **사용자에게 중괄호를 보여주지 않는다.**
"""
import main


OWNER_CASE = (
    '```json { "portfolio_review": { "analysis_date": "This Week Rebalancing Review", '
    '"total_assets": "₩583,579,336", "key_recommendations": [ '
    '{ "priority": 1, "title": "반도체 섹터 과도한 집중 완화", '
    '"content": "반도체(31.0%) + AI&빅테크(23.8%) 합계 54.8%로 극도로 편중." }, '
    '{ "priority": 2, "title": "2차전지 부진 종목 정리", '
    '"content": "누적 손실이 큰 종목들을 정리하고 총 4.3% 비중을 2~3% 이하로 축소." } '
    '] } } ```'
)


class TestNoBracesOnScreen:
    def test_owner_case_becomes_readable(self):
        out = main._prose_from_ai_text(OWNER_CASE)
        assert '{' not in out and '}' not in out, '중괄호가 그대로 남았다'
        assert 'json' not in out.lower()
        assert '반도체 섹터 과도한 집중 완화' in out
        assert '54.8%' in out

    def test_title_and_content_join_into_one_bullet(self):
        out = main._prose_from_ai_text(OWNER_CASE)
        lines = [l for l in out.split('\n') if l.strip()]
        assert len(lines) == 2, f'권고 2건이 2줄이어야 한다: {lines}'
        assert all(l.startswith('•') for l in lines)
        assert '—' in lines[0], '제목과 내용이 한 줄에 이어져야 한다'

    def test_plain_prose_passes_through_unchanged(self):
        """이미 사람이 읽는 글이면 손대지 않는다."""
        t = '• 반도체 비중을 줄이세요.\n• 현금 비중을 늘리세요.'
        assert main._prose_from_ai_text(t) == t

    def test_code_fence_around_prose_is_stripped(self):
        assert main._prose_from_ai_text('```\n• 한 줄\n```') == '• 한 줄'

    def test_empty_is_empty(self):
        assert main._prose_from_ai_text('') == ''
        assert main._prose_from_ai_text(None) == ''

    def test_truncated_json_still_readable(self):
        """길이 상한에서 잘린 JSON 이 와도 중괄호를 보여주지 않는다."""
        cut = '{"key_recommendations":[{"title":"비중 조정","content":"반도체를 줄이'
        out = main._prose_from_ai_text(cut)
        assert '{' not in out and '"' not in out
        assert '비중 조정' in out

    def test_unparseable_json_like_text_is_defanged(self):
        """읽지 못해도 중괄호·따옴표는 걷어낸다 — 마지막 방어선."""
        out = main._prose_from_ai_text('{ 이건 JSON 도 아니고 } "엉망" [ 입니다')
        assert '{' not in out and '}' not in out and '"' not in out
        assert '엉망' in out

    def test_nested_strings_are_kept(self):
        out = main._prose_from_ai_text('{"a":{"b":["첫째","둘째"]}}')
        assert '첫째' in out and '둘째' in out
        assert '{' not in out

    def test_internal_keys_are_dropped(self):
        """_truncated 같은 내부 표식은 알림에 나가지 않는다."""
        out = main._prose_from_ai_text('{"title":"제목","content":"내용","_truncated":true}')
        assert '_truncated' not in out and 'True' not in out


class TestProseSystemPromptExists:
    def test_call_claude_accepts_system_override(self):
        """산문 호출에 JSON 강제 시스템 프롬프트가 다시 붙으면 같은 사고가 난다."""
        import inspect
        assert 'system' in inspect.signature(main._call_claude).parameters

    def test_prose_system_forbids_json(self):
        sysmsg = main.PROSE_SYSTEM.lower()
        assert 'plain text' in sysmsg
        assert 'do not use json' in sysmsg

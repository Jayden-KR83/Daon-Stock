"""끊긴 AI 응답 되살리기 — 2026-11-01 사고 회귀 보호.

무슨 일이 있었나
----------------
AI 전략 분석(다온 핵심 기능)이 빨간 'JSON 파싱 실패' 한 줄만 띄우고 멈췄다.
화면에 찍힌 조각은 이렇게 시작했다:

    {"expert_review":"현재 포트폴리오는 1년 수익률 +58.4%로 ... 반도체·AI 섹터에 54.

**JSON 은 멀쩡하게 시작했다. 끝이 없었을 뿐이다** — 길이 상한(max_tokens)에서
문장 한가운데가 잘렸다. 파서에는 복구 4단계가 이미 있었지만 전부
"어딘가에 완결된 최상위 객체가 있다"를 전제했다. 잘린 응답에는 그게 없다.

그리고 `_call_claude` 가 `stop_reason` 을 **버리고 있었다.** 그래서 호출부는
"답이 길어서 잘렸다"는 사실을 알 길이 없었고, 사용자는 원인 대신 증상만 봤다.

여기서 고정하는 것
------------------
① 어디서 끊겼든 **앞부분은 살린다** (문자열 한가운데 포함)
② 살린 결과에는 반드시 `_truncated` 가 붙는다 — 잘린 답을 완성된 답처럼
   보여주지 않는다(🟥 AI 응답 파싱 규약)
③ **멀쩡한 JSON 에는 손대지 않는다** — 복구 로직이 정상 경로를 오염시키면
   그게 더 큰 사고다
"""
import json

import main


OWNER_CASE = ('{"expert_review":"현재 포트폴리오는 1년 수익률 +58.4%로 공격적 성장 '
              '전략이 유효했음을 보여주나, 반도체·AI 섹터에 54.')


class TestIntactJsonUntouched:
    """정상 경로를 건드리지 않는다 — 이게 깨지면 복구 로직이 해가 된다."""

    def test_plain_object(self):
        r = main._parse_claude_json('{"a":1,"b":[1,2]}')
        assert r == {'a': 1, 'b': [1, 2]}
        assert '_truncated' not in r

    def test_object_with_korean_and_markdown_fence(self):
        r = main._parse_claude_json('```json\n{"진단":"양호","점수":72}\n```')
        assert r['진단'] == '양호' and r['점수'] == 72
        assert '_truncated' not in r

    def test_control_chars_inside_string_still_handled(self):
        r = main._parse_claude_json('{"a":"줄\nbreak"}')
        assert '_truncated' not in r


class TestSalvage:
    def _s(self, text):
        r = main._parse_claude_json(text)
        assert r.get('_truncated') is True, '잘린 답에 표시가 없다'
        return r

    def test_owner_case_mid_string(self):
        """그날 화면에 뜬 바로 그 조각. 반 토막 문장이라도 살린다."""
        r = self._s(OWNER_CASE)
        assert 'expert_review' in r
        assert '58.4%' in r['expert_review']
        assert r['expert_review'].endswith('…'), '잘렸다는 표시(…)가 없다'

    def test_key_without_value(self):
        r = self._s('{"a":"값1","b":')
        assert r['a'] == '값1' and 'b' not in r

    def test_key_without_colon(self):
        r = self._s('{"a":"값1","b')
        assert r['a'] == '값1'

    def test_trailing_comma(self):
        r = self._s('{"a":"값1","b":"값2",')
        assert r['a'] == '값1' and r['b'] == '값2'

    def test_cut_inside_array(self):
        r = self._s('{"a":"값1","phases":[{"name":"성장기"},{"name":"안')
        assert isinstance(r['phases'], list) and r['phases'][0]['name'] == '성장기'

    def test_cut_inside_nested_object(self):
        r = self._s('{"a":"값1","m":{"x":1,"y":')
        assert r['m']['x'] == 1

    def test_half_escape_at_end(self):
        r = self._s('{"a":"값1","b":"역슬래시 \\\\')
        assert r['a'] == '값1'

    def test_keeps_as_much_as_possible(self):
        """뒤에서부터 찾으므로 살아남는 키가 최대여야 한다."""
        r = self._s('{"a":1,"b":2,"c":3,"d":')
        assert set(k for k in r if not k.startswith('_')) == {'a', 'b', 'c'}

    def test_hopeless_input_still_raises(self):
        """못 살리는 것을 살린 척하지 않는다."""
        for bad in ('', '그냥 한국어 문장입니다', 'null', '[1,2,3'):
            try:
                main._parse_claude_json(bad)
                assert False, f'살릴 수 없는 입력을 통과시켰다: {bad!r}'
            except ValueError:
                pass

    def test_salvaged_is_json_serializable(self):
        """되살린 dict 는 캐시·응답에 그대로 실린다 — 직렬화가 돼야 한다."""
        json.dumps(self._s(OWNER_CASE), ensure_ascii=False)


class TestStopReasonIsNotThrownAway:
    def test_call_claude_can_return_meta(self):
        """2026-11-01 사고의 절반은 stop_reason 을 버린 것이었다."""
        import inspect
        sig = inspect.signature(main._call_claude)
        assert 'return_meta' in sig.parameters, \
            'stop_reason 을 호출부로 넘길 방법이 없다 — 원인을 또 못 보게 된다'

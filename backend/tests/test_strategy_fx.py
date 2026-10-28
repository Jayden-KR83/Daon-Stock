"""전략 리포트 환율 — 같은 문서 안에서 총액이 갈리지 않게 (2026-10-27).

왜 회귀 보호가 필요한가:
  `StrategyReq` 에 usd_krw 필드가 **없어서** 프런트가 보낸 실시간 환율이 Pydantic
  단계에서 조용히 버려졌다. 전략 계산만 1380 상수를 썼고, 같은 리포트의 1~4번
  (health·alerts·dividends 모델에는 필드가 있다)과 미국 자산이 3%대로 어긋났다.

  에러도 경고도 없다. 외부 LLM 교차검증 두 곳이 이것을 'AI 환각'으로 지목했지만
  LLM 은 주어진 값을 그대로 썼을 뿐이다. 모델을 바꿔도 프롬프트를 고쳐도
  고쳐지지 않는 종류의 고장이라, 필드와 우선순위를 둘 다 고정한다.
"""
import main
from main import StrategyReq


class TestRequestModelShape:
    """요청 모델의 **필드 집합**을 통째로 고정한다 (2026-10-28).

    왜 필요한가: 2026-10-27 에 `usd_krw` 를 넣으면서 그 뒤에 함수 정의를 삽입했고,
    그 바람에 `scope`·`force_refresh`·`years_to_retirement`·`monthly_inflow` 네 개가
    **함수의 `return` 뒤 죽은 코드로 밀려났다.** 도달 불가 코드라 파싱도 통과하고
    기존 테스트도 전부 통과했다. 운영에서 전략 분석을 누르자

        AttributeError: 'StrategyReq' object has no attribute 'scope'

    로 500 이 났다. **필드 하나를 보는 테스트로는 이것을 잡을 수 없다.**
    """

    def test_모든_필드가_살아있다(self):
        need = {'holdings', 'prices', 'usd_krw', 'scope',
                'force_refresh', 'years_to_retirement', 'monthly_inflow'}
        have = set(StrategyReq.model_fields)
        assert need <= have, '사라진 필드: %s' % (need - have)

    def test_기본값으로도_만들어진다(self):
        # 엔드포인트가 req.scope 등을 바로 읽는다 — 접근 가능해야 한다
        r = StrategyReq()
        assert r.scope == 'ALL'
        assert r.force_refresh is False
        assert r.years_to_retirement is None
        assert r.monthly_inflow is None

    def test_값을_넣으면_그대로_들어간다(self):
        r = StrategyReq(scope='US', force_refresh=True,
                        years_to_retirement=12, monthly_inflow=1500000, usd_krw=1333.0)
        assert (r.scope, r.force_refresh, r.years_to_retirement,
                r.monthly_inflow, r.usd_krw) == ('US', True, 12, 1500000, 1333.0)


class TestFieldExists:
    def test_요청의_환율이_버려지지_않는다(self):
        # 이 필드가 없으면 Pydantic 이 말없이 버린다 — 그게 이 사고의 전부였다
        req = StrategyReq(usd_krw=1333.5)
        assert req.usd_krw == 1333.5

    def test_안_보내면_None(self):
        assert StrategyReq().usd_krw is None


class TestPriority:
    def test_요청값이_1순위(self):
        assert main._effective_usd_krw(1333.5) == 1333.5

    def test_0과_음수는_무시한다(self):
        # 0 을 그대로 쓰면 미국 자산이 전부 0원이 된다
        for bad in (0, -1, '0'):
            assert main._effective_usd_krw(bad) > 100, bad

    def test_쓰레기값도_넘어가지_않는다(self):
        for bad in (None, '', 'abc', [], {}):
            assert main._effective_usd_krw(bad) > 100, repr(bad)

    def test_상수는_맨_마지막이다(self, monkeypatch):
        # 서버 조회가 되면 상수를 쓰면 안 된다 — 상수는 폴백이지 기본값이 아니다
        monkeypatch.setattr(main, '_usd_krw', lambda: 1401.0)
        assert main._effective_usd_krw(None) == 1401.0

    def test_서버조회가_죽어도_계산은_계속된다(self, monkeypatch):
        def boom(): raise RuntimeError('network down')
        monkeypatch.setattr(main, '_usd_krw', boom)
        assert main._effective_usd_krw(None) == 1380.0

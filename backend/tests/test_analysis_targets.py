"""일일 분석 대상 선별 — ETF 는 개별 기업 분석의 대상이 아니다 (2026-10-28).

왜 회귀 보호가 필요한가:
  검증기는 company_overview·earnings_ir·backlog·analyst_views 를 필수로 요구한다.
  **ETF 에는 이 중 어느 것도 존재하지 않는다** — ETF 는 회사가 아니라 바구니다.
  수주잔고도, 실적 발표도, 애널리스트 목표주가도 없다.

  그래서 ETF 가 대상에 섞이면 그 종목만 떨어지는 게 아니라 그날 분석이 통째로
  비어 나온다. 2026-10-24·10-28 실측: 대상 6종목 중 5개가 ETF → 통과 0종목.

  2026-10-17 에 TDF 를 걸렀던 것과 같은 고장이 더 큰 범위로 남아 있었다.
  그때는 '펀드'라는 이름 키워드만 걸렀는데, ETF 는 이름에 'ETF' 가 없는 것이 많다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))), 'scripts'))
import analysis_gap as ag


class TestRealFailureCase:
    """2026-10-28 에 실제로 0종목을 만든 그 6종목."""

    def test_그날_ETF_5종이_걸러진다(self):
        etfs = [
            ('0131V0', '1Q 미국우주항공테크'),
            ('435420', 'TIGER 미국나스닥100채권혼합50'),
            ('305540', 'TIGER 2차전지테마'),
            ('381180', 'TIGER 미국필라델피아반도체나스닥'),
            ('402970', 'ACE 미국배당다우존스'),
        ]
        for t, n in etfs:
            assert ag.is_etf(t, n), '%s(%s) 가 ETF 로 안 걸러진다' % (t, n)

    def test_개별주는_남는다(self):
        # 이 종목만 남아야 그날 분석이 살아난다
        assert not ag.is_etf('RKLB', '로켓 랩')


class TestIndividualStocks:
    def test_미국_개별주(self):
        for t, n in (('NVDA', 'NVIDIA'), ('AAPL', 'Apple'), ('TSLA', 'Tesla')):
            assert not ag.is_etf(t, n), t

    def test_국내_개별주(self):
        for t, n in (('005930', '삼성전자'), ('373220', 'LG에너지솔루션'),
                     ('000660', 'SK하이닉스')):
            assert not ag.is_etf(t, n), t

    def test_이름이_비어도_죽지_않는다(self):
        assert not ag.is_etf('AAPL', '')
        assert not ag.is_etf('AAPL', None)


class TestEtfDetection:
    def test_정본_표에_있으면_ETF(self):
        # backend/sectors.py 의 표가 1순위 판별이다
        assert ag.ETF_TICKERS, 'sectors.py 의 ETF 표를 못 읽었다 — 폴백만 남는다'
        assert ag.is_etf('SOXX', '')
        assert ag.is_etf('QQQ', '')

    def test_A접두도_같게_본다(self):
        assert ag.is_etf('A381180', '')

    def test_표에_없어도_브랜드명으로_잡는다(self):
        # 신규 상장 ETF 가 표에 아직 없을 때의 보조 수단
        assert ag.is_etf('999999', 'KODEX 새로운테마')
        assert ag.is_etf('999998', 'TIGER 무언가')

    def test_이름에_ETF가_있으면_잡는다(self):
        assert ag.is_etf('999997', '무슨자산운용 반도체 ETF')

    def test_브랜드는_앞에_있을_때만(self):
        # 'ACE' 같은 짧은 말이 종목명 중간에 들어간 개별주를 잘못 걸러선 안 된다
        assert not ag.is_etf('123456', '한국ACE전자')

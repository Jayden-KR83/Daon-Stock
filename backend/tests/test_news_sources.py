"""시장 뉴스 — 한·미가 섞이는가, 한국 뉴스가 살아 있는가 (2026-11-03).

무슨 일이 있었나
----------------
① 오너 지적: "시장탭 top10 news는 왜 미국 기사만 있어? 국장은?"
   `_tech_news()` 가 QQQ·NVDA·MSFT·SPY **미국 심볼 네 개만** 조회하고 있었다.
② 고치려고 보니 한국 뉴스 함수(`_naver_news`)가 **완전히 죽어 있었다.**
   옛 경로가 HTTP 410 Gone(네이버가 폐지). 함수는 예외를 삼키고 빈 리스트를
   돌려줬고, 화면에는 "뉴스 없음"으로 보였다 — **조용한 고장**이다.
   2026-10-30 거래량 목록과 같은 종류이고, 같은 방식(모바일 JSON API)으로 살렸다.
③ 덤: `_naver_news` 에 `@ttl_cache` 가 **두 겹**이었다. 바깥 1시간이 안쪽 15분을
   감싸 15분 캐시는 한 번도 일하지 않았는데 주석만 "15분"이라고 적혀 있었다.

여기서 고정하는 것 — 네트워크를 타지 않는 것만 센다.
외부 소스는 또 바뀐다. 바뀌었을 때 **조용히 비는 대신 눈에 띄도록** 구조를 고정한다.
"""
import main


class TestMixesBothMarkets:
    def test_kr_symbols_are_configured(self):
        """국장 심볼이 비면 또 미국 기사만 나온다."""
        assert main.NEWS_KR_TICKERS, '한국 대표 종목 목록이 비었다'
        assert main.NEWS_US_SYMBOLS, '미국 대표 심볼 목록이 비었다'
        for t in main.NEWS_KR_TICKERS:
            assert main.is_kr(t), f'한국 목록에 미국 티커가 들어갔다: {t}'

    def test_interleaves_so_neither_side_is_cut_off(self, monkeypatch):
        """앞에서 자르면 한쪽이 통째로 밀린다 — 번갈아 담아야 한다."""
        monkeypatch.setattr(main, 'NEWS_US_SYMBOLS', ['SPY'])
        monkeypatch.setattr(main, 'NEWS_KR_TICKERS', ['005930'])
        monkeypatch.setattr(main, '_naver_news', lambda t: [
            {'title': f'한국뉴스{i}', 'link': f'http://k/{i}', 'publisher': '네이버'}
            for i in range(6)])

        class _R:
            status_code = 200
            @staticmethod
            def json():
                return {'news': [{'title': f'US News {i}', 'link': f'http://u/{i}',
                                  'publisher': 'Yahoo'} for i in range(6)]}
        monkeypatch.setattr(main._session, 'get', lambda *a, **k: _R())

        out = main._tech_news.__wrapped__() if hasattr(main._tech_news, '__wrapped__') \
            else main._tech_news()
        markets = [x['market'] for x in out]
        assert 'KR' in markets and 'US' in markets, f'한쪽만 나왔다: {markets}'
        assert markets[0] == 'KR', '국장이 먼저 와야 한다(오너가 국내 투자자다)'
        # 번갈아 — 같은 시장이 세 번 연속 오면 섞인 것이 아니다
        for i in range(len(markets) - 2):
            assert len(set(markets[i:i + 3])) > 1, f'한쪽이 몰렸다: {markets}'

    def test_market_field_always_present(self, monkeypatch):
        """화면이 어느 시장인지 표시할 수 있어야 한다."""
        monkeypatch.setattr(main, 'NEWS_US_SYMBOLS', [])
        monkeypatch.setattr(main, 'NEWS_KR_TICKERS', ['005930'])
        monkeypatch.setattr(main, '_naver_news', lambda t: [
            {'title': 'ㄱ', 'link': 'http://k', 'publisher': 'ㄴ'}])
        out = main._tech_news.__wrapped__() if hasattr(main._tech_news, '__wrapped__') \
            else main._tech_news()
        assert all('market' in x for x in out)

    def test_one_side_failing_does_not_kill_the_other(self, monkeypatch):
        """미국 소스가 죽어도 국장은 나와야 한다 — 그 반대도."""
        monkeypatch.setattr(main, 'NEWS_US_SYMBOLS', ['SPY'])
        monkeypatch.setattr(main, 'NEWS_KR_TICKERS', ['005930'])
        monkeypatch.setattr(main, '_naver_news', lambda t: [
            {'title': '국내뉴스', 'link': 'http://k', 'publisher': 'ㄴ'}])

        def boom(*a, **k):
            raise RuntimeError('yahoo down')
        monkeypatch.setattr(main._session, 'get', boom)
        out = main._tech_news.__wrapped__() if hasattr(main._tech_news, '__wrapped__') \
            else main._tech_news()
        assert [x['market'] for x in out] == ['KR']


def _code_only(fn):
    """주석·독스트링을 걷어낸 **실행되는 코드**만 돌려준다.

    이 검사기는 처음에 두 번 거짓 신고했다 — 사고를 설명하려고 docstring 에 적어 둔
    경로명과 데코레이터 이름을 **코드로 착각**했다. 설명을 지우는 대신 검사 범위를
    좁힌다(🟥 검사기도 틀린다).
    """
    import ast
    import inspect
    import textwrap
    src = textwrap.dedent(inspect.getsource(fn))
    tree = ast.parse(src)
    body = tree.body[0].body
    if (body and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)):
        body = body[1:]          # docstring 제거
    return '\n'.join(ast.unparse(x) for x in body)


class TestNaverNewsShape:
    def test_uses_mobile_api_not_dead_page(self):
        """옛 경로는 410 Gone 이다. 다시 쓰면 조용히 빈 화면이 된다."""
        code = _code_only(main._naver_news)
        assert 'm.stock.naver.com' in code, '모바일 API 를 쓰지 않는다'
        assert 'news_news.naver' not in code, '폐지된 경로(410)가 되살아났다'

    def test_strips_a_prefix(self):
        """'A005930' 으로 부르면 네이버가 200 에 **빈 배열**을 준다 — 조용히 비는 함정."""
        assert 'kr_code(' in _code_only(main._naver_news)

    def test_cache_decorator_is_single(self):
        """데코레이터가 두 겹이면 안쪽 TTL 은 한 번도 일하지 않는다.

        소스를 글자로 세지 않고 **실제 래퍼 체인**을 센다 — ttl_cache 는
        functools.wraps 를 쓰므로 겹칠 때마다 __wrapped__ 가 한 단 깊어진다.
        """
        depth, f = 0, main._naver_news
        while hasattr(f, '__wrapped__'):
            depth += 1
            f = f.__wrapped__
        assert depth == 1, f'ttl_cache 가 {depth} 겹이다 — 안쪽 TTL 은 일하지 않는다'

"""보유 종목 분석 일 1회 갱신 — 대상 선별 로직 회귀 보호.

비용이 걸린 경로라 '무엇을 부르지 않는가'가 '무엇을 부르는가'만큼 중요하다:
같은 종목을 두 사람이 들고 있어도 1회만, 비상장 펀드는 아예 제외.
"""
import main


class TestHoldingsTickersForRefresh:
    def test_dedupes_same_ticker_across_users(self, monkeypatch):
        """분석 캐시는 티커 단위 공유 — 두 사용자가 같은 종목을 들고 있어도 1건."""
        data = {
            'u1': {'portfolios': {'US': [{'ticker': 'AAPL', 'name': 'Apple'}]}},
            'u2': {'portfolios': {'ISA': [{'ticker': 'aapl', 'name': 'Apple'}]}},
        }
        monkeypatch.setattr(main, '_load_user_data', lambda uid: data[uid])
        out = main._holdings_tickers_for_refresh(['u1', 'u2'])
        assert [t for t, _ in out] == ['AAPL']

    def test_excludes_unlisted_funds(self, monkeypatch):
        """비상장 펀드는 시세도 뉴스도 없다 — 웹 검색 분석 대상이 아니다."""
        data = {'u1': {'portfolios': {'ACC': [
            {'ticker': 'AAPL', 'name': 'Apple'},
            {'ticker': 'FUND1', 'name': '사모펀드', 'asset_type': main.ASSET_UNLISTED_FUND},
        ]}}}
        monkeypatch.setattr(main, '_load_user_data', lambda uid: data[uid])
        assert [t for t, _ in main._holdings_tickers_for_refresh(['u1'])] == ['AAPL']

    def test_keeps_crypto_and_kr(self, monkeypatch):
        """암호화폐·한국 종목도 갱신 대상이다(둘 다 시세·뉴스가 있다)."""
        data = {'u1': {'portfolios': {'ACC': [
            {'ticker': 'BTC-USD', 'name': '비트코인', 'asset_type': main.ASSET_CRYPTO},
            {'ticker': '005930', 'name': '삼성전자'},
        ]}}}
        monkeypatch.setattr(main, '_load_user_data', lambda uid: data[uid])
        assert sorted(t for t, _ in main._holdings_tickers_for_refresh(['u1'])) \
            == ['005930', 'BTC-USD']

    def test_skips_blank_tickers_and_bad_users(self, monkeypatch):
        """빈 티커·조회 실패 사용자가 배치 전체를 죽이면 안 된다."""
        def loader(uid):
            if uid == 'broken':
                raise RuntimeError('no such user')
            return {'portfolios': {'ACC': [{'ticker': '  ', 'name': ''},
                                           {'ticker': 'MSFT', 'name': 'Microsoft'}]}}
        monkeypatch.setattr(main, '_load_user_data', loader)
        assert [t for t, _ in main._holdings_tickers_for_refresh(['broken', 'u1'])] == ['MSFT']

    def test_carries_holding_name_for_cache_key(self, monkeypatch):
        """캐시 키에 종목명이 들어가므로 보유 데이터의 이름을 그대로 넘긴다."""
        data = {'u1': {'portfolios': {'ACC': [{'ticker': 'NVDA', 'name': 'NVIDIA'}]}}}
        monkeypatch.setattr(main, '_load_user_data', lambda uid: data[uid])
        assert main._holdings_tickers_for_refresh(['u1']) == [('NVDA', 'NVIDIA')]

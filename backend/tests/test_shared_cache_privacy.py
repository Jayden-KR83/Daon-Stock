"""공유 캐시(ai_cache)에 개인 데이터가 들어가지 못하게 막는다 — 회귀 보호.

배경(2026-08-26 사고):
  ai_cache 는 **모든 사용자가 공유**하는 캐시다. 원래 용도는 종목 분석(stock_v2)으로,
  "삼성전자는 어떤 회사인가"는 누가 봐도 같은 내용이라 공유해도 된다.
  그런데 AI 전략 리포트(`strategy:<uid>:<fp>`)까지 같은 테이블에 쌓이고 있었다.
  그 안에는 총자산·계좌별 평가액·환율 노출 비중 같은 **개인 재무 정보 전문**이 들어 있다.

  조회 함수가 정확한 키를 요구해 당장 교차 조회는 되지 않았지만,
  같은 파일에 이미 `stock_v2:{TICKER}:%` 로 **접두 검색**하는 함수가 있다.
  접두 검색을 하나만 더 잘못 추가하면 그 순간 남의 재무 리포트가 나간다.

이 테스트가 지키는 것:
  ① 개인 스코프 키는 공유 캐시에 **저장되지 않는다**
  ② 개인 스코프 키로는 공유 캐시에서 **읽히지 않는다**
  ③ 종목 분석(stock_v2)은 지금처럼 정상 동작한다(과잉 차단 방지)
"""
import pytest

import main


PRIVATE_KEYS = [
    'strategy:someone_else:abc123',
    'portfolio_analyze:someone_else:abc123',
    'metrics:someone_else:abc123',
]


def _db_count(key: str) -> int:
    with main._db() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM ai_cache WHERE cache_key=?", (key,)
        ).fetchone()[0]


class TestPrivateKeysBlocked:
    @pytest.mark.parametrize('key', PRIVATE_KEYS)
    def test_not_written_to_shared_cache(self, key):
        main._set_ai_cache(key, {'총자산': 618010693, 'secret': True})
        assert _db_count(key) == 0, '개인 스코프 결과가 공유 캐시에 저장됐다'

    @pytest.mark.parametrize('key', PRIVATE_KEYS)
    def test_not_read_from_shared_cache(self, key):
        # 과거 데이터가 남아 있는 상황을 만들어도 읽히면 안 된다
        with main._db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO ai_cache(cache_key, value_json, computed_at, source) "
                "VALUES (?,?,?,?)",
                (key, '{"총자산": 618010693}', main.time(), 'test')
            )
        try:
            assert main._get_ai_cache(key) is None, '개인 스코프 키가 공유 캐시에서 읽혔다'
        finally:
            with main._db() as conn:
                conn.execute("DELETE FROM ai_cache WHERE cache_key=?", (key,))

    def test_prefix_classifier(self):
        assert main._is_private_cache_key('strategy:u:1')
        assert main._is_private_cache_key('portfolio_analyze:u:1')
        assert not main._is_private_cache_key('stock_v2:AAPL:Apple')
        assert not main._is_private_cache_key('')


class TestSharedStillWorks:
    """과잉 차단 방지 — 종목 분석은 공유가 정상이다."""

    def test_stock_analysis_roundtrip(self):
        key = 'stock_v2:__TESTTKR__:테스트종목'
        try:
            main._set_ai_cache(key, {'summary': '테스트'})
            assert main._get_ai_cache(key) == {'summary': '테스트'}
            assert _db_count(key) == 1
        finally:
            with main._db() as conn:
                conn.execute("DELETE FROM ai_cache WHERE cache_key=?", (key,))
            main._ai_cache.pop(key, None)
            main._ai_cache_ts.pop(key, None)


class TestNoLegacyLeftovers:
    """운영 DB 를 그대로 쓰는 로컬 실행에서도, 공유 캐시에 개인 키가 남아 있으면 알린다."""

    def test_no_private_rows_in_shared_cache(self):
        with main._db() as conn:
            rows = conn.execute(
                "SELECT cache_key FROM ai_cache WHERE cache_key NOT LIKE 'stock_v2:%'"
            ).fetchall()
        leftovers = [r['cache_key'] for r in rows]
        assert leftovers == [], f'공유 캐시에 개인/미분류 키 잔존: {leftovers[:5]}'

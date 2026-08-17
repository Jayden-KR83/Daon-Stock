"""3단계 — 종목코드 검증 레이어.

배경: 447180·470000 처럼 어느 소스에도 없는 코드가 저장돼 있어도 앱은 조용히
시세만 비워 보여줬다. 저장 시점에 막지 못한 것이 근본 원인.

네트워크를 타지 않도록 마스터 캐시(_TICKER_MASTER)를 직접 심어 검증한다.
"""
import time

import backend.main as main


def _seed(code, info):
    """마스터 캐시에 직접 주입 — 테스트가 외부 API에 의존하지 않게."""
    main._TICKER_MASTER[main.kr_code(code)] = (time.time(), info)


def setup_function():
    main._TICKER_MASTER.clear()


class TestKrValidation:
    def test_존재하는_코드는_통과(self):
        _seed('447770', {'name': 'TIGER 테슬라채권혼합Fn', 'type': 'etf', 'exchange': 'KS'})
        ok, why = main.validate_ticker('447770')
        assert ok and 'TIGER' in why

    def test_존재하지_않는_코드는_거부(self):
        _seed('447180', None)          # 마스터 조회 결과 '없음'
        ok, why = main.validate_ticker('447180')
        assert not ok
        assert '존재하지 않는' in why
        assert '비상장 펀드' in why    # 대안을 안내해야 함

    def test_A접두_유무가_같은_종목으로_취급(self):
        _seed('447770', {'name': 'TIGER 테슬라채권혼합Fn', 'type': 'etf', 'exchange': 'KS'})
        for t in ('447770', 'A447770'):
            ok, _ = main.validate_ticker(t)
            assert ok, f'{t} 가 거부됨 — A접두 정규화 실패'

    def test_A접두_붙은_없는코드도_거부(self):
        _seed('470000', None)
        ok, _ = main.validate_ticker('A470000')
        assert not ok

    def test_자릿수_틀리면_거부(self):
        for bad in ('12345', '1234567', 'A12345'):
            ok, why = main.validate_ticker(bad)
            assert not ok or '6자리' in why or '형식' in why


class TestExemption:
    def test_비상장펀드는_마스터_대조_면제(self):
        _seed('404610', None)   # 마스터에 없지만
        ok, why = main.validate_ticker('404610', main.ASSET_UNLISTED_FUND)
        assert ok, '비상장 펀드가 거부되면 정상 보유를 등록할 수 없다'
        assert '면제' in why

    def test_면제는_대소문자_무관(self):
        _seed('404610', None)
        ok, _ = main.validate_ticker('404610', 'unlisted_fund')
        assert ok


class TestUsTicker:
    def test_미국_티커는_시세_실재까지_확인(self):
        """형식만 보던 것을 시세 실재 확인까지로 강화했다(2026-08-02).
        형식만 통과시키면 오타 티커가 조용한 무시세 보유로 남는다.
        네트워크에 의존하지 않도록 캐시를 미리 심는다."""
        import time as _t
        for t in ('AAPL', 'BRK-B', 'SOXX'):
            main._FOREIGN_EXISTS[t] = (_t.time(), True)
            ok, why = main.validate_ticker(t)
            assert ok and '확인' in why, (t, why)

    def test_이상한_티커는_거부(self):
        ok, _ = main.validate_ticker('AA PL!')
        assert not ok

    def test_빈값_거부(self):
        ok, why = main.validate_ticker('')
        assert not ok and '비어' in why


class TestAvailability:
    def test_마스터_조회불가시_통과시킨다(self):
        # 캐시에 아무것도 없고 네트워크도 못 쓰는 상황을 흉내
        orig = main.lookup_kr_master
        main.lookup_kr_master = lambda t: None
        try:
            ok, why = main.validate_ticker('005930')
            assert ok, '조회 실패를 「없는 코드」로 단정하면 정상 등록을 막는다'
            assert '보류' in why
        finally:
            main.lookup_kr_master = orig


class TestTtlConfigurable:
    def test_기본_TTL은_24시간(self):
        assert main.TICKER_MASTER_TTL == 86400

    def test_settings로_TTL_조정_가능(self):
        with main._db() as conn:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
                         ('ticker_master_ttl', '120'))
        assert main._master_ttl() == 120
        with main._db() as conn:
            conn.execute("DELETE FROM settings WHERE key='ticker_master_ttl'")
        assert main._master_ttl() == 86400

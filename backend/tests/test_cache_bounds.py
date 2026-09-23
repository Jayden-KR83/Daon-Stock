"""캐시 상한 회귀 보호 (2026-09-23).

ttl_cache 는 TTL 로 '신선한가'만 판단하고 항목을 지우지 않았다. 종목별 키가 영구히 쌓여
8일 가동에 앱이 1.4GB(RSS 445MB + 스왑 985MB)를 잡았고, 1GB VM 의 스왑이 가득 찼다.
"""
import main


def _reset():
    main._cache.clear(); main._cache_ts.clear(); main._cache_ttl.clear()
    main._cache_inserts = 0


def test_expired_entries_are_dropped_not_just_ignored():
    _reset()

    @main.ttl_cache(1)
    def f(x):
        return x * 2

    for i in range(50):
        f(i)
    assert len(main._cache) == 50
    # 전부 만료시킨 뒤 청소가 돌면 사라져야 한다 — '무시'가 아니라 '삭제'
    for k in main._cache_ts:
        main._cache_ts[k] -= 10
    with main._lock:
        main._sweep_ttl_cache_locked()
    assert main._cache == {} and main._cache_ts == {} and main._cache_ttl == {}


def test_cache_stays_under_max_items():
    _reset()

    @main.ttl_cache(3600)          # 만료로는 안 줄어드는 긴 TTL
    def g(x):
        return [x] * 10

    for i in range(main._CACHE_MAX_ITEMS + 500):
        g(i)
    assert len(main._cache) <= main._CACHE_MAX_ITEMS
    # 평행 딕셔너리도 같이 줄어야 한다(한쪽만 지우면 그게 다음 누수다)
    assert len(main._cache_ts) == len(main._cache) == len(main._cache_ttl)


def test_oldest_entries_are_evicted_first():
    _reset()

    @main.ttl_cache(3600)
    def h(x):
        return x

    for i in range(main._CACHE_MAX_ITEMS + 200):
        h(i)
    # 가장 먼저 넣은 키는 밀려났고, 마지막 키는 남아 있다
    assert f"h:(0,):[]" not in main._cache
    assert f"h:({main._CACHE_MAX_ITEMS + 199},):[]" in main._cache
    _reset()


def test_trim_ts_dict_keeps_newest():
    d = {f"t{i}": (float(i), f"v{i}") for i in range(20)}
    main._trim_ts_dict(d, 5)
    assert len(d) == 5
    assert set(d) == {f"t{i}" for i in range(15, 20)}


def test_trim_ts_dict_supports_scalar_values():
    # _kr_price_neg 는 값이 float 하나다
    d = {f"t{i}": float(i) for i in range(10)}
    main._trim_ts_dict(d, 3, ts_of=lambda v: v)
    assert set(d) == {"t7", "t8", "t9"}


def test_trim_ts_dict_noop_under_limit():
    d = {"a": (1.0, 'x')}
    main._trim_ts_dict(d, 10)
    assert d == {"a": (1.0, 'x')}

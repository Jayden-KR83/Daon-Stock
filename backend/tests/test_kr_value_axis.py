"""한국 종목 가치 축 수집 — 조용한 실패 감지 (2026-11-05).

무슨 일이 있었나
  `_kr_fundamentals` 는 네이버 PC 종목 페이지 HTML 의 `_per`/`_pbr`/`_eps`/
  `_cns_per` ID 를 긁었다. 네이버가 그 페이지를 클라이언트 렌더링으로 바꾸면서
  **ID 가 전부 사라졌고**, 함수는 설계대로 조용히 `{}` 를 돌려줬다.
  주석에도 "HTML 구조 변경 시 빈 dict 반환"이라고 적혀 있었다 — 의도된 동작이다.

  결과: 발굴 유니버스의 **한국 종목 75종 전부가 '가치' 축을 잃었다.**
  가치는 한국 가중치 35%, 가장 무거운 축이다. 그런데도 아무 에러가 안 났다.
  결측 감점(x완성도/5)이 점수를 그럴듯하게 만들었고, 화면에는 '데이터 없음'
  한 줄만 떴다. 두 장치가 **고장을 정상처럼 보이게** 했다.

왜 테스트가 필요한가
  "데이터 없음"은 두 가지를 뜻할 수 있다 — (a) 그 종목이 원래 값이 없다,
  (b) 수집이 고장났다. 화면은 둘을 구분하지 않는다. 구분하는 신호는 하나뿐이다:
  🟥 **한 시장의 한 축이 100% 비면 그건 (a)가 아니라 (b)다.**
  개별 종목이 비는 것은 정상이지만, 전부 비는 것은 정상이 아니다.

  이 파일은 그 신호를 본다. 네트워크를 타는 테스트는 `-m net` 으로 분리했다
  (외부 사이트가 느리거나 막히면 CI 가 멈춰서는 안 된다).
"""
import importlib
import re
from pathlib import Path

import pytest

main = importlib.import_module('main')
SRC = (Path(__file__).resolve().parents[1] / 'main.py').read_text(encoding='utf-8')

AXES = ('value', 'growth', 'quality', 'momentum', 'sentiment')


# ── 네트워크 없이 — 구조가 되돌아가지 않았는가 ───────────────────────
def test_kr_fundamentals_uses_the_json_api_not_html_ids():
    """옛 HTML ID 스크래핑으로 되돌아가면 같은 사고가 반복된다."""
    i = SRC.index('def _kr_fundamentals')
    body = SRC[i:SRC.index('\ndef _stock_fundamentals')]
    assert 'm.stock.naver.com/api/stock' in body, 'JSON API 를 안 쓴다'
    for dead in ("'_per'", "'_cns_per'", "'_pbr'", "'_market_sum'", 'trade_compare'):
        assert dead not in body, f'사라진 HTML ID {dead} 를 다시 쓰고 있다'


def test_kr_fundamentals_strips_units_explicitly():
    """API 값에는 단위가 붙는다('9.04배'). 공유 파서는 단위를 모른다."""
    i = SRC.index('def _kr_fundamentals')
    body = SRC[i:SRC.index('\ndef _stock_fundamentals')]
    assert '_UNITS' in body and '배' in body


def test_shared_number_parser_is_unchanged():
    """🟥 단위 처리를 공유 파서(`_parse_kr_num`)에 넣으면 '1,178조 251억' 같은
    값이 '1178251' 로 **조용히 틀리게** 읽힌다. 지역에서만 벗긴다."""
    assert main._parse_kr_num('9.04배') is None, '공유 파서가 단위를 먹기 시작했다'
    assert main._parse_kr_num('9.04') == 9.04
    assert main._parse_kr_num('12,372') == 12372.0
    assert main._parse_kr_num('-') is None


def test_value_axis_signals_are_declared():
    """가치 축이 어떤 신호로 만들어지는지 — 셋 중 하나라도 있으면 축이 선다."""
    assert main._GARP_AXIS_SIGNALS['value'] == ['peg', 'rel_per', 'rel_fwd_pe']


def test_kr_weights_make_value_the_heaviest():
    """한국에서 가치가 가장 무겁다 — 그래서 이 축이 비면 피해가 가장 크다."""
    w = main.GARP_WEIGHTS_KR
    assert w['value'] == max(w.values())
    assert abs(sum(w.values()) - 1.0) < 1e-9


# ── 실제 수집 — 네트워크 ────────────────────────────────────────────
@pytest.mark.net
@pytest.mark.parametrize('code', ['005930', '000660'])
def test_kr_fundamentals_returns_pe(code):
    """대형주 둘이 PER 을 못 가져오면 수집이 깨진 것이다."""
    f = main._kr_fundamentals(code)
    assert f, f'{code}: 빈 dict — 수집 실패'
    assert f.get('trailing_pe') or f.get('forward_pe'), \
        f'{code}: PER·추정PER 둘 다 없다 — 가치 축이 설 수 없다 {f}'


@pytest.mark.net
def test_no_axis_is_totally_empty_for_a_market():
    """🟥 핵심 감지기.

    한 시장의 한 축이 **100% 비면** 그것은 '데이터 부족'이 아니라 '수집 고장'이다.
    개별 종목이 비는 것은 정상, 전부 비는 것은 비정상 — 이 한 줄이 2026-11-05
    사고를 잡는다.

    운영 API 를 읽는다. 로컬 DB 는 스캔이 안 돌았으면 비어 있어 의미가 없다.
    """
    import json
    import urllib.request
    ua = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    base = 'https://daonwealth.com'
    try:
        req = urllib.request.Request(
            base + '/api/auth/demo', data=b'{}',
            headers={'Content-Type': 'application/json', 'User-Agent': ua})
        token = json.loads(urllib.request.urlopen(req, timeout=30).read())['token']
        req = urllib.request.Request(
            base + '/api/discover?limit=400',
            headers={'Authorization': 'Bearer ' + token, 'User-Agent': ua})
        data = json.loads(urllib.request.urlopen(req, timeout=90).read())
        items = data['items']
    except Exception as e:                      # pragma: no cover
        pytest.skip(f'운영 API 에 닿지 못했다: {str(e)[:80]}')

    bad = []
    for mk in ('US', 'KR'):
        rows = [r for r in items if r.get('market') == mk]
        if len(rows) < 10:
            continue
        for ax in AXES:
            miss = sum(1 for r in rows if r.get('pct_' + ax) is None)
            if miss == len(rows):
                bad.append(f'{mk}/{ax} {miss}/{len(rows)}')

    # 🟥 스캔 시점을 같이 말한다. 수집 코드를 고친 **직후**에는 운영 데이터가
    #    아직 옛 스캔이라 이 테스트가 실패한다 — 그때 "고장났다"고만 적혀 있으면
    #    고친 사람이 자기 수정을 의심하게 된다. 실패 메시지는 **다음 행동**을
    #    말해야 한다.
    import time as _t
    age_h = (_t.time() - float(data.get('computed_at') or 0)) / 3600.0
    assert not bad, (
        '한 시장의 축이 통째로 비었다 — 데이터 부족이 아니라 수집 고장이다: '
        + ', '.join(bad)
        + f' | 스캔은 {age_h:.1f}시간 전 것이다.'
        + ' 수집 코드를 방금 고쳤다면 발굴 탭 [갱신](관리자)을 누르거나'
          ' 다음 cron(매일 KST 07:00)을 기다린 뒤 다시 확인할 것.')


# ── 스캔이 멈춘 것을 감지한다 (2026-11-07) ─────────────────────────
@pytest.mark.net
def test_discover_scan_is_fresh():
    """🟥 발굴 스캔이 **81.7시간(3.4일) 멈춰 있었다.**

    그동안 화면에는 `3일 전 · 매일 자동` 이 찍혀 있었다 — 한 문장 안에 모순이
    있는데(3일 전이면 매일이 아니다) 10.5px 회색으로, 가장 조용한 스타일이었다.
    아무도 안 봤다.

    더 나쁜 것: 스캔은 **아무 기록도 남기지 않았다.** 남는 흔적은
    `discovery_scores.computed_at` 뿐이고 그것은 **성공했을 때만** 갱신된다.
    실패는 흔적이 없는 구조였다 — "돌다가 실패"와 "아예 안 돎"을 가릴 수 없었다.

    임계 36시간: 매일 cron 기준 한 번 거르는 것까지는 봐 주고 두 번째부터 센다.
    """
    import json
    import time as _t
    import urllib.request
    ua = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    base = 'https://daonwealth.com'
    try:
        req = urllib.request.Request(
            base + '/api/auth/demo', data=b'{}',
            headers={'Content-Type': 'application/json', 'User-Agent': ua})
        token = json.loads(urllib.request.urlopen(req, timeout=30).read())['token']
        req = urllib.request.Request(
            base + '/api/discover?limit=10',
            headers={'Authorization': 'Bearer ' + token, 'User-Agent': ua})
        data = json.loads(urllib.request.urlopen(req, timeout=90).read())
    except Exception as e:                      # pragma: no cover
        pytest.skip(f'운영 API 에 닿지 못했다: {str(e)[:80]}')

    ts = float(data.get('computed_at') or 0)
    assert ts > 0, '스캔 기록이 아예 없다'
    age_h = (_t.time() - ts) / 3600
    assert age_h < 36, (
        f'발굴 스캔이 {age_h:.1f}시간({age_h / 24:.1f}일) 멈췄다. '
        '매일 22:00 UTC cron(daon-discover-scan.sh)이 도는지 확인할 것. '
        '앱 안에서는 /api/admin/cron_health 로 볼 수 있다.')

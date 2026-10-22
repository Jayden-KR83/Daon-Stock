"""한국 시세 파싱 회귀 테스트 — 2026-10-11 '한국 기능 전체 HOLD' 재발 방지.

사고 경위
---------
`_kr_price` 1차가 `finance.naver.com/item/main.nhn` **HTML 스크래핑**이었다.
네이버가 그 주소를 302 로 `stock.naver.com` SPA 에 넘기기 시작했는데, 응답이 200 이라
코드는 성공으로 봤고 본문은 JS 셸이라 `.no_today .blind` 가 없어 파싱만 조용히 실패했다.
(실측: 섹터 ETF 11개 전부 PARSE-FAIL, 본문 크기까지 133036 으로 동일)
그래서 매 호출이 2차 yfinance 로 떨어졌는데 그쪽은 429 였다 — **한국 종목 전부가 멈췄다.**

교훈이 둘이다:
  1. HTML 을 긁지 말 것. 같은 데이터를 JSON 으로 주는 경로가 있으면 그쪽이 계약이 안정적이다.
  2. **200 을 성공으로 보지 말 것.** 파싱 결과가 비면 그건 실패다.

여기서 고정하는 것은 **파서의 계약**이다. 원본 소스가 또 바뀌는 것은 오프라인 테스트로
잡을 수 없으므로, `_sector_kr` 이 시세를 못 받은 ETF 를 로그로 남기게 해 뒀다.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402


class _Resp:
    def __init__(self, data, status=200):
        self.status_code = status
        self._data = data

    def json(self):
        return self._data


# 2026-10-11 실제 응답에서 필요한 필드만 추린 것
def _row(code, name, close, pct, chg):
    return {
        'itemCode': code, 'stockName': name,
        'closePrice': f'{close:,}', 'closePriceRaw': str(close),
        'fluctuationsRatio': str(pct),
        'compareToPreviousClosePrice': f'{abs(chg):,}',
        'marketStatus': 'CLOSE',
    }


@pytest.fixture
def api(monkeypatch):
    holder = {'rows': [], 'urls': []}

    def _get(url, **kw):
        holder['urls'].append(url)
        return _Resp({'datas': holder['rows']})

    monkeypatch.setattr(main._session, 'get', _get)
    return holder


def test_batch_parses_price_and_change(api):
    api['rows'] = [_row('005930', '삼성전자', 263000, -2.05, -5500)]
    out = main._kr_price_batch(['005930'])
    assert out['005930']['current_price'] == 263000
    assert out['005930']['change_pct'] == -2.05
    assert out['005930']['name'] == '삼성전자'


def test_change_sign_follows_ratio(api):
    """등락 '폭'은 부호 없이 오기도 한다. 비율이 음수면 폭도 음수여야 한다."""
    api['rows'] = [_row('005930', '삼성전자', 263000, -2.05, 5500)]   # 폭은 양수로 도착
    assert main._kr_price_batch(['005930'])['005930']['change'] == -5500


def test_one_request_for_many_codes(api):
    """섹터 11개를 11번 요청하던 것이 사고의 절반이었다 — 한 번으로 끝나야 한다."""
    codes = [f'{i:06d}' for i in range(1, 12)]
    api['rows'] = [_row(c, f'종목{c}', 1000, 1.0, 10) for c in codes]
    out = main._kr_price_batch(codes)
    assert len(out) == 11
    assert len(api['urls']) == 1, f"요청이 {len(api['urls'])}번 나갔다"
    assert ','.join(codes) in api['urls'][0]


@pytest.mark.parametrize('rows', [
    [],                                                   # 상장폐지 — datas 가 빈 배열
    [{'itemCode': '098560'}],                             # 가격 필드 없음
    [_row('098560', '죽은ETF', 0, 0, 0)],                  # 가격 0
])
def test_dead_code_yields_nothing_not_garbage(api, rows):
    """죽은 코드는 **빠져야** 한다. 0원짜리 행을 만들어 화면에 띄우면 안 된다."""
    api['rows'] = rows
    assert main._kr_price_batch(['098560']) == {}


def test_http_error_is_not_success(api, monkeypatch):
    """200 이 아니면 당연히 실패지만, 200 인데 내용이 비어도 실패다 — 사고의 핵심."""
    monkeypatch.setattr(main._session, 'get', lambda url, **kw: _Resp({}, status=500))
    assert main._kr_price_batch(['005930']) == {}
    monkeypatch.setattr(main._session, 'get', lambda url, **kw: _Resp({'datas': []}))
    assert main._kr_price_batch(['005930']) == {}


def test_sector_table_has_no_known_dead_code():
    """'통신'(098560)은 2026-10-11 상장폐지 확인 후 뺐다. 되살리려면 생존부터 확인할 것."""
    codes = {etf.replace('.KS', '').replace('.KQ', '')
             for etf, _w in main.KOSPI_SECTOR_ETFS.values()}
    assert '098560' not in codes, "상장폐지된 098560 이 섹터 표에 다시 들어왔다"
    assert len(codes) == len(main.KOSPI_SECTOR_ETFS), "섹터 표에 중복 코드가 있다"

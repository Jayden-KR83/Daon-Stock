"""미분류 섹터 점검·수정 (2026-10-22).

왜 회귀 보호가 필요한가:
  섹터 라벨이 정본에 없으면 sector_group() 이 조용히 '기타'로 떨군다.
  배분 탭에는 '기타' 덩어리로만 보여서 **틀렸다는 사실 자체가 화면에 안 나타난다.**
  그래서 "정본 밖 라벨은 저장되지 않는다"와 "미분류는 목록에 드러난다" 둘 다 고정한다.

  2026-10-11 에 unknown_labels() 를 만들어 두고 호출하는 곳이 없어 11일간 죽은
  코드였다. 이 테스트는 그 배선이 다시 끊기면 깨진다.
"""
import pytest
from fastapi import HTTPException

import main
from sectors import LABEL_TO_GROUP, LEGACY_ALIASES

UID = 'test-sector-user'


def _user(uid):
    """portfolios 는 users 에 FK 가 걸려 있다 — 사용자가 먼저 있어야 한다."""
    with main._db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users(user_id, email, name, pw_hash, created_at) "
            "VALUES(?,?,?,?,?)", (uid, f'{uid}@test.local', uid, 'x', '2026-10-22'))


def _seed(rows):
    """portfolios 를 이 사용자분만 갈아끼운다. rows = [(ticker, sector, qty)]"""
    _user(UID)
    with main._db() as conn:
        conn.execute("DELETE FROM portfolios WHERE user_id=?", (UID,))
        for tkr, sec, qty in rows:
            conn.execute(
                "INSERT INTO portfolios(user_id, account, ticker, name, avg_price, "
                "quantity, sector) VALUES(?,?,?,?,?,?,?)",
                (UID, 'US', tkr, tkr, 100.0, qty, sec))


CU = {'user_id': UID}


class TestUnknownList:
    def test_영어업종은_미분류로_잡힌다(self):
        _seed([('AAPL', 'Technology', 3)])
        out = main.sectors_unknown(cu=CU)
        assert out['count'] == 1
        assert out['items'][0]['ticker'] == 'AAPL'
        # 지금은 '기타'로 떨어지고 있다는 사실을 함께 드러낸다
        assert out['items'][0]['group'] == '기타'

    def test_정본_라벨은_잡히지_않는다(self):
        _seed([('SOXX', '반도체', 1), ('TLT', '채권', 1)])
        assert main.sectors_unknown(cu=CU)['count'] == 0

    def test_빈칸도_미분류다(self):
        _seed([('XYZ', '', 1)])
        out = main.sectors_unknown(cu=CU)
        assert out['count'] == 1
        assert out['items'][0]['sector'] == ''

    def test_빈칸이_먼저_온다(self):
        # 아예 안 적힌 것이 잘못 적힌 것보다 급하다
        _seed([('AAPL', 'Technology', 1), ('XYZ', '', 1)])
        items = main.sectors_unknown(cu=CU)['items']
        assert items[0]['sector'] == ''

    def test_수량0은_제외(self):
        _seed([('OLD', 'Technology', 0)])
        assert main.sectors_unknown(cu=CU)['count'] == 0

    def test_ETF는_제안이_붙는다(self):
        # 표에 있는 것만 — 확실할 때만 채운다
        _seed([('SOXX', 'Technology', 1)])
        assert main.sectors_unknown(cu=CU)['items'][0]['suggestion'] == '반도체'

    def test_개별주는_추측하지_않는다(self):
        # 데이터 소스는 NVDA 에도 'Technology' 를 준다. 틀린 제안은 '기타'보다 나쁘다.
        _seed([('NVDA', 'Technology', 1)])
        assert main.sectors_unknown(cu=CU)['items'][0]['suggestion'] == ''


class TestFix:
    def test_정상_수정(self):
        _seed([('AAPL', 'Technology', 3)])
        req = main.SectorFixReq(ticker='AAPL', sector='AI & 빅테크')
        out = main.sectors_fix(req, cu=CU)
        assert out['updated'] == 1
        assert main.sectors_unknown(cu=CU)['count'] == 0

    def test_정본에_없는_라벨은_거부(self):
        _seed([('AAPL', 'Technology', 3)])
        for bad in ('Technology', '반도체(AI)', '', '  '):
            with pytest.raises(HTTPException) as e:
                main.sectors_fix(main.SectorFixReq(ticker='AAPL', sector=bad), cu=CU)
            assert e.value.status_code == 400, bad

    def test_앞뒤_공백은_정규화해서_받는다(self):
        # 거부가 아니라 정규화다 — 사람이 복사해 넣은 값에 공백이 붙는 건 흔하다.
        # 저장되는 값은 공백 없는 정본 라벨이어야 한다.
        _seed([('AAPL', 'Technology', 3)])
        out = main.sectors_fix(main.SectorFixReq(ticker='AAPL', sector=' 반도체 '), cu=CU)
        assert out['sector'] == '반도체'

    def test_구라벨은_거부(self):
        # 드롭다운에서 숨긴 이름을 API 로 되살릴 수 있으면 숨긴 의미가 없다
        _seed([('AAPL', 'Technology', 3)])
        legacy = sorted(LEGACY_ALIASES)[0]
        assert legacy in LABEL_TO_GROUP          # 읽기용으로는 살아 있다
        with pytest.raises(HTTPException) as e:
            main.sectors_fix(main.SectorFixReq(ticker='AAPL', sector=legacy), cu=CU)
        assert e.value.status_code == 400

    def test_티커_없으면_거부(self):
        with pytest.raises(HTTPException) as e:
            main.sectors_fix(main.SectorFixReq(ticker='', sector='반도체'), cu=CU)
        assert e.value.status_code == 400

    def test_보유에_없으면_404(self):
        _seed([('AAPL', 'Technology', 3)])
        with pytest.raises(HTTPException) as e:
            main.sectors_fix(main.SectorFixReq(ticker='ZZZZ', sector='반도체'), cu=CU)
        assert e.value.status_code == 404

    def test_남의_종목은_건드리지_않는다(self):
        _seed([('AAPL', 'Technology', 3)])
        _user('other-user')
        with main._db() as conn:
            conn.execute("DELETE FROM portfolios WHERE user_id=?", ('other-user',))
            conn.execute(
                "INSERT INTO portfolios(user_id, account, ticker, name, avg_price, "
                "quantity, sector) VALUES(?,?,?,?,?,?,?)",
                ('other-user', 'US', 'AAPL', 'AAPL', 100.0, 1, 'Technology'))
        main.sectors_fix(main.SectorFixReq(ticker='AAPL', sector='AI & 빅테크'), cu=CU)
        with main._db() as conn:
            row = conn.execute(
                "SELECT sector FROM portfolios WHERE user_id=? AND ticker=?",
                ('other-user', 'AAPL')).fetchone()
        assert row['sector'] == 'Technology'

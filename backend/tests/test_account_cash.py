"""계좌별 예수금 — 회귀 보호.

예수금은 총자산과 현금 비중의 입력원이라 값이 조용히 틀어지면 화면 전체가 틀어진다.
특히 두 가지를 못 박아 둔다.
  ① 남의 계좌를 건드릴 수 없다(user_id 로 범위가 잘려야 한다).
  ② NaN·무한대가 DB 에 들어가지 않는다 — 한 번 들어가면 합계가 전부 NaN 이 된다.
"""
import pytest
from fastapi import HTTPException

import main


UID_A = 'cash_test_a'
UID_B = 'cash_test_b'


def _mkuser(uid):
    with main._db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO users(user_id,email,name,pw_hash,created_at,status) "
            "VALUES(?,?,?,?,?, 'approved')",
            (uid, uid + '@test.local', uid, 'x:y', '2026-01-01T00:00:00')
        )
        conn.execute(
            "INSERT OR REPLACE INTO accounts(user_id,key,label,currency,sort_order,cash) "
            "VALUES(?,?,?,?,?,?)", (uid, 'MAIN', '메인', 'KRW', 0, 0.0)
        )


def _cash(uid, key='MAIN'):
    with main._db() as conn:
        row = conn.execute(
            "SELECT cash FROM accounts WHERE user_id=? AND key=?", (uid, key)
        ).fetchone()
    return row['cash'] if row else None


@pytest.fixture(autouse=True)
def _seed():
    _mkuser(UID_A)
    _mkuser(UID_B)
    yield
    with main._db() as conn:
        for uid in (UID_A, UID_B):
            conn.execute("DELETE FROM accounts WHERE user_id=?", (uid,))
            conn.execute("DELETE FROM users WHERE user_id=?", (uid,))


def _put(uid, key, value):
    return main.update_account_cash(key, main.AccountCashReq(cash=value), {'user_id': uid})


class TestUpdate:
    def test_sets_value(self):
        r = _put(UID_A, 'MAIN', 1_250_000)
        assert r['ok'] is True
        assert _cash(UID_A) == 1_250_000

    def test_accepts_negative(self):
        """미수금·마이너스 잔고는 실제로 존재한다. 0 으로 깎아버리면 안 된다."""
        _put(UID_A, 'MAIN', -50_000)
        assert _cash(UID_A) == -50_000

    def test_accepts_zero(self):
        _put(UID_A, 'MAIN', 900)
        _put(UID_A, 'MAIN', 0)
        assert _cash(UID_A) == 0


class TestValidation:
    @pytest.mark.parametrize('bad', [float('nan'), float('inf'), float('-inf')])
    def test_rejects_non_finite(self, bad):
        with pytest.raises(HTTPException) as e:
            _put(UID_A, 'MAIN', bad)
        assert e.value.status_code == 400
        assert _cash(UID_A) == 0.0        # DB 는 그대로

    def test_rejects_absurd_magnitude(self):
        with pytest.raises(HTTPException) as e:
            _put(UID_A, 'MAIN', 1e16)
        assert e.value.status_code == 400
        assert _cash(UID_A) == 0.0


class TestOwnership:
    def test_cannot_touch_other_users_account(self):
        """B 가 A 의 계좌 키를 그대로 불러도 A 의 값은 변하지 않는다.

        키 이름이 'MAIN' 으로 겹치는 것이 핵심 — user_id 범위가 빠지면 그대로 덮인다.
        """
        _put(UID_A, 'MAIN', 777_000)
        _put(UID_B, 'MAIN', 111_000)
        assert _cash(UID_A) == 777_000
        assert _cash(UID_B) == 111_000

    def test_unknown_key_is_404(self):
        with pytest.raises(HTTPException) as e:
            _put(UID_A, 'NOPE', 1000)
        assert e.value.status_code == 404


class TestListing:
    def test_get_accounts_includes_cash(self):
        _put(UID_A, 'MAIN', 42_000)
        out = main.get_accounts({'user_id': UID_A})
        row = next(a for a in out['accounts'] if a['key'] == 'MAIN')
        assert row['cash'] == 42_000
        assert 'cash_updated_at' in row

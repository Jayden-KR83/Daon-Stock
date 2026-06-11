"""세션 토큰 → 사용자 조회 시 ai_enabled / status 정확 반영 회귀 보호.

근본 버그(2026-06): _get_user_from_token 의 SELECT 가 u.ai_enabled / u.status 를
가져오지 않아, 비관리자는 DB에 ai_enabled=1 이어도 항상 False 로 읽혔다.
(소유자는 is_admin 이라 require_ai_enabled early-return 으로 가려졌던 잠복 버그)
→ 데모/일반 사용자의 AI 기능이 전부 막힘. SELECT 수정 후 회귀 차단.
"""
import time
import main


def _mk_user(uid, ai_enabled, status='approved', is_admin=0):
    with main._db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO users(user_id,email,name,nickname,pw_hash,created_at,"
            "status,ai_enabled,is_admin,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (uid, f'{uid}@t.app', uid, uid, main._hash_password('x'),
             '2026-01-01', status, ai_enabled, is_admin, time.time())
        )
    token = f'tok_{uid}'
    with main._db() as conn:
        conn.execute("INSERT OR REPLACE INTO sessions(token,user_id,expires) VALUES(?,?,?)",
                     (token, uid, time.time() + 3600))
    return token


class TestUserFromToken:
    def test_non_admin_ai_enabled_true_is_read(self):
        # 핵심 회귀: 비관리자 + ai_enabled=1 → True 로 읽혀야 함
        tok = _mk_user('u_ai_on', ai_enabled=1, is_admin=0)
        u = main._get_user_from_token(tok)
        assert u is not None
        assert u['ai_enabled'] is True
        assert u['is_admin'] is False

    def test_non_admin_ai_disabled_is_false(self):
        tok = _mk_user('u_ai_off', ai_enabled=0, is_admin=0)
        u = main._get_user_from_token(tok)
        assert u['ai_enabled'] is False

    def test_status_is_read(self):
        # status 도 SELECT 에 포함돼야 — suspended 가 approved 로 잘못 읽히면 차단 우회됨
        tok = _mk_user('u_susp', ai_enabled=1, status='suspended')
        u = main._get_user_from_token(tok)
        assert u['status'] == 'suspended'

    def test_demo_user_seeded_ai_enabled(self):
        # 데모 시드 후 ai_enabled=1 (공개 체험)
        main._seed_demo_user()
        with main._db() as conn:
            row = conn.execute("SELECT ai_enabled,is_admin,status FROM users WHERE user_id=?",
                               (main.DEMO_UID,)).fetchone()
        assert row['ai_enabled'] == 1
        assert row['is_admin'] == 0
        assert row['status'] == 'approved'

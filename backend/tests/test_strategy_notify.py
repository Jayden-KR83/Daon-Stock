"""AI 전략 리포트 완료 알림 — 2026-11-03 오너 요청.

왜 필요한가: 이 작업은 **1~3분** 걸린다. 그 사이 사용자는 다른 탭으로 가거나 앱을
닫는다. 서버는 백그라운드로 계속 만들고 프런트가 폴링해 받지만, **앱이 닫혀 있으면
받을 곳이 없다** — 돌아와서 화면을 열기 전에는 끝난 줄 모른다.

여기서 고정하는 것
- 성공·실패 **둘 다** 알린다(실패를 안 알리면 언제까지 기다릴지 알 수 없다).
- 알림이 깨져도 **리포트는 남는다**(전체 격리).
- 푸시 태그가 고정이라 여러 번 돌려도 알림이 쌓이지 않는다.
"""
import main


def _user(uid='u-strat'):
    with main._db() as conn:
        for t in ('notifications',):
            conn.execute(f"DELETE FROM {t} WHERE user_id=?", (uid,))
        conn.execute("DELETE FROM users WHERE user_id=?", (uid,))
        conn.execute(
            "INSERT INTO users(user_id,email,name,pw_hash,created_at,status) "
            "VALUES(?,?,?,?,?,?)",
            (uid, f'{uid}@x.com', 'T', main._hash_password('pw'), 0.0, 'approved'))
    return uid


def _notifs(uid):
    with main._db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT kind, name, message FROM notifications WHERE user_id=? ORDER BY id",
            (uid,)).fetchall()]


class TestSuccess:
    def test_notifies_with_scope_and_first_sentence(self, monkeypatch):
        uid = _user('u-strat-ok')
        pushed = {}
        monkeypatch.setattr(main, '_send_push',
                            lambda u, t, b, url, tag=None: pushed.update(
                                {'title': t, 'body': b, 'tag': tag}) or {'sent': 1})
        main._notify_strategy_done(uid, 'ALL', {
            'expert_review': '반도체 비중이 54.8%로 높습니다. 두 번째 문장입니다.'})

        rows = _notifs(uid)
        assert len(rows) == 1
        assert rows[0]['kind'] == 'strategy'
        assert '전체 계좌' in rows[0]['message']
        assert '준비됐습니다' in rows[0]['message']
        assert '54.8%' in rows[0]['message'], '첫 문장 미리보기가 없다'
        assert pushed['title'] == '다온 AI 분석 완료'
        assert pushed['tag'] == 'strategy-done', '태그가 고정이어야 알림이 안 쌓인다'

    def test_account_scope_is_named(self, monkeypatch):
        uid = _user('u-strat-acc')
        monkeypatch.setattr(main, '_send_push', lambda *a, **k: {'sent': 0})
        main._notify_strategy_done(uid, 'KR_ISA', {'expert_review': '요약.'})
        assert 'KR_ISA' in _notifs(uid)[0]['message']

    def test_truncated_report_says_so(self, monkeypatch):
        """잘린 리포트를 완성된 것처럼 알리지 않는다(🟥 AI 응답 파싱 규약)."""
        uid = _user('u-strat-cut')
        monkeypatch.setattr(main, '_send_push', lambda *a, **k: {'sent': 0})
        main._notify_strategy_done(uid, 'ALL',
                                   {'expert_review': '요약.', '_truncated': True})
        assert '잘림' in _notifs(uid)[0]['message']

    def test_missing_text_still_notifies(self, monkeypatch):
        """본문이 없어도 '끝났다'는 사실은 알려야 한다."""
        uid = _user('u-strat-empty')
        monkeypatch.setattr(main, '_send_push', lambda *a, **k: {'sent': 0})
        main._notify_strategy_done(uid, 'ALL', {})
        assert len(_notifs(uid)) == 1


class TestFailure:
    def test_failure_is_notified_too(self, monkeypatch):
        """실패를 안 알리면 사용자는 언제까지 기다릴지 알 수 없다."""
        uid = _user('u-strat-err')
        pushed = {}
        monkeypatch.setattr(main, '_send_push',
                            lambda u, t, b, url, tag=None: pushed.update({'title': t}))
        main._notify_strategy_done(uid, 'ALL', None, error='길이 상한에서 잘렸습니다')
        rows = _notifs(uid)
        assert len(rows) == 1
        assert '실패' in rows[0]['message']
        assert '길이 상한' in rows[0]['message'], '왜 실패했는지가 빠졌다'
        assert pushed['title'] == '다온 AI 분석 실패'


class TestIsolation:
    def test_push_failure_does_not_raise(self, monkeypatch):
        """알림이 깨져도 리포트 생성 경로는 살아 있어야 한다."""
        uid = _user('u-strat-push')

        def boom(*a, **k):
            raise RuntimeError('push down')
        monkeypatch.setattr(main, '_send_push', boom)
        main._notify_strategy_done(uid, 'ALL', {'expert_review': '요약.'})   # 예외 없음

    def test_db_failure_does_not_raise(self, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError('db down')
        monkeypatch.setattr(main, '_db', boom)
        main._notify_strategy_done('nobody', 'ALL', {'expert_review': '요약.'})

    def test_job_calls_it_on_both_paths(self):
        """성공·실패 두 갈래에서 모두 불러야 한다 — 한쪽만이면 조용히 끝난다."""
        import inspect
        src = inspect.getsource(main._run_strategy_job)
        assert src.count('_notify_strategy_done') == 2, \
            '성공/실패 중 한쪽에서만 알린다'

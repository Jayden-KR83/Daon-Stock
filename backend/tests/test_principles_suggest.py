"""투자 원칙 — 제안·승인 분리와 '정리할 때' 판정 (2026-10-23).

왜 회귀 보호가 필요한가:
  승인 전 제안이 프롬프트로 새어 들어가면, 비서가 **자기 추측을 근거로** 다음 답을
  하고 그 답이 또 다음 추출의 재료가 된다. 내 오류를 내가 굳히는 고리가 생긴다.
  화면으로는 보이지 않는 종류의 고장이라 테스트로 고정한다.

  '때가 됐는지' 판정은 돈이 걸려 있다 — distill 은 서버 API 지갑을 쓴다.
  날짜만 보고 권하면 빈 대화로 호출해 돈만 쓰고 '뽑을 것 없음'을 받는다.
"""
import pytest
from fastapi import HTTPException

import main

UID = 'test-principles-user'
CU = {'user_id': UID}
DAY = 86400


def _reset(principles=(), turns=0, last_run=None, turn_age=0):
    """principles = [(text, source)] · turns = 최근 대화 수"""
    main._ensure_principles_table()
    with main._db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users(user_id, email, name, pw_hash, created_at) "
            "VALUES(?,?,?,?,?)", (UID, f'{UID}@test.local', UID, 'x', '2026-10-23'))
        conn.execute("DELETE FROM investment_principles WHERE user_id=?", (UID,))
        conn.execute("DELETE FROM chat_messages WHERE user_id=?", (UID,))
        conn.execute("DELETE FROM settings WHERE key=?", (f'principles_distilled:{UID}',))
        now = main.time()
        for text, source in principles:
            conn.execute(
                "INSERT INTO investment_principles(user_id, text, source, evidence, created_at) "
                "VALUES(?,?,?,?,?)", (UID, text, source, '', now))
        for i in range(turns):
            conn.execute(
                "INSERT INTO chat_messages(user_id, scope, role, content, created_at) "
                "VALUES(?,?,?,?,?)", (UID, 'general', 'user', f'm{i}', now - turn_age))
        if last_run is not None:
            conn.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                         (f'principles_distilled:{UID}', str(last_run)))


class TestPromptIsolation:
    def test_승인된_원칙만_프롬프트에_들어간다(self):
        _reset([('승인된 기준이다', 'ai'),
                ('내가 쓴 기준이다', 'owner'),
                ('아직 제안일 뿐이다', 'suggested')])
        txt = main._principles_text(UID)
        assert '승인된 기준이다' in txt
        assert '내가 쓴 기준이다' in txt
        assert '아직 제안일 뿐이다' not in txt   # ← 이 줄이 고리를 끊는다

    def test_제안만_있으면_블록_자체가_없다(self):
        _reset([('아직 제안일 뿐이다', 'suggested')])
        assert main._principles_text(UID) == ''


class TestDue:
    def test_한번도_안했고_대화가_쌓였으면_권한다(self):
        _reset(turns=main.PRINCIPLES_DUE_TURNS)
        assert main._principles_due(UID)['due'] is True

    def test_대화가_모자라면_권하지_않는다(self):
        # 빈 대화로 호출하면 돈만 쓰고 '뽑을 것 없음'을 받는다
        _reset(turns=main.PRINCIPLES_DUE_TURNS - 1)
        assert main._principles_due(UID)['due'] is False

    def test_최근에_했으면_권하지_않는다(self):
        _reset(turns=50, last_run=main.time() - 5 * DAY)
        assert main._principles_due(UID)['due'] is False

    def test_30일_지나고_새_대화가_쌓이면_권한다(self):
        last = main.time() - (main.PRINCIPLES_DUE_DAYS + 1) * DAY
        _reset(turns=main.PRINCIPLES_DUE_TURNS, last_run=last)
        out = main._principles_due(UID)
        assert out['due'] is True
        assert out['new_turns'] == main.PRINCIPLES_DUE_TURNS

    def test_30일_지나도_새_대화가_없으면_권하지_않는다(self):
        # 지난 정리 **이전** 대화만 있는 경우 — 날짜만 보면 틀린다
        last = main.time() - (main.PRINCIPLES_DUE_DAYS + 1) * DAY
        _reset(turns=50, last_run=last, turn_age=(main.PRINCIPLES_DUE_DAYS + 5) * DAY)
        out = main._principles_due(UID)
        assert out['new_turns'] == 0
        assert out['due'] is False


class TestApprove:
    def test_승인하면_프롬프트에_들어간다(self):
        _reset([('아직 제안일 뿐이다', 'suggested')])
        with main._db() as conn:
            pid = conn.execute(
                "SELECT id FROM investment_principles WHERE user_id=?", (UID,)).fetchone()['id']
        assert main._principles_text(UID) == ''
        main.approve_principle(pid, cu=CU)
        assert '아직 제안일 뿐이다' in main._principles_text(UID)

    def test_이미_승인된_것은_다시_승인되지_않는다(self):
        _reset([('승인된 기준이다', 'ai')])
        with main._db() as conn:
            pid = conn.execute(
                "SELECT id FROM investment_principles WHERE user_id=?", (UID,)).fetchone()['id']
        with pytest.raises(HTTPException) as e:
            main.approve_principle(pid, cu=CU)
        assert e.value.status_code == 404

    def test_남의_제안은_승인할_수_없다(self):
        _reset([('아직 제안일 뿐이다', 'suggested')])
        with main._db() as conn:
            pid = conn.execute(
                "SELECT id FROM investment_principles WHERE user_id=?", (UID,)).fetchone()['id']
        with pytest.raises(HTTPException) as e:
            main.approve_principle(pid, cu={'user_id': 'someone-else'})
        assert e.value.status_code == 404


class TestListShape:
    def test_제안과_원칙이_갈라져_나온다(self):
        _reset([('승인된 기준이다', 'ai'), ('아직 제안일 뿐이다', 'suggested')])
        out = main.list_principles(cu=CU)
        assert [p['text'] for p in out['principles']] == ['승인된 기준이다']
        assert [p['text'] for p in out['pending']]    == ['아직 제안일 뿐이다']

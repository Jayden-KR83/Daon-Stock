"""투자 나침반 신호(설계안 A) — '바뀐 것만 남긴다' 규율 회귀 보호.

이 기능의 가치는 무엇을 보여주냐가 아니라 **무엇을 안 보여주냐**에 있다.
추천이 그대로면 침묵하고, 출처가 없으면 기록하지 않는다.
"""
import main


class TestFirstSentence:
    def test_splits_on_sentence_end(self):
        assert main._first_sentence("첫 문장이다. 둘째 문장이다.") == "첫 문장이다."

    def test_keeps_decimal_numbers_intact(self):
        """'매출 12.5% 증가' 가 '매출 12.' 로 잘리면 안 된다."""
        t = "매출이 12.5% 늘었다. 이는 컨센서스 상회다."
        assert main._first_sentence(t) == "매출이 12.5% 늘었다."

    def test_empty_input(self):
        assert main._first_sentence("") == ""
        assert main._first_sentence(None) == ""

    def test_truncates_long_sentence(self):
        out = main._first_sentence("가" * 300, limit=50)
        assert len(out) == 50 and out.endswith("…")


class TestRecordCompassSignal:
    def _clear(self):
        with main._db() as conn:
            conn.execute("DELETE FROM compass_signals")

    def _res(self, reco, url="https://example.com/a", summary="근거 문장이다. 부연이다."):
        return {'recommendation': reco, 'summary': summary,
                'sources': [{'title': 't', 'url': url}] if url else []}

    def test_records_when_recommendation_changes(self):
        self._clear()
        assert main._record_compass_signal('AAPL', 'Apple', '보유', self._res('매도')) is True
        with main._db() as conn:
            row = conn.execute("SELECT * FROM compass_signals WHERE ticker='AAPL'").fetchone()
        assert row['prev_reco'] == '보유' and row['new_reco'] == '매도'
        assert row['headline'] == '근거 문장이다.'

    def test_silent_when_unchanged(self):
        """같은 판단이면 신호가 아니다 — 매일 같은 배너를 띄우면 그게 과부하다."""
        self._clear()
        assert main._record_compass_signal('AAPL', 'Apple', '보유', self._res('보유')) is False
        with main._db() as conn:
            assert conn.execute("SELECT COUNT(*) c FROM compass_signals").fetchone()['c'] == 0

    def test_requires_source_url(self):
        """근거 없는 제안은 나침반이 아니라 소음이다."""
        self._clear()
        assert main._record_compass_signal('AAPL', 'Apple', '보유', self._res('매도', url='')) is False

    def test_first_analysis_counts_as_signal(self):
        """직전 추천이 없던 종목(첫 분석)도 알릴 가치가 있다."""
        self._clear()
        assert main._record_compass_signal('NVDA', 'NVIDIA', '', self._res('매수')) is True

    def test_missing_recommendation_is_ignored(self):
        self._clear()
        assert main._record_compass_signal('AAPL', 'Apple', '보유', self._res('')) is False

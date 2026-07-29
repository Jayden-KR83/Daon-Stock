"""급등락 알림(일간 변동률 ±N%) 발화 판정 룰.

_decide_move_alert: 임계 미달=무발화 / 최초 돌파=발화 / 같은 방향은 한 단계 더
벌어질 때만 재발화 / 방향 전환은 즉시 발화 / 되돌림 후 재돌파는 다시 발화.
"""
import backend.main as main

D = main._decide_move_alert


class TestThreshold:
    def test_below_threshold_no_fire(self):
        assert D(4.9, 5.0, None) is None
        assert D(-4.9, 5.0, None) is None

    def test_exactly_at_threshold_fires(self):
        assert D(5.0, 5.0, None) == 'surge'
        assert D(-5.0, 5.0, None) == 'plunge'

    def test_direction(self):
        assert D(6.2, 5.0, None) == 'surge'
        assert D(-6.2, 5.0, None) == 'plunge'

    def test_custom_threshold(self):
        assert D(6.0, 10.0, None) is None
        assert D(11.0, 10.0, None) == 'surge'

    def test_invalid_inputs(self):
        assert D(None, 5.0, None) is None
        assert D('x', 5.0, None) is None
        assert D(9.9, 0, None) is None


class TestRefire:
    def test_same_direction_same_band_no_refire(self):
        st = {'last_kind': 'plunge', 'last_pct': -6.0}
        assert D(-7.5, 5.0, st) is None          # -6 → -7.5, 아직 한 단계 미만

    def test_same_direction_next_band_refires(self):
        st = {'last_kind': 'plunge', 'last_pct': -6.0}
        assert D(-11.0, 5.0, st) == 'plunge'     # -6 → -11, 임계만큼 더 벌어짐

    def test_direction_flip_refires(self):
        st = {'last_kind': 'plunge', 'last_pct': -6.0}
        assert D(5.4, 5.0, st) == 'surge'

    def test_recovery_below_threshold_disarms(self):
        # 되돌림 구간은 무발화 — 호출부가 상태 행을 지워 재무장한다
        st = {'last_kind': 'plunge', 'last_pct': -6.0}
        assert D(-1.2, 5.0, st) is None

    def test_rearmed_after_recovery_fires_again(self):
        # 재무장(state=None) 후 같은 크기로 다시 떨어지면 발화
        assert D(-5.5, 5.0, None) == 'plunge'

    def test_shrinking_move_no_refire(self):
        st = {'last_kind': 'surge', 'last_pct': 9.0}
        assert D(6.0, 5.0, st) is None           # 여전히 임계 위지만 축소 → 재알림 X


class TestPrefsDefaults:
    def test_defaults_are_on_5pct_both(self):
        d = main.MOVE_ALERT_DEFAULTS
        assert d['enabled'] is True
        assert d['threshold_pct'] == 5.0
        assert d['scope'] == 'both'

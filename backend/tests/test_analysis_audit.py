"""종목 분석 '출력' 자가 감사 회귀 보호.

AI가 생성한 분석 텍스트가 섹터별 비즈니스 로직(TechBio)을 어겼는지
결정적으로 탐지하는 _audit_stock_analysis 검증. (사용자 눈 대신 시스템이 검증)
"""
import main


class TestAnalysisAudit:
    def test_flags_founder_stepdown_as_risk(self):
        # item1 위반: 창업자 이사회 퇴임을 리스크로 분류
        data = {'bear': [
            '경영진 이행기 불확실성: 공동창업자 Chris Gibson의 이사회 퇴임으로 창업자 리스크 발생 가능',
        ]}
        issues = main._audit_stock_analysis('RXRX', data)
        assert any('item1' in i for i in issues)

    def test_flags_manufacturing_backlog(self):
        # item2 위반: 마일스톤/기술수출 언급 없이 제조식 수주잔고
        data = {'backlog': '수주 잔고는 전분기 대비 12% 증가했다.'}
        issues = main._audit_stock_analysis('RXRX', data)
        assert any('item2' in i for i in issues)

    def test_passes_compliant_techbio(self):
        # 규칙 준수: 임상 리스크(정상) + 마일스톤 서술
        data = {
            'bear': ['후기 임상 실패 시 주가 급락 리스크가 있다.'],
            'backlog': '수주 잔고 대신 Sanofi 파트너십 잠재 마일스톤 최대 $1.8B와 기술수출 잠재력을 보유.',
        }
        assert main._audit_stock_analysis('RXRX', data) == []

    def test_skips_non_techbio(self):
        # 비-TechBio는 감사 대상 아님 (오탐 방지)
        data = {'bear': ['공동창업자 이사회 퇴임 리스크'], 'backlog': '수주 잔고 증가'}
        assert main._audit_stock_analysis('AAPL', data) == []

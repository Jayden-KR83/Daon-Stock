"""Peer Group 매칭 회귀 보호.

TechBio(AI 신약개발 플랫폼)는 'AI' 키워드로 데이터센터(APLD)·로봇(SERV) 등
이종 섹터가 비교군에 섞이지 않고, 동일 AI 신약개발 플랫폼끼리만 묶여야 한다.
"""
import main


class TestAidrugPeers:
    def test_techbio_curated_excludes_cross_sector(self):
        peers = main._curated_aidrug_peers('RXRX')
        assert peers is not None
        assert 'RXRX' not in peers          # 자기 자신 제외
        assert 'APLD' not in peers          # 데이터센터 배제
        assert 'SERV' not in peers          # 로봇 배제
        assert all(p in main._AIDRUG_PEERS for p in peers)
        assert len(peers) <= 4

    def test_techbio_includes_drug_platforms(self):
        peers = set(main._curated_aidrug_peers('RXRX'))
        # AI 신약개발 플랫폼 동종군(SDGR·EXAI 등)이 포함되어야 함
        assert {'SDGR', 'EXAI'} & peers

    def test_non_techbio_returns_none(self):
        # 일반 종목은 큐레이션 대상 아님 → Yahoo 추천 경로(None)
        assert main._curated_aidrug_peers('AAPL') is None
        assert main._curated_aidrug_peers('MSFT') is None

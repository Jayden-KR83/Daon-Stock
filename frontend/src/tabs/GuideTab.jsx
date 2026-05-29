import React, { useState } from 'react'

/* ── 무채색 단색 SVG 아이콘 (색상 이모지 제거 방침) ── */
const Icon = {
  book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  holdings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  watchlist: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  allocation: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  trends: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  add: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  manage: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  rocket: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  market: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  key: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  data: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>,
  star: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
}

const FEATURES = [
  {
    key: 'holdings', title: '보유 탭',
    desc: '내 포트폴리오 종목과 수익률을 한눈에 확인합니다.',
    details: [
      '총 평가액과 손익을 원화/달러로 전환 표시',
      '계좌별 필터: 전체 / 미국 / 퇴직 / 개별 / ISA',
      '정렬: 평가액순 · 시세순 / 높은순 · 낮은순',
      '종목명 클릭 → 차트 탭으로 이동 (우측 패널 컨텍스트 자동 갱신)',
      '스파크라인(30일 미니차트) — 미국·한국 종목 모두 지원',
    ],
  },
  {
    key: 'watchlist', title: '관심 탭',
    desc: '관심 종목 시세를 추적하고 그룹별로 정리합니다.',
    details: [
      '상단 검색창에서 즉시 종목 검색 및 추가',
      '종목 클릭 → 차트 탭으로 이동 (관련 뉴스·지표 함께 표시)',
      '🏷 버튼: 그룹 변경 (예: "AI인프라", "배당주", "관찰") — 그룹 2개 이상 시 토글 자동 표시',
      '휴지통 버튼: 목록에서 삭제',
    ],
  },
  {
    key: 'allocation', title: '비중 탭',
    desc: '자산 추이·종합점수·경고·상관관계·백테스트·AI 전략을 한 곳에서 확인합니다.',
    details: [
      '📈 자산 추이 (Net Worth): 일별 자동 누적 + 1M/3M/6M/1Y/ALL 토글',
      '🏆 Portfolio Health Score: 0-100점 + S/A/B/C/D 등급 + 4지표 설명 + 약점 강조',
      '🛎 자동 리밸런싱 경고: 단일 종목 30%+ / 단일 섹터 50%+ / -20% 손실 / ETF+개별 중복 / 종목 ≤2개 — 임계값 사용자 조정 가능',
      '🔗 종목 간 상관관계 매트릭스: 1년 일별 수익률 → Pearson 상관 히트맵 (낮을수록 분산 효과 ↑)',
      '📉 백테스트: 현재 보유 비중으로 과거 3M~5Y 시뮬레이션 (MDD·변동성·샤프)',
      '계좌별/섹터별/종목별 파이 차트 + AI 전략 리포트 (Claude Haiku)',
    ],
  },
  {
    key: 'chart', title: '차트 탭',
    desc: '종목 차트와 거래내역·실적·심층 분석을 제공합니다.',
    details: [
      'Apple Stocks 풍 헤더: 큰 가격 + 미니 sparkline + 일간 변동 (NumberTicker 애니메이션)',
      '캔들스틱: 1M / 3M / 6M / 1Y / 2Y / 5Y · MA20/60/120 · RSI(14)',
      '📒 거래내역 (BUY/SELL): FIFO 매칭으로 평균단가·실현손익 자동 계산',
      '📝 종목별 메모/투자노트 (보유 탭 카드의 메모 아이콘으로 진입) — 손절가·목표가 저장',
      'Valuation & Financials · 동종업계 비교 (항상 펼쳐 표시)',
      'AI 투자 분석: 매수/보유/매도 + 강세·리스크 + 종합 의견 (Claude Sonnet 4.6 + Web Search)',
    ],
  },
  {
    key: 'trends', title: '트렌드 탭',
    desc: '글로벌 시장 흐름·실적 캘린더·차트 비교·ETF 비교를 통합 제공합니다.',
    details: [
      '미국·한국 거래량 Top 10 (트렌드 컬럼에 5일 sparkline)',
      'S&P500 · KOSPI 섹터 히트맵 + 글로벌 투자 뉴스',
      '📊 차트 비교 모드: 2~6종목 정규화(=100) 동시 비교 (TradingView 스타일)',
      '📅 실적 캘린더: 보유+관심 종목 향후 90일 실적 발표일 (D-7 이내 강조)',
      '🔍 한·미 ETF 비교 도구: 4종 동시 비교 + AI 시사점 (AUM·거래량·보수율·상위보유)',
    ],
  },
  {
    key: 'add', title: '추가 탭',
    desc: '포트폴리오에 새 종목을 직접 추가합니다.',
    details: [
      '계좌 선택 — 동적 계좌 (사용자가 관리 탭에서 추가/이름변경 가능)',
      '티커, 종목명, 수량, 평균단가, 섹터 입력',
      '한국 종목: 6자리 코드 (005930)',
      '미국 종목: 알파벳 티커 (NVDA)',
      '※ 매수/매도 정확한 기록은 차트 탭의 "거래내역" 섹션 활용 권장',
    ],
  },
  {
    key: 'manage', title: '관리 탭',
    desc: '프로필·계좌·데이터·API 키를 관리합니다.',
    details: [
      '◆ 계좌 관리: 동적 계좌 CRUD — 9종 통화 (KRW/USD/EUR/JPY/BRL/GBP/CNY/HKD/INR)',
      '사용자 정보: 닉네임 수정',
      '관리자 모드 (admin): 잠금 해제 후 사용자/AI 권한 관리',
      '자동 백업 & 원복: 엑셀 일괄 업로드 직전 상태 스냅샷',
      '엑셀 템플릿 다운로드 · 업로드 (일괄 업데이트)',
      'Anthropic API Key: 서버 저장 · 모든 기기 공유',
      '테마: 라이트 · 다크 · 프로 · 자동 (OS 따라감)',
    ],
  },
  {
    key: 'manage', title: '관리자 탭 (admin 전용)',
    desc: '앱 사용자 및 사용 현황을 종합 관리합니다.',
    details: [
      '가입 승인/거부/정지/복원 — 신규 가입자는 default pending',
      'AI 사용 권한 사용자별 토글 (비용 제어)',
      '관리자 권한 부여/회수',
      '사용 현황 대시보드: 활성 사용자 / AI 호출 / 가입 추이 30일',
      '활동 로그 80건 (가입·로그인·차단·AI호출·관리자액션)',
    ],
  },
]

const MARKET_ITEMS = [
  { name: 'S&P500', desc: '미국 대형주 500개 지수' },
  { name: 'Dow', desc: '미국 다우존스 30개 산업지수' },
  { name: 'Nasdaq', desc: '미국 기술주 중심 지수' },
  { name: 'VIX', desc: '공포지수 — 높을수록 시장 불안' },
  { name: 'Russell', desc: '미국 소형주 2000개 지수' },
  { name: 'KOSPI', desc: '한국 대표 주가지수' },
  { name: 'BTC / ETH', desc: '비트코인 / 이더리움 시세' },
  { name: 'Gold / Silver', desc: '금/은 선물 가격' },
  { name: 'USD/KRW', desc: '달러/원 환율' },
  { name: '10Y채권', desc: '미국 10년물 국채 금리' },
]

const TIPS = [
  { key: 'search', title: '상단 검색창으로 즉시 차트 확인',
    desc: '웹 모드 우측 상단 검색창에 티커를 입력하면 드롭다운이 뜨고, 클릭 시 바로 차트 탭으로 이동합니다.' },
  { key: 'drag', title: '마켓바 & 보유 종목 드래그',
    desc: '최상단 지수 바와 차트 탭의 보유 종목 pills는 마우스로 좌우 드래그하여 스크롤할 수 있습니다.' },
  { key: 'logo', title: 'DAON 로고 → 홈',
    desc: '왼쪽 사이드바의 DAON 로고를 클릭하면 보유 탭(홈)으로 돌아갑니다.' },
  { key: 'star', title: '우측 패널에서 즉시 관심 추가',
    desc: '차트 탭 우측 패널의 뉴스 헤더와 관련 종목 옆에 별표(☆) 아이콘이 있어 원클릭으로 관심 등록됩니다.' },
  { key: 'cache', title: 'AI 분석 24시간 캐시',
    desc: '동일 종목/포트폴리오의 AI 분석은 24시간 내 재호출 시 저장된 결과를 즉시 반환하여 API 비용을 절약합니다.' },
  { key: 'backup', title: '데이터 일괄 업로드 전 자동 백업',
    desc: '엑셀 업로드 등 일괄 저장 직전의 포트폴리오가 자동 백업되며, 관리 탭에서 한 번의 클릭으로 원복 가능합니다.' },
  { key: 'shortcut', title: '키보드 단축키 (PC)',
    desc: '1·2·3·4·5 → 보유/관심/비중/차트/트렌드 탭 즉시 이동 · / → 검색창 포커스 · ESC → 모달/시트 닫기 · ? → 단축키 도움말. (입력 칸 포커스 중에는 비활성화)' },
  { key: 'theme-auto', title: '다크모드 OS 자동 동기화',
    desc: '관리 탭 테마를 "자동"으로 설정하면 OS의 다크모드/라이트모드 설정에 따라 앱이 자동 전환됩니다 (Windows 일출/일몰 또는 macOS 시스템 설정 따름).' },
  { key: 'snapshot-auto', title: '자동 자산 추이 누적',
    desc: '매일 KST 17:00 (장 마감 후) 서버가 자동으로 사용자별 평가액·종목별 P/L을 스냅샷 저장합니다. 앱에 접속하지 않아도 일별 자산 곡선이 누적됩니다.' },
  { key: 'cron-backup', title: '매일 04:00 daon.db 자동 백업',
    desc: 'Oracle 서버 cron이 매일 KST 04:00에 daon.db를 tar.gz로 백업하고 30일분 보관합니다. 데이터 손실 위험 거의 없습니다.' },
  { key: 'changelog', title: '신규 기능 공지 (Changelog)',
    desc: '버전 업데이트 후 첫 진입 시 자동으로 새 기능 안내 모달이 한 번 표시됩니다. 관리 탭에서 다시 열기도 가능합니다.' },
]

export default function GuideTab() {
  const [openIdx, setOpenIdx] = useState(null)

  return (
    <div style={{ paddingTop: 8, paddingBottom: 40 }}>
      {/* 헤더 */}
      <div style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
        borderRadius: 16, padding: '24px 20px', marginBottom: 20, color: '#fff' }}>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-.02em', marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex' }}>{Icon.book}</span>
          다온 사용 설명서
        </div>
        <div style={{ fontSize: 13, opacity: 0.92, lineHeight: 1.7 }}>
          다온은 개인 주식 포트폴리오 통합 관리 앱입니다.
          미국·한국 주식을 한 화면에서 관리하고, AI 분석으로 투자 인사이트를 얻으세요.
        </div>
      </div>

      {/* 빠른 시작 */}
      <div style={{ background: 'var(--clr-surface)', borderRadius: 16, padding: 16, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--clr-text-strong)', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--clr-info)', display: 'inline-flex' }}>{Icon.rocket}</span>
          빠른 시작 (3단계)
        </div>
        {[
          { step: '1', title: '종목 추가', desc: '추가 탭 또는 관리 탭의 엑셀 업로드로 보유 종목을 등록하세요', color: 'var(--clr-info)' },
          { step: '2', title: '포트폴리오 확인', desc: '보유 탭에서 총 평가액·손익·종목별 수익률을 확인하세요', color: '#10B981' },
          { step: '3', title: 'AI 분석 활용', desc: '비중 탭 AI 전략 리포트, 차트 탭 AI 투자 분석 (Anthropic API Key 필요)', color: '#8B5CF6' },
        ].map(item => (
          <div key={item.step} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: item.color,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{item.step}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)' }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'var(--clr-text-sub)', lineHeight: 1.6, marginTop: 2 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 상단 마켓 바 설명 */}
      <div style={{ background: 'var(--clr-surface)', borderRadius: 16, padding: 16, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--clr-text-strong)', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--clr-text-sub)', display: 'inline-flex' }}>{Icon.market}</span>
          상단 마켓 바
        </div>
        <div style={{ fontSize: 12, color: 'var(--clr-text-sub)', marginBottom: 10, lineHeight: 1.7 }}>
          화면 최상단의 실시간 글로벌 지수. 각 항목 클릭 시 앱 내 차트 탭으로 이동하며,
          좌우 드래그 스크롤을 지원합니다.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {MARKET_ITEMS.map(item => (
            <div key={item.name} style={{ display: 'flex', gap: 8, padding: '5px 0',
              borderBottom: '1px solid #F8FAFC' }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--clr-info-dark)', minWidth: 80 }}>{item.name}</span>
              <span style={{ fontSize: 11, color: 'var(--clr-text-sub)' }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 탭별 기능 (아코디언) */}
      <div style={{ background: 'var(--clr-surface)', borderRadius: 16, padding: '8px 0',
        boxShadow: '0 1px 3px rgba(0,0,0,.05)', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--clr-text-strong)', padding: '8px 16px 12px' }}>
          탭별 기능 상세
        </div>
        {FEATURES.map((f, i) => (
          <div key={i} style={{ borderTop: '1px solid var(--clr-border)' }}>
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ color: 'var(--clr-text-sub)', display: 'inline-flex', flexShrink: 0 }}>
                {Icon[f.key]}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginTop: 1 }}>{f.desc}</div>
              </div>
              <span style={{ color: 'var(--clr-text-muted)', fontSize: 12 }}>{openIdx === i ? '▲' : '▼'}</span>
            </button>
            {openIdx === i && (
              <div style={{ padding: '0 16px 14px 48px' }}>
                {f.details.map((d, di) => (
                  <div key={di} style={{ fontSize: 13, color: 'var(--clr-text)', padding: '3px 0',
                    lineHeight: 1.7 }}>
                    <span style={{ color: 'var(--clr-info)', marginRight: 6 }}>•</span>{d}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 숨은 팁 */}
      <div style={{ background: 'var(--clr-surface)', borderRadius: 16, padding: 16, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--clr-text-strong)', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#F59E0B', display: 'inline-flex' }}>{Icon.star}</span>
          숨은 팁 & 단축 기능
        </div>
        {TIPS.map((t, i) => (
          <div key={t.key} style={{ padding: '10px 0',
            borderBottom: i < TIPS.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 3 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-sub)', lineHeight: 1.6 }}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* API Key 안내 */}
      <div style={{ background: 'var(--clr-warn-bg)', borderRadius: 16, padding: 16, marginBottom: 16,
        border: '1px solid #FED7AA' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--clr-warn-dark)', marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--clr-warn-dark)', display: 'inline-flex' }}>{Icon.key}</span>
          Anthropic API Key 안내
        </div>
        <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.8 }}>
          AI 분석 기능(비중 · 차트)을 사용하려면 Anthropic API Key가 필요합니다.
          기본 모델은 Claude Haiku 4.5 (저비용) 이며, 24시간 분석 캐시로 비용을 절감합니다.
        </div>
        <div style={{ marginTop: 10 }}>
          {[
            '1. console.anthropic.com 접속 → 로그인',
            '2. 좌측 메뉴 → API Keys → Create Key',
            '3. 좌측 메뉴 → Plans & Billing → Add Credits (최소 $5 권장)',
            '4. 생성된 sk-ant-... 키를 관리 탭의 API Key 입력란에 붙여넣기',
            '5. 서버 SQLite에 저장되어 모든 기기에서 공유됩니다',
          ].map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: '#78350F', padding: '2px 0', lineHeight: 1.7 }}>{s}</div>
          ))}
        </div>
      </div>

      {/* 데이터 출처 */}
      <div style={{ background: 'var(--clr-surface)', borderRadius: 16, padding: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--clr-text-strong)', marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--clr-text-sub)', display: 'inline-flex' }}>{Icon.data}</span>
          데이터 출처
        </div>
        {[
          ['미국 시세·차트·실적·EPS', 'Yahoo Finance (v8 chart API + yfinance)'],
          ['한국 시세', 'Naver 금융 (스크래핑)'],
          ['한국 차트·스파크라인', 'Yahoo v8 chart API (.KS / .KQ)'],
          ['한국 뉴스', 'Naver 금융 (iframe 스크래핑)'],
          ['미국 뉴스', 'Yahoo Finance search API'],
          ['애널리스트 목표가', 'Thomson Reuters / Refinitiv (yfinance)'],
          ['섹터 히트맵', '섹터 ETF 종목 기반 계산'],
          ['AI 분석', 'Anthropic Claude Haiku 4.5 (24h 캐시)'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderBottom: '1px solid #F8FAFC', fontSize: 12 }}>
            <span style={{ color: 'var(--clr-text-sub)' }}>{k}</span>
            <span style={{ fontWeight: 600, color: 'var(--clr-text-strong)' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

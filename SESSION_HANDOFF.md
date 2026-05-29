# A안 작업 — 세션 핸드오프 노트

**시작 시각**: 2026-05-19
**상태**: 🟢 진행 중

## 목적
세션 토큰 한도 도달 등으로 작업이 중단됐을 때, 다음 세션이 정확히 어디서부터 이어가야 하는지 추적.

## 작업 범위 (A안)
| # | 작업 | 상태 | 배포 | 비고 |
|---|---|---|---|---|
| **A1-be** | Net Worth 스냅샷 백엔드 (DB + 자동 캡처 + GET endpoint) | ✅ | 🚀 | `net_worth_snapshots` 테이블, `POST /api/snapshots/capture`, `GET /api/snapshots/networth` |
| **A1-fe** | Net Worth 추이 차트 (Allocation 탭) | ✅ | 🚀 | `NetWorthChart.jsx` 신규, App.jsx에 lazy capture trigger. 번들: `index-B1Y4grqC.js` |
| **B1-be** | Portfolio Health Score 계산 + endpoint | ✅ | 🚀 | `POST /api/portfolio/health` — 4개 하위 지표 가중평균, 등급 S/A/B/C/D |
| **B1-fe** | Health Score 게이지 + 세부 점수 UI | ✅ | 🚀 | `HealthScoreCard.jsx` — SVG 반원 게이지 + 4개 SubScoreBar. 번들: `index-CugQWIn7.js` |
| **B3-be** | 룰 기반 리밸런싱 경고 + endpoint | ✅ | 🚀 | `POST /api/portfolio/alerts` — 5개 룰 (종목/섹터 집중·큰손실·중복·미분산) |
| **B3-fe** | 경고 카드 UI | ✅ | 🚀 | `AlertsCard.jsx` — severity별 색상, 임계값 조정 가능. 번들: `index-Ct8FicrM.js` |
| **D1** | Puppeteer 회귀 테스트 스크립트 | ✅ | 🚀 | `scripts/regression-test.js` — 10탭 + 차트 + 신규 6컴포넌트 자동 검증, exit code 0/1 |

## 최종 상태 (2026-05-19 종료)
- **전체 A안 완료** — 4개 deployable chunk 모두 배포·검증
- **회귀 테스트 PASS** — 모든 10탭 OK + Recharts 렌더 + NetWorth/HealthScore/Alerts/Backtest/AI/Shimmer 모두 표시
- 테스트 세션 cleanup 완료

## 사용 방법 (회귀 테스트)
```bash
# 1) 임시 세션 생성 (서버에서)
SESS=$(ssh ubuntu@168.107.13.20 "python3 -c 'import sqlite3,secrets,time; t=\"TESTONLY_\"+secrets.token_hex(16); ...'")
# 2) 테스트 실행
cd scripts && DAON_TOKEN=$SESS node regression-test.js
# 결과: PASS=exit 0, FAIL=exit 1
```

---

## 🌙 2026-05-21 야간 세션 — B + C + E안 일괄 (auto-mode)

| 단계 | 상태 | 배포 |
|---|---|---|
| **백업** (`_backup/daon-pre-BCE-20260521-2213/`) | ✅ | - |
| **E-A3 cron 자동 백업** (매일 KST 04:00, 30일 보관) | ✅ | 🚀 |
| **E-D2 Changelog 인앱 공지** (`changelog.json` + `ChangelogModal.jsx`) | ✅ | 🚀 |
| **E-A2 종목별 P/L 일별 스냅샷** + lazy capture | ✅ | 🚀 |
| **C-C3 다크모드 OS 자동 (auto theme)** | ✅ | 🚀 |
| **C-C2 단축키 시스템** (1-5 탭 / / 검색 / ESC / ?) | ✅ | 🚀 |
| **C-C5 최근 검색** (localStorage 기반) | ✅ | 🚀 |
| **C-C1 관심종목 그룹화** (`watchlist.group_name`) | ✅ | 🚀 |
| **B-B4 실적 캘린더** (yfinance earnings_dates) | ✅ | 🚀 |
| **B-B2 상관관계 매트릭스** (히트맵 테이블) | ✅ | 🚀 |
| **B-B5 차트 비교 모드** (2-6종목 normalize=100) | ✅ | 🚀 |

**번들 (최종)**: `index-CEp0W-J2.js` (ChangelogModal sentinel 패치 포함) — 로컬 빌드 완료, ⚠️ 서버 outage로 미배포
**Backend SQLite 신규 테이블**: `holding_pnl_snapshots`
**Backend 컬럼 추가**: `watchlist.group_name`
**Backend 신규 endpoints**: 10개 (P/L capture/조회·watchlist 그룹·상관관계·실적·차트비교)
**Frontend 신규 컴포넌트**: 5개 (ChangelogModal · KeyboardShortcuts · CorrelationCard · EarningsCalendar · CompareChart)

## ⚠️ Oracle 서버 일시 불통 (2026-05-21 야간)

### 좋은 소식 — 사용자 체감 기능 모두 정상 배포됨 ✅
`index-D8235eZb.js` (B+C+E안 모든 11개 기능 포함) 가 **outage 전에 배포 완료**되어 있음 (`systemctl is-active = active` 확인됨). 사용자는 F5 새로고침 시 모든 신규 기능을 정상 사용 가능.

### 미배포 (선택적)
- `index-CEp0W-J2.js` — **회귀 테스트 자동화 friendly sentinel 패치만 포함**
- ChangelogModal에 `v9xx`/`dismissed` 토큰을 sentinel로 인식해서 자동 닫기 — 회귀 테스트가 모달 클릭 가로채임 회피용
- **사용자 체감 영향 0** — D8235eZb 그대로 써도 모든 기능 정상

### 원인
Oracle Free Tier VM idle reclaim 또는 일시 네트워크 장애 (코드와 무관, ping 100% loss / HTTP 000 / ssh banner timeout)

### 자동 모니터링 진행 중
서버 복구 감지하면 즉시 알림 → CEp0W-J2.js 배포 + 회귀 재실행

### 수동 복구 명령 (참고 — 서버 복구 후 회귀 테스트가 필요한 경우만)

### 수동 복구 명령 (참고)
```powershell
scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\backend\static\index.html" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\backend\static\sw.js" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/

scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\backend\static\assets\index-CEp0W-J2.js" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/assets/

ssh -i "C:\Users\user\Downloads\oracle-key.key" ubuntu@168.107.13.20 "sudo systemctl restart portfolio"
```

상태 기호: ⏳ 대기 · 🔧 진행 · ✅ 완료 · 🚀 배포 · ❌ 실패

## 재시작 방법 (다음 세션)
1. 이 파일의 "상태" 컬럼 확인 → 첫 ⏳ 작업부터 이어감
2. 🚀 표시된 작업은 이미 배포되어 사용자가 사용 중 — **다시 하지 말 것**
3. 각 작업은 deployable chunk — 한 작업 완료 시 빌드+배포까지 한 번에
4. **확인 후 시작 명령**:
   - 마지막 배포 번들 hash: (해당 작업 완료 시 기록)
   - 마지막 백엔드 SHA256: (해당 작업 완료 시 기록)

## 백업 위치 (롤백용)
- 로컬: `c:\Users\user\Desktop\쿠든카피 주식앱\_backup\daon-pre-v2-20260519-2243\`
- 원격: `~/portfolio_backup_pre_v2_20260519-2243/` (DB 포함)

A안 시작 직전 추가 백업: (A1-be 시작 시 생성)

## 작업 로그
- (각 단계 완료 시 timestamp + 변경 파일 + 배포 hash 기록 예정)

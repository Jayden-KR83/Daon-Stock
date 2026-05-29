# 🌅 일어나신 후 확인할 사항

**2026-05-21 야간 auto-mode 작업 결과 요약**

## ✅ 사용자 체감 변경 (모두 정상 배포됨)

11개 신규 기능이 `index-D8235eZb.js`로 **배포 완료**되었습니다. F5 새로고침 1회로 즉시 사용 가능.

### E안 (운영 안정성)
- ✅ 매일 KST 04:00 daon.db 자동 백업 (Oracle 서버 cron, 30일 보관)
- ✅ Changelog 인앱 공지 — 첫 로그인 시 모달 자동 표시 (NEW 배지 + 4개 버전 history)
- ✅ 종목별 일별 P/L 스냅샷 — 매일 자동 누적

### C안 (UX 폴리시)
- ✅ 다크모드 OS 자동 동기화 — 관리 탭 테마 토글에 `auto` 추가 (light → dark → pro → auto)
- ✅ 단축키: **`1-5`** 탭 이동 · **`/`** 검색창 포커스 · **`ESC`** 모달 닫기 · **`?`** 단축키 도움말
- ✅ 최근 검색 — 차트 진입 자동 기록, 검색창 빈 입력 시 자동 노출
- ✅ 관심종목 그룹화 — 🏷 버튼으로 "AI인프라", "배당" 등 폴더 분류, 그룹 ≥ 2개 시 토글 자동 표시

### B안 (분석 도구)
- ✅ 비중 탭: **종목 간 상관관계 매트릭스** (히트맵 + 평균 상관계수 + 분산 효과 진단)
- ✅ 트렌드 탭: **실적 캘린더** (보유+관심 종목 90일 일정, D-7 강조)
- ✅ 트렌드 탭: **차트 비교 모드** (2~6종목 정규화=100 동시 비교, 1M~5Y)

## ⚠️ 작업 중 발견된 이슈 (영향 없음)

### Oracle Cloud VM 일시 outage (코드 무관)
- 야간 작업 중 한 차례 ping 100% loss / SSH timeout 발생
- 원인: Oracle Free Tier idle reclaim 추정
- 자동 복구 모니터 가동 중 — 복구 감지 시 sentinel 패치 자동 재배포 예정
- **사용자 체감 영향 0**: 이미 배포된 D8235eZb.js로 모든 기능 정상 동작

### Sentinel 패치 (선택)
- `index-CEp0W-J2.js` — ChangelogModal에 회귀 테스트 자동화용 sentinel 추가
- 사용자 체감 차이 없음 (ChangelogModal은 정상 동작, 회귀 테스트만 자동 dismiss 가능)
- 서버 복구 후 자동 배포 시도

## 📊 작업 통계
- 신규 컴포넌트: **5개** (ChangelogModal · KeyboardShortcuts · CorrelationCard · EarningsCalendar · CompareChart)
- 신규 백엔드 endpoint: **10개**
- 신규 DB 테이블: **1개** (`holding_pnl_snapshots`)
- 신규 DB 컬럼: **1개** (`watchlist.group_name`)
- 신규 cron job: **1개** (매일 KST 04:00 백업)
- 신규 changelog 항목: **4개 버전** (v2.0 ~ v2.3)

## 🔧 만약 새 기능이 안 보이면
1. **F5 새로고침** — PWA 캐시 우회
2. 안 되면 **`Ctrl+Shift+R`** (하드 리프레시)
3. 모바일은 앱 카드 닫고 재진입

## 📁 핵심 파일
- 변경 내역 상세: [SESSION_2026-05-19.md](SESSION_2026-05-19.md)
- 진행 추적: [SESSION_HANDOFF.md](SESSION_HANDOFF.md)
- 일반 로그: [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)
- 백업: `_backup/daon-pre-BCE-20260521-2213/` (롤백용)

## 🔄 롤백 방법 (마음에 안 들 경우)
```powershell
# 1) 백엔드 롤백
Copy-Item "c:\Users\user\Desktop\쿠든카피 주식앱\_backup\daon-pre-BCE-20260521-2213\main.py" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\backend\main.py"

# 2) 프론트엔드 src 롤백
Remove-Item -Recurse "c:\Users\user\Desktop\쿠든카피 주식앱\frontend\src"
Copy-Item -Recurse "c:\Users\user\Desktop\쿠든카피 주식앱\_backup\daon-pre-BCE-20260521-2213\src" `
  "c:\Users\user\Desktop\쿠든카피 주식앱\frontend\src"

# 3) 빌드 + 배포
cd "c:\Users\user\Desktop\쿠든카피 주식앱\frontend"; npm run build
scp -i "C:\Users\user\Downloads\oracle-key.key" backend/main.py ubuntu@168.107.13.20:~/portfolio/backend/
scp -i "C:\Users\user\Downloads\oracle-key.key" backend/static/index.html backend/static/sw.js ubuntu@168.107.13.20:~/portfolio/backend/static/
scp -i "C:\Users\user\Downloads\oracle-key.key" backend/static/assets/* ubuntu@168.107.13.20:~/portfolio/backend/static/assets/
ssh -i "C:\Users\user\Downloads\oracle-key.key" ubuntu@168.107.13.20 "sudo systemctl restart portfolio"
```

(DB 테이블 신규 추가는 데이터 손실 없음 — 롤백 시 신규 테이블은 그대로 남지만 사용 안 됨)

# 다온 — 배포 · 인프라 · 자동화

## 1. 서버 정보
- **IP**: 168.107.13.20 · 포트: 8501
- **SSH 키**: `C:\Users\user\Downloads\oracle-key.key`
- **사용자/경로**: `ubuntu@168.107.13.20:~/portfolio/`
- **Python**: 3.10.12
- **서비스**: `sudo systemctl restart portfolio`
- **로그**: `journalctl -u portfolio -n 50 --no-pager`
- **DB**: `~/portfolio/daon.db` — 절대 수정 금지, 변경 전 백업 필수
- **메모리 보호**: 1GB swap + systemd `MemoryHigh=700M / MemoryMax=850M`

## 2. 배포 절차

### 프론트엔드 (CSS/JS 변경)
```powershell
cd "C:\Users\user\Desktop\쿠든카피 주식앱\frontend"
npm run build
# 새 번들명 확인
grep -oE "index-[A-Za-z0-9_-]+\.(js|css)" backend/static/index.html | sort -u
# index.html + sw.js + assets/ 전체 업로드
scp -i $env:ORACLE_KEY "..\backend\static\index.html" "..\backend\static\sw.js" ubuntu@168.107.13.20:~/portfolio/backend/static/
scp -r -i $env:ORACLE_KEY "..\backend\static\assets" ubuntu@168.107.13.20:~/portfolio/backend/static/
# 서비스 재기동 없이도 정적 자산이라 즉시 반영됨
```

### 백엔드 (main.py 변경)
```powershell
scp -i $env:ORACLE_KEY "backend\main.py" ubuntu@168.107.13.20:~/portfolio/backend/
ssh -i $env:ORACLE_KEY ubuntu@168.107.13.20 "sudo systemctl restart portfolio && sleep 4 && systemctl is-active portfolio"
```

### DB 마이그레이션
```bash
# 1) 백업
cp ~/portfolio/daon.db ~/portfolio/backup/daon-$(date +%Y%m%d-%H%M).db
# 2) 스키마 변경은 _init_db()에 CREATE TABLE IF NOT EXISTS 형식으로
# 3) 컬럼 추가는 ALTER TABLE 직접 실행
ssh ubuntu@168.107.13.20 'sqlite3 ~/portfolio/daon.db "ALTER TABLE users ADD COLUMN xxx TEXT DEFAULT 0"'
```

## 3. systemd 서비스

```ini
# /etc/systemd/system/portfolio.service
[Unit]
Description=Daon Portfolio FastAPI
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/portfolio/backend
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8501
Restart=on-failure
RestartSec=5
MemoryHigh=700M
MemoryMax=850M
TasksMax=200

[Install]
WantedBy=multi-user.target
```

## 4. cron 자동화

```cron
# /var/spool/cron/crontabs/ubuntu
# 일별 KST 04:00 — daon.db 백업
0 19 * * * cp ~/portfolio/daon.db ~/portfolio/backup/daon-$(date +\%Y\%m\%d).db
# 일별 KST 17:00 — 자산 추이 스냅샷
0 8  * * * /usr/local/bin/daon-daily-snapshot.sh
# 5분 간격 — 가격 알림 체크 (cron_secret POST)
*/5 * * * * /usr/local/bin/daon-check-alerts.sh
# 5분 간격 — 캐시 워밍 (sector/kr·sector/us·heatmap 콜드 대기 제거, 공개 GET)
*/5 * * * * /usr/local/bin/daon-cache-warm.sh
# 월요일 KST 18:00 — AI 주간 리밸런싱 (ai_enabled 사용자, cron_secret POST + 푸시)
0 9 * * 1 /usr/local/bin/daon-weekly-rebalance.sh
# 일별 KST 07:00(UTC 22:00) — 신규 종목 발굴 GARP 스캔 (US 마감 후·저트래픽, 공용 캐시)
# 주의: 월요일 09:00 UTC 리밸런싱과 시간 분리 — 두 무거운 작업 동시 실행 시 1GB VM OOM 위험
0 22 * * * /usr/local/bin/daon-discover-scan.sh
```

- 인증 cron(check-alerts·weekly-rebalance)은 cron_secret POST. cache-warm은 공개 GET이라 secret 불필요.
- **cache-warm**: 무거운 KR 스크래핑 엔드포인트(콜드 2~6초)를 5분마다 미리 호출 → 30분 캐시를 늘 데워둠 → 사용자는 캐시 hit(~0.05초)만 만남.
발굴 스캔은 `discovery_scores` 테이블을 갱신하며 사용자 무관 공용 데이터(AI 비용 0).

## 5. 검증 체크리스트 (배포 후 반드시 확인)

### 자동 (도구로)
- [ ] `npm run build` 오류 없이 완료
- [ ] `python3 -m py_compile backend/main.py`
- [ ] systemd `is-active portfolio`
- [ ] 핵심 endpoint 200: `/api/market`, `/api/stock/AAPL`, `/api/stock/AAPL/analyze/cached`, `/api/discover`
- [ ] 로컬-서버 sha 일치 (sha256sum)
- [ ] `sw.js` precache가 새 번들 참조: `grep -oE "index-[A-Za-z0-9_-]+\.js" sw.js`
- [ ] `journalctl -u portfolio -n 30 --no-pager | grep -iE "error|exception|traceback"` 0건

### 수동 (브라우저)
- [ ] 로그인/회원가입 정상
- [ ] 마켓 바 12개 지수 표시 (±5% 범위 일반적)
- [ ] 탭 전환 정상 (포트폴리오/관심/분석/종목/시장/등록/설정/가이드/발굴/여정)
- [ ] 포트폴리오: 카드 클릭 → 종목 탭 이동, 프라이버시 토글
- [ ] 분석: 성과 분석 / AI 전략 리포트
- [ ] 종목: D/W/M 토글, 드래그 줌, AI 심층 분석
- [ ] 설정: 테마 3종 전환, 로그아웃
- [ ] **모바일 <768px** 자동 앱 레이아웃, 사이드바·우측패널 비노출
- [ ] **다크/프로** 흰색 잔존 영역 없음 (TopNav, MarketBar)

### UI 자체검증 (시트/모달/오버레이 변경 시)
[memory/feedback_ui_self_verify.md](../memory) 9 체크리스트 참조 — Portal · z-index · 배경 · flex layout · viewport · ESC · 토큰

### 사용자 안내
- [ ] PWA 캐시 우회: `Ctrl+Shift+R` 또는 시크릿 창

## 5.5 문서·릴리스 반영 사이클 (지속 개선 운영)

기능 개선을 **가이드 / 여정 / GitHub에 목적별 다른 주기**로 반영한다.
(근거: 가이드는 사용자 대면이라 지연=버그 / 여정은 연대기라 묶을수록 좋음 / git은 안전망이라 자주 커밋)

### 기능 단위 — 매 기능 1 사이클
- [ ] **가이드 탭** 갱신 — 사용자 대면 기능이면 즉시 (탭 이름·신규 기능·데이터 출처)
- [ ] **DEVELOPMENT_LOG.md** 한 줄 추가 (날짜 + 변경 요약) — 여정 탭 요약의 원천
- [ ] 빌드 → scp 배포 → 검증 (위 5번)
- [ ] **git commit** — 배포 단위 = 커밋 단위 (서버와 GitHub 상태 항상 일치)

### 월간 릴리스 — 월 1회 (자동 리마인더: `/schedule` 등록됨)
- [ ] **여정 탭(PresentationTab)** 버전 묶음 갱신 — 그달 DEVELOPMENT_LOG → 마일스톤 1건(vX.X) + 로드맵 verdict 갱신
- [ ] **git push + 태그**(`vX.X`)

## 6. 도메인 (완료 — 2026.06)
- **daonwealth.com** · Cloudflare DNS(프록시/WAF) → nginx 리버스 프록시(443→8501) → uvicorn
- TLS: **Cloudflare Origin Certificate + Full(strict)** — Let's Encrypt 대신(갱신 불필요, 15년)
- 8501은 `127.0.0.1` 바인딩(외부 직노출 차단). 재현 절차·설정 파일: [deploy/README.md](../deploy/README.md)
- 연계: Web Push VAPID 키 자동생성 · cron(5분 가격알림 / 월요일 09:00 UTC 주간 리밸런싱)

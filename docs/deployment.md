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
# 5분 간격 — 가격 알림 체크
*/5 * * * * /usr/local/bin/daon-check-alerts.sh
```

각 스크립트는 cron_secret으로 인증된 POST 호출.

## 5. 검증 체크리스트 (배포 후 반드시 확인)

### 자동 (도구로)
- [ ] `npm run build` 오류 없이 완료
- [ ] `python3 -m py_compile backend/main.py`
- [ ] systemd `is-active portfolio`
- [ ] 핵심 endpoint 200: `/api/market`, `/api/stock/AAPL`, `/api/stock/AAPL/analyze/cached`
- [ ] 로컬-서버 sha 일치 (sha256sum)
- [ ] `sw.js` precache가 새 번들 참조: `grep -oE "index-[A-Za-z0-9_-]+\.js" sw.js`
- [ ] `journalctl -u portfolio -n 30 --no-pager | grep -iE "error|exception|traceback"` 0건

### 수동 (브라우저)
- [ ] 로그인/회원가입 정상
- [ ] 마켓 바 12개 지수 표시 (±5% 범위 일반적)
- [ ] 탭 전환 정상 (포트폴리오/관심/분석/종목/시장/등록/설정/가이드/여정)
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

## 6. 도메인 (계획)
- 옵션 3: 유료 도메인 + Cloudflare (보안 + 브랜드)
- 단계: ① 도메인 구매 (Namecheap) → ② Cloudflare DNS → ③ Oracle nginx + Let's Encrypt
- Cloudflare Access (무료티어)로 SSO/2FA 적용 가능

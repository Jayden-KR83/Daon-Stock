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
# 일별 KST 04:00 — daon.db 백업 (tar.gz → 공개키 암호화, 30일 보관)
0 19 * * * /home/ubuntu/daon-backup.sh >> /home/ubuntu/portfolio_backups/cron.log 2>&1
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
0 21 * * 0 /usr/local/bin/daon-weekly-refresh.sh   # 월 06:00 KST — 전략 리포트 + 종목 분석 주간 갱신
```

> **보유 종목 AI 분석 갱신은 서버 cron 이 아니다 (2026-08-20 변경).**
> 이 작업은 종량제 API 를 쓰면 월 $79 수준이라, **오너 PC 의 Windows 작업 스케줄러 +
> Claude Code 구독**으로 옮겼다(한계비용 0). 스크립트는 `scripts/daily-analysis.ps1`,
> 등록 명령은 그 파일 하단 주석에 있다. 서버 cron `daon-refresh-holdings.sh` 는 삭제됨.
> 되돌리려면 `/api/cron/refresh_holdings_analysis` 엔드포인트가 그대로 살아 있으므로
> 스크립트만 다시 만들면 된다.

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

## 8. 2026-09-23 — "앱이 2분째 안 뜬다"의 원인: MTU 9000 (인프라)

증상만 보면 앱이 느린 것 같지만 **앱은 3ms 였다.** 같은 요청이
서버 내부 0.003s / 오리진 직접 0.03s / **Cloudflare 경유 0.2~60s**.

- 오리진이 응답을 끝낸 시각(nginx 로그)과 클라이언트가 첫 바이트를 받은 시각이 9초 차이 났다
  → 지연은 서버 바깥.
- `ss -ti` 로 실제 CF 연결: **보낸 54KB 중 17.6KB(33%) 재전송**, cwnd 4 로 붕괴.
- 그런데 서버가 **직접 연** 연결은 멀쩡: CF 에서 5MB 내려받기 18MB/s, 3MB 올리기 5MB/s, 재전송 0.
- `ping -M do` 이진 탐색: payload 1472 통과 / 1492 실패 → **경로 MTU 1500**,
  인터페이스는 OCI 기본 **9000**. 서버가 상대에게 advmss 8948 을 광고하고 있었다.

**조치(2026-09-23)**
- `ip link set ens3 mtu 1500` → 최악 30s → 1.7s. 재부팅 대비 `daon-mtu.service`(oneshot)로 고정.
  netplan 을 직접 고치지 않은 이유는 적용 중 네트워크 단절 위험 때문이다.
- `net.ipv4.tcp_mtu_probing=1` (`/etc/sysctl.d/99-daon-mtu.conf`) — 블랙홀 재발 시 자동 축소.
- 앱 재시작: RSS 445MB + **스왑 985MB** → 97MB / 스왑 0.

**남은 것** — MTU 수정 뒤에도 CF 연결에 재전송 14~44% 가 남아 있고 2~5초 스파이크가 가끔 난다.
서버가 **밖으로 여는** 연결은 손실이 0 이므로, 근본 해결책은 Cloudflare Tunnel(cloudflared)로
인바운드 경로 자체를 없애는 것이다. 오너 결정 대기.

**교훈** — "앱이 느리다"는 신고에서 앱을 먼저 의심하지 않는다. 같은 요청을
**로컬 / 오리진 직접 / 공개 경로** 세 지점에서 재면 어느 구간인지 한 번에 갈린다.

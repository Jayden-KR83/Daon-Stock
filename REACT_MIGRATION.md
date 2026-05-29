# React + FastAPI 마이그레이션 가이드

## 1단계 — 로컬 개발 환경 세팅

### Node.js 설치 (최초 1회)
https://nodejs.org → LTS 버전 설치

### 로컬 실행

```powershell
# 터미널 1 — FastAPI 백엔드
cd "C:\Users\user\Desktop\쿠든카피 주식앱\backend"
pip install -r requirements.txt
python main.py
# → http://localhost:8000/docs (API 문서 자동 생성)

# 터미널 2 — React 프론트엔드
cd "C:\Users\user\Desktop\쿠든카피 주식앱\frontend"
npm install
npm run dev
# → http://localhost:3000
```

---

## 2단계 — 서버 배포 (Oracle Cloud)

### 2-1. 파일 업로드

```powershell
# backend 업로드
scp -i "C:\Users\user\Downloads\oracle-key.key" -r "C:\Users\user\Desktop\쿠든카피 주식앱\backend" ubuntu@168.107.13.20:~/

# frontend 빌드
cd "C:\Users\user\Desktop\쿠든카피 주식앱\frontend"
npm run build
# → backend/static/ 폴더에 빌드 결과물 생성

# static 폴더 포함해서 다시 업로드
scp -i "C:\Users\user\Downloads\oracle-key.key" -r "C:\Users\user\Desktop\쿠든카피 주식앱\backend" ubuntu@168.107.13.20:~/
```

### 2-2. 서버 의존성 설치

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" ubuntu@168.107.13.20

cd ~/backend
pip install -r requirements.txt
```

### 2-3. FastAPI가 static 파일 서빙하도록 main.py 업데이트

서버에서 아래 명령 실행:
```bash
# main.py에 static 파일 서빙 추가
# (아래 내용은 배포 시 자동 적용됨 — Claude Code가 처리)
```

### 2-4. systemd 서비스 등록

```bash
sudo nano /etc/systemd/system/daon.service
```

```ini
[Unit]
Description=다온 포트폴리오 FastAPI
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/backend
ExecStart=/home/ubuntu/.local/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable daon
sudo systemctl start daon
sudo systemctl status daon
```

### 2-5. Nginx 설정 (포트 80 → React 앱)

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/daon
```

```nginx
server {
    listen 80;
    server_name 168.107.13.20;

    # React 앱 (빌드 파일)
    root /home/ubuntu/backend/static;
    index index.html;

    # SPA 라우팅
    location / {
        try_files $uri $uri/ /index.html;
    }

    # FastAPI API 프록시
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/daon /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 2-6. 방화벽 포트 개방

```bash
# Oracle Cloud 보안 그룹에서 80 포트 추가 (이미 8501이 열려있으면 동일하게)
sudo ufw allow 80/tcp
sudo ufw allow 8000/tcp
```

---

## 접속 주소

| 환경 | 주소 |
|------|------|
| 로컬 개발 | http://localhost:3000 |
| API 문서 | http://localhost:8000/docs |
| 서버 (배포 후) | http://168.107.13.20 (포트 80) |

---

## 현재 파일 구조

```
쿠든카피 주식앱/
├── backend/
│   ├── main.py          ← FastAPI 앱 (모든 데이터 API)
│   ├── requirements.txt ← Python 의존성
│   └── static/          ← React 빌드 결과 (npm run build 후 생성)
├── frontend/
│   ├── src/
│   │   ├── main.jsx       ← 진입점
│   │   ├── App.jsx        ← 탭 라우팅
│   │   ├── api.js         ← API 클라이언트
│   │   ├── store.js       ← Zustand 상태 관리
│   │   ├── components/    ← MarketBar, BottomNav, LogoCircle, Sparkline
│   │   └── tabs/          ← 보유/관심/탐색/비중/차트/트렌드/추가/관리
│   ├── package.json
│   └── vite.config.js
├── portfolio.py         ← 기존 Streamlit (유지)
└── portfolio_data.json  ← 공유 데이터 파일
```

---

## Phase 3 — 추후 개선 가능 항목

- [ ] PWA 설정 (홈화면 설치, 오프라인 지원)
- [ ] 실시간 WebSocket 시세
- [ ] 엑셀 업로드/다운로드 (FastAPI multipart)
- [ ] 비중탭 상세 분석 (섹터별 리스크 인사이트)
- [ ] SSL (Let's Encrypt + certbot)
- [ ] 도메인 연결

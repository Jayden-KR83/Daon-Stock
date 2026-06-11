# 다온 도메인 연결 (daonwealth.com)

Cloudflare(프록시) → nginx(Origin Cert, TLS 종료) → uvicorn 127.0.0.1:8501

## 실행 순서

### 1. Cloudflare (브라우저)
- **DNS Records**: `A @ → 168.107.13.20` (Proxied 🟧), `CNAME www → daonwealth.com` (Proxied 🟧)
- **SSL/TLS → Origin Server → Create Certificate** → cert/key 본문 복사 (다음 단계에서 서버에 저장)

### 2. OCI 콘솔
- VCN → Security List → **Ingress 규칙에 TCP 80, 443 추가**

### 3. 서버 (SSH 접속 후 — 사용자가 실행)
```bash
# (a) Origin 인증서 저장
sudo mkdir -p /etc/ssl/daon
sudo nano /etc/ssl/daon/cert.pem   # Cloudflare cert 붙여넣기
sudo nano /etc/ssl/daon/key.pem    # Cloudflare key 붙여넣기

# (b) deploy/ 폴더를 서버로 업로드 (로컬 PowerShell)
#   scp -i $env:ORACLE_KEY -r deploy ubuntu@168.107.13.20:~/portfolio/

# (c) 스크립트 실행
cd ~/portfolio/deploy
bash setup-domain.sh

# (d) systemd 갱신 (8501 외부 직노출 차단 + proxy headers)
sudo cp portfolio.service /etc/systemd/system/portfolio.service
sudo systemctl daemon-reload && sudo systemctl restart portfolio
```

### 4. Cloudflare 마무리
- **SSL/TLS 모드 → Full (strict)**
- (선택) **Always Use HTTPS** ON, **Automatic HTTPS Rewrites** ON

### 5. 검증
- `https://daonwealth.com` → 자물쇠 ✅ → 로그인 → 탭 전환 정상
- `https://www.daonwealth.com` → 루트로 정상 동작
- 정상 확인 후 **OCI Security List·iptables의 8501 외부 개방 제거** (있다면)

## 주의
- 인증은 Bearer 토큰(헤더) 방식 → 쿠키/CORS 추가 변경 불필요
- HSTS는 HTTPS 완전 동작 확인 후에만 유지 (nginx-daon.conf에 이미 포함)
- 서버 접속은 사용자가 직접 (Claude는 SSH 차단) — 위 명령 그대로 사용

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 다온 — daonwealth.com 도메인 연결 (Oracle Ubuntu 서버에서 실행)
# 사전 준비:
#   1) Cloudflare DNS: A @ → 168.107.13.20 (Proxied), CNAME www → @ (Proxied)
#   2) Cloudflare SSL/TLS → Origin Server → Create Certificate
#      → 발급된 cert / key 본문을 아래 두 파일로 저장
#         /etc/ssl/daon/cert.pem
#         /etc/ssl/daon/key.pem
#   3) OCI 콘솔 → VCN → Security List → Ingress: TCP 80, 443 추가
# 실행:  bash setup-domain.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> [1/5] nginx 설치"
sudo apt-get update -y
sudo apt-get install -y nginx

echo "==> [2/5] 서버 방화벽(iptables) 80/443 개방"
sudo iptables -C INPUT -m state --state NEW -p tcp --dport 80  -j ACCEPT 2>/dev/null || \
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -C INPUT -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || \
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || sudo iptables-save | sudo tee /etc/iptables/rules.v4 >/dev/null

echo "==> [3/5] Origin 인증서 존재 확인"
if [[ ! -f /etc/ssl/daon/cert.pem || ! -f /etc/ssl/daon/key.pem ]]; then
  echo "!! /etc/ssl/daon/cert.pem 또는 key.pem 이 없습니다."
  echo "   Cloudflare Origin Certificate를 먼저 저장한 뒤 다시 실행하세요."
  echo "   sudo mkdir -p /etc/ssl/daon && sudo nano /etc/ssl/daon/cert.pem (와 key.pem)"
  exit 1
fi
sudo chmod 600 /etc/ssl/daon/key.pem

echo "==> [4/5] nginx 사이트 설정 적용"
# nginx-daon.conf 가 이 스크립트와 같은 디렉터리에 있다고 가정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo cp "$SCRIPT_DIR/nginx-daon.conf" /etc/nginx/sites-available/daon
sudo ln -sf /etc/nginx/sites-available/daon /etc/nginx/sites-enabled/daon
sudo rm -f /etc/nginx/sites-enabled/default   # 기본 사이트 비활성화
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "==> [5/5] 검증"
echo "-- 로컬 origin (인증서 검증 생략):"
curl -skI https://daonwealth.com/api/market --resolve daonwealth.com:443:127.0.0.1 | head -n 3 || true
echo ""
echo "완료. 이제:"
echo "  • Cloudflare → SSL/TLS → 모드를 'Full (strict)' 로 변경"
echo "  • 브라우저에서 https://daonwealth.com 접속 → 자물쇠 확인 → 로그인 테스트"
echo "  • 정상 확인 후 OCI Security List / iptables 에서 8501 외부 개방 제거(있다면)"

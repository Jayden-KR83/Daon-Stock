# Oracle Cloud 무료 배포 가이드

## 무료 티어 스펙 (Always Free)

| 리소스 | 사양 |
|--------|------|
| VM | Ampere A1 (ARM) 4코어 24GB 또는 AMD E2.1.Micro 1코어 1GB |
| 스토리지 | 200GB 블록볼륨 |
| 네트워크 | 공인 IP 1개, 월 10TB 아웃바운드 |
| OS | Ubuntu 22.04 LTS (권장) |

> **권장**: AMD E2.1.Micro — Streamlit 단일 앱 배포에 충분, 항상 무료 보장

---

## 1. VM 인스턴스 생성

### OCI 콘솔 절차
1. Compute → Instances → Create Instance
2. Image: **Canonical Ubuntu 22.04**
3. Shape: **VM.Standard.E2.1.Micro** (Always Free)
4. 네트워크: 기본 VCN 사용, 공인 IP 할당 체크
5. SSH 키: 기존 키 업로드 또는 새로 생성 후 `.pem` 다운로드
6. Create 클릭 → Provisioning 완료까지 약 1~2분 대기

### SSH 접속
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<공인-IP>
```

---

## 2. 서버 초기 세팅

```bash
# 패키지 업데이트
sudo apt update && sudo apt upgrade -y

# Python 및 pip
sudo apt install -y python3-pip python3-venv git

# 작업 디렉토리 생성
mkdir ~/app && cd ~/app
```

### 가상환경 사용 (권장)
```bash
python3 -m venv venv
source venv/bin/activate

pip install streamlit yfinance pandas plotly \
            requests beautifulsoup4 openpyxl
```

---

## 3. 앱 파일 배포

### 방법 A — scp 복사
```bash
# 로컬 → 서버
scp -i your-key.pem portfolio.py ubuntu@<공인-IP>:~/app/
scp -i your-key.pem portfolio_data.json ubuntu@<공인-IP>:~/app/
```

### 방법 B — git clone
```bash
cd ~/app
git clone https://github.com/yourname/portfolio.git .
```

---

## 4. 방화벽 설정

### iptables (OS 방화벽)
```bash
# 포트 8501 허용
sudo iptables -I INPUT 6 -m state --state NEW \
  -p tcp --dport 8501 -j ACCEPT

# 재부팅 후에도 유지
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

### OCI Security List (콘솔)
1. Networking → Virtual Cloud Networks → VCN → Security Lists
2. Default Security List → Add Ingress Rules
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: TCP
   - Destination Port Range: `8501`
3. Save Changes

> iptables와 Security List **둘 다** 설정해야 외부 접속 가능

---

## 5. 앱 실행

### 임시 실행 (테스트용)
```bash
cd ~/app
source venv/bin/activate
streamlit run portfolio.py \
  --server.port 8501 \
  --server.address 0.0.0.0 \
  --server.headless true
```
접속: `http://<공인-IP>:8501`

### 백그라운드 실행 (nohup)
```bash
nohup streamlit run portfolio.py \
  --server.port 8501 \
  --server.address 0.0.0.0 \
  --server.headless true \
  > ~/app/streamlit.log 2>&1 &

echo $! > ~/app/streamlit.pid   # PID 저장
```

### 프로세스 확인 및 종료
```bash
cat ~/app/streamlit.pid         # PID 확인
kill $(cat ~/app/streamlit.pid) # 종료
ps aux | grep streamlit         # 실행 중인지 확인
```

---

## 6. systemd 서비스 등록 (재부팅 자동 시작)

### 서비스 파일 생성
```bash
sudo nano /etc/systemd/system/portfolio.service
```

```ini
[Unit]
Description=Streamlit Portfolio App
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/app
Environment="PATH=/home/ubuntu/app/venv/bin"
ExecStart=/home/ubuntu/app/venv/bin/streamlit run portfolio.py \
          --server.port 8501 \
          --server.address 0.0.0.0 \
          --server.headless true
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 서비스 등록 및 시작
```bash
sudo systemctl daemon-reload
sudo systemctl enable portfolio    # 부팅 시 자동 시작
sudo systemctl start portfolio
sudo systemctl status portfolio    # 상태 확인
```

### 서비스 관리 명령어
```bash
sudo systemctl stop portfolio      # 중지
sudo systemctl restart portfolio   # 재시작
journalctl -u portfolio -f         # 실시간 로그
journalctl -u portfolio --since "1 hour ago"  # 최근 1시간 로그
```

---

## 7. 데이터 파일 영속성

### portfolio_data.json 경로 고정
```python
# portfolio.py — 절대 경로 사용 권장
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "portfolio_data.json")
```

### 백업 자동화 (cron)
```bash
crontab -e
# 매일 새벽 3시 백업
0 3 * * * cp ~/app/portfolio_data.json ~/app/backup/portfolio_data_$(date +\%Y\%m\%d).json
```

---

## 8. 트러블슈팅

### 외부 접속 불가
```bash
# 1. 앱이 0.0.0.0으로 리슨 중인지 확인
ss -tlnp | grep 8501
# 출력 예: LISTEN 0 ... 0.0.0.0:8501

# 2. iptables 규칙 확인
sudo iptables -L INPUT -n --line-numbers | grep 8501

# 3. OCI Security List 확인 (콘솔에서 직접 확인 필요)
```

### 앱이 재부팅 후 안 켜짐
```bash
# systemd 서비스 상태 확인
sudo systemctl status portfolio

# 가상환경 경로가 서비스 파일과 일치하는지 확인
which streamlit   # venv 활성화 후 실행
```

### 메모리 부족 (E2.1.Micro 1GB)
```bash
# 스왑 추가 (512MB)
sudo fallocate -l 512M /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 로그 확인
```bash
tail -f ~/app/streamlit.log          # nohup 로그
journalctl -u portfolio -n 50        # systemd 로그 최근 50줄
```

### 포트 변경 시
```bash
# 8501 → 다른 포트로 변경할 경우
# 1. iptables 규칙 수정
# 2. OCI Security List 수정
# 3. streamlit 실행 명령 --server.port 변경
# 4. systemd 서비스 파일 수정 후 daemon-reload + restart
```

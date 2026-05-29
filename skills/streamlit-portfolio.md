# Streamlit 포트폴리오 앱 제작 스킬

## 전체 기술 스택

| 레이어 | 라이브러리 | 용도 |
|--------|-----------|------|
| UI 프레임워크 | `streamlit` | 웹 앱 렌더링, 탭/컬럼 레이아웃, 위젯 |
| 미국 주식 | `yfinance` | 가격, 재무지표, 히스토리 조회 |
| 한국 주식 | `requests` + `beautifulsoup4` | 네이버 금융 스크래핑 |
| 차트 | `plotly` (graph_objects, express) | 인터랙티브 캔들/라인/파이/바 차트 |
| 데이터 처리 | `pandas` | DataFrame, 엑셀 I/O |
| 엑셀 엔진 | `openpyxl` | xlsx 읽기/쓰기 |
| 영속성 | `json` + 로컬 파일 | 포트폴리오 데이터 저장 |
| 환경 | Python 3.10+, Oracle Cloud VM |

### requirements.txt 핵심
```
streamlit
yfinance
pandas
plotly
requests
beautifulsoup4
openpyxl
```

---

## 미국 주식 데이터 조회 (yfinance)

### 기본 패턴
```python
import yfinance as yf

@st.cache_data(ttl=60)          # 60초 캐시 — API 호출 최소화
def get_us_stock_data(ticker):
    stock = yf.Ticker(ticker)
    hist = stock.history(period="1y")   # 1년 일봉
    info = stock.info                   # 재무 메타데이터

    if hist.empty:                      # 잘못된 티커 방어
        return None

    current = hist['Close'].iloc[-1]
    prev    = hist['Close'].iloc[-2] if len(hist) > 1 else current
```

### 기술적 지표 계산
```python
# 이동평균선
hist['MA20'] = hist['Close'].rolling(20).mean()
hist['MA60'] = hist['Close'].rolling(60).mean()

# RSI (14일)
delta = hist['Close'].diff()
gain  = delta.where(delta > 0, 0).rolling(14).mean()
loss  = (-delta.where(delta < 0, 0)).rolling(14).mean()
hist['RSI'] = 100 - (100 / (1 + (gain / loss)))
```

### USD/KRW 환율 조회
```python
@st.cache_data(ttl=3600)        # 1시간 캐시
def get_usd_krw_rate():
    try:
        return yf.Ticker("KRW=X").history(period="1d")['Close'].iloc[-1]
    except:
        return 1300.0           # 조회 실패 시 fallback 값
```

### info 주요 키
| 키 | 설명 |
|----|------|
| `previousClose` | 전일 종가 |
| `open` | 개장가 |
| `dayHigh` / `dayLow` | 당일 고/저가 |
| `volume` | 거래량 |
| `marketCap` | 시가총액 |
| `trailingPE` | PER |
| `sector` | 섹터 |

---

## 한국 주식 데이터 조회 (네이버 금융 스크래핑)

### 기본 패턴
```python
import requests
from bs4 import BeautifulSoup

@st.cache_data(ttl=60)
def get_kr_stock_data(ticker):   # ticker = 6자리 종목코드 (예: '005930')
    url = f"https://finance.naver.com/item/main.nhn?code={ticker}"
    resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    soup = BeautifulSoup(resp.text, 'html.parser')

    price_el = soup.select_one('.no_today .blind')
    if not price_el:
        return None
    current = int(price_el.text.replace(',', ''))

    change_el = soup.select_one('.no_exday .blind')
    change = int(change_el.text.replace(',', '')) if change_el else 0
    prev = current - change

    return {
        'current_price': current,
        'change': change,
        'change_pct': (change / prev * 100) if prev > 0 else 0
    }
```

### 주의사항
- **User-Agent 필수**: 없으면 403 또는 빈 HTML 반환
- 셀렉터(`.no_today .blind`)는 네이버 금융 마크업 변경 시 깨질 수 있음 → try/except로 방어
- yfinance는 한국 주식에 `.KS` / `.KQ` 접미사를 붙여 조회 가능하지만 실시간성이 낮아 스크래핑 권장

---

## Plotly 차트

### 미니 스파크라인 (보유 목록용)
```python
fig = go.Figure()
fig.add_trace(go.Scatter(
    x=hist.index, y=hist['Close'],
    mode='lines',
    line=dict(color='#10B981', width=1),
    fill='tozeroy',
    fillcolor='rgba(16,185,129,0.1)',
    showlegend=False
))
fig.update_layout(
    height=60,
    margin=dict(l=0, r=0, t=0, b=0),
    xaxis=dict(visible=False),
    yaxis=dict(visible=False),
    plot_bgcolor='rgba(0,0,0,0)',
    paper_bgcolor='rgba(0,0,0,0)'
)
st.plotly_chart(fig, width='stretch', config={'displayModeBar': False})
```

### 캔들스틱 + 이동평균선
```python
fig = go.Figure()
fig.add_trace(go.Candlestick(
    x=hist.index,
    open=hist['Open'], high=hist['High'],
    low=hist['Low'],   close=hist['Close'],
    name='가격'
))
fig.add_trace(go.Scatter(x=hist.index, y=hist['MA20'], mode='lines', name='20일선'))
fig.add_trace(go.Scatter(x=hist.index, y=hist['MA60'], mode='lines', name='60일선'))
fig.update_layout(height=500, xaxis_rangeslider_visible=True)
st.plotly_chart(fig, width='stretch', config={'scrollZoom': True})
```

### RSI 차트 (수평선 포함)
```python
fig = go.Figure()
fig.add_trace(go.Scatter(x=hist.index, y=hist['RSI'], mode='lines', name='RSI'))
fig.add_hline(y=70, line_dash="dash", line_color="red")    # 과매수
fig.add_hline(y=30, line_dash="dash", line_color="green")  # 과매도
fig.update_layout(height=200, yaxis=dict(range=[0, 100]))
st.plotly_chart(fig, width='stretch')
```

### 파이 차트 (비중 분석)
```python
df = pd.DataFrame(list(acc_data.items()), columns=['계좌', '금액'])
fig = px.pie(df, values='금액', names='계좌', title='계좌별 자산 비중')
st.plotly_chart(fig, width='stretch')
```

---

## DataFrame 에러 방지

### 핵심 방어 패턴

```python
# 1. 빈 히스토리 체크 — yfinance에서 잘못된 티커 또는 비상장 종목
if hist.empty:
    return None

# 2. 데이터 길이 체크 — iloc[-2] 접근 전 반드시 확인
prev = hist['Close'].iloc[-2] if len(hist) > 1 else current

# 3. 0 나누기 방어 — 수익률 계산 시
profit_rate = ((cur - inv) / inv * 100) if inv > 0 else 0
change_pct  = (change / prev * 100)     if prev > 0 else 0

# 4. rolling 결과의 NaN — 충분한 데이터가 없을 때 NaN 발생
# Plotly는 NaN을 자동으로 갭 처리 → 대부분 별도 처리 불필요
# 단, 숫자 계산에 쓸 경우 .fillna(0) 또는 .dropna() 사용

# 5. select_one 결과 None 체크 — BS4 스크래핑
price_el = soup.select_one('.no_today .blind')
if not price_el:
    return None

# 6. 전체 함수를 try/except로 감싸기 — 네트워크 오류 방어
@st.cache_data(ttl=60)
def get_us_stock_data(ticker):
    try:
        ...
        return {...}
    except:
        return None         # None 반환 → 호출부에서 if data: 체크
```

### st.session_state 초기화 패턴
```python
# 앱 첫 로드 시에만 실행 — 리런마다 초기화되지 않도록
if 'portfolios' not in st.session_state:
    loaded = load_portfolio()
    st.session_state.portfolios = loaded if loaded else {
        'US': [], 'KR_RETIRE': [], 'KR_PERSONAL': []
    }
```

---

## 엑셀 업로드/다운로드

### 템플릿 다운로드
```python
from io import BytesIO
import pandas as pd

template = pd.DataFrame({
    '계좌명':   ['US',   'KR_RETIRE'],
    '종목코드': ['AAPL', '005930'],
    '종목명':   ['Apple','삼성전자'],
    '섹터':     ['Technology','Technology'],
    '보유수량': [10,    100],
    '평균단가': [150.0, 70000],
})

out = BytesIO()
with pd.ExcelWriter(out, engine='openpyxl') as w:
    template.to_excel(w, index=False)   # 인덱스 열 제외

st.download_button(
    label="📥 템플릿 다운로드",
    data=out.getvalue(),
    file_name="template.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)
```

### 엑셀 업로드 → 파싱
```python
up = st.file_uploader("엑셀 업로드", type=['xlsx'])
if up is not None:
    try:
        df = pd.read_excel(up)
        for _, row in df.iterrows():
            acc = str(row['계좌명'])
            if acc in st.session_state.portfolios:  # 유효한 계좌명인지 검증
                st.session_state.portfolios[acc].append({
                    'ticker':    str(row['종목코드']),
                    'name':      str(row['종목명']),
                    'quantity':  float(row['보유수량']),
                    'avg_price': float(row['평균단가']),
                    'sector':    str(row['섹터']),
                })
        save_portfolio()
        st.rerun()
    except Exception as e:
        st.error(f"오류: {e}")
```

### 주의사항
- `pd.ExcelWriter`는 **컨텍스트 매니저** 안에서만 파일이 올바르게 닫힘
- `BytesIO`를 쓸 때 `.getvalue()`는 `with` 블록 **밖**에서 호출
- 숫자 컬럼은 `float()` 변환 필수 — 엑셀 셀이 문자열일 수 있음

---

## Oracle Cloud 배포

### VM 환경 준비 (Ubuntu 22.04)
```bash
# Python 및 pip 업데이트
sudo apt update && sudo apt install -y python3-pip

# 의존성 설치
pip3 install streamlit yfinance pandas plotly requests beautifulsoup4 openpyxl

# 방화벽 — 포트 8501 오픈 (OCI 콘솔 Security List에서도 설정 필요)
sudo iptables -I INPUT -p tcp --dport 8501 -j ACCEPT
```

### 앱 실행 (백그라운드)
```bash
# nohup으로 SSH 끊어도 유지
nohup streamlit run portfolio.py \
  --server.port 8501 \
  --server.address 0.0.0.0 \
  --server.headless true \
  > streamlit.log 2>&1 &

echo $! > streamlit.pid    # PID 저장 (나중에 kill 용)
```

### systemd 서비스 등록 (재부팅 자동 시작)
```ini
# /etc/systemd/system/portfolio.service
[Unit]
Description=Streamlit Portfolio App
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/portfolio
ExecStart=/home/ubuntu/.local/bin/streamlit run portfolio.py \
          --server.port 8501 --server.address 0.0.0.0 --server.headless true
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable portfolio
sudo systemctl start portfolio
sudo systemctl status portfolio
```

### OCI 보안 설정 체크리스트
- [ ] Ingress Rule: TCP 8501, Source 0.0.0.0/0
- [ ] iptables 규칙 저장: `sudo netfilter-persistent save`
- [ ] 공인 IP 확인: OCI 콘솔 → Instance → Public IP

---

## 트러블슈팅

### 1. `yfinance` 데이터 조회 실패
| 증상 | 원인 | 해결 |
|------|------|------|
| `hist.empty == True` | 잘못된 티커 또는 상장폐지 | 티커 대문자 확인, `.` 접미사 제거 |
| `KeyError: 'Close'` | 빈 DataFrame에 컬럼 접근 | `if hist.empty: return None` 방어 |
| 속도 느림 | 매 리런마다 API 호출 | `@st.cache_data(ttl=60)` 적용 |

### 2. 네이버 금융 스크래핑 실패
| 증상 | 원인 | 해결 |
|------|------|------|
| `NoneType` 오류 | 셀렉터 미매칭 | 개발자도구로 현재 HTML 구조 재확인 |
| 403 에러 | User-Agent 없음 | `headers={'User-Agent': 'Mozilla/5.0'}` 추가 |
| 인코딩 오류 | EUC-KR 페이지 | `response.encoding = 'euc-kr'` 명시 |

### 3. Streamlit 렌더링 이슈
```python
# 문제: st.plotly_chart() 너비가 고정됨
# 해결: use_container_width 대신 width='stretch' (Streamlit 1.x)
st.plotly_chart(fig, width='stretch')

# 문제: 버튼 클릭 후 상태가 즉시 반영 안 됨
# 해결: save 후 st.rerun() 호출
save_portfolio()
st.rerun()

# 문제: 같은 키 위젯 중복 오류
# 해결: 루프 안 위젯에 고유 key 부여
st.button("🗑️", key=f"del_{acc}_{idx}")
```

### 4. 엑셀 파싱 오류
```python
# 문제: 숫자 컬럼이 object 타입으로 읽힘
float(row['보유수량'])   # 명시적 형변환

# 문제: NaN 행 포함
df = pd.read_excel(up).dropna(subset=['종목코드'])   # 필수 컬럼 기준 NaN 제거

# 문제: openpyxl 없음
# 해결: pip install openpyxl
```

### 5. Oracle Cloud 배포 오류
```bash
# 포트 연결 안 됨 → iptables 규칙 확인
sudo iptables -L INPUT -n | grep 8501

# 앱이 로컬호스트만 리슨 → address 0.0.0.0 필수
streamlit run portfolio.py --server.address 0.0.0.0

# 로그 확인
tail -f streamlit.log
journalctl -u portfolio -f    # systemd 사용 시
```

### 6. 성능 최적화 캐시 전략
```python
@st.cache_data(ttl=3600)   # 환율 — 1시간
def get_usd_krw_rate(): ...

@st.cache_data(ttl=60)    # 주가 — 1분
def get_us_stock_data(ticker): ...

@st.cache_data(ttl=60)
def get_kr_stock_data(ticker): ...
```
- `@st.cache_data`는 함수 인수가 같으면 캐시 히트 → 동일 종목 여러 번 조회해도 API 1회만 호출
- `ttl` 초과 시 자동 만료 및 재조회

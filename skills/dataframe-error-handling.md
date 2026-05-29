# DataFrame 에러 처리 가이드

## 에러 유형 분류

| 유형 | 발생 상황 | 핵심 방어 |
|------|-----------|-----------|
| 빈 DataFrame | 잘못된 티커, 네트워크 오류 | `if df.empty` 체크 |
| IndexError | `iloc[-1]`, `iloc[-2]` 접근 | `len(df) > n` 체크 |
| KeyError | 없는 컬럼 접근 | `'col' in df.columns` 또는 `.get()` |
| ZeroDivisionError | 수익률, 변화율 계산 | `if denominator != 0` 조건 |
| NaN 전파 | rolling, diff 연산 결과 | `.fillna()`, `.dropna()` |
| TypeError | 숫자/문자 혼재 | `pd.to_numeric()`, `float()` 변환 |

---

## 1. 빈 DataFrame 체크

```python
import yfinance as yf

def get_stock_data(ticker):
    hist = yf.Ticker(ticker).history(period="1y")

    # 반드시 컬럼 접근 전에 체크
    if hist.empty:
        return None

    current = hist['Close'].iloc[-1]
    return current
```

### 호출부 패턴
```python
data = get_stock_data('INVALID')
if data is None:
    st.warning("데이터를 불러올 수 없습니다.")
else:
    st.write(data)
```

---

## 2. iloc 인덱스 에러 방지

```python
# 위험 — 데이터가 1개 이하면 IndexError
prev = hist['Close'].iloc[-2]

# 안전 — 길이 확인 후 접근
prev = hist['Close'].iloc[-2] if len(hist) > 1 else hist['Close'].iloc[-1]

# 여러 행이 필요한 경우
if len(hist) >= 20:
    ma20 = hist['Close'].rolling(20).mean()
else:
    ma20 = pd.Series([float('nan')] * len(hist))
```

### tail/head와 함께 사용
```python
# tail(n)은 데이터가 n개 미만이어도 에러 없이 있는 만큼 반환
recent = hist.tail(252)   # 252개 미만이면 있는 것만 반환
```

---

## 3. KeyError — 컬럼 존재 확인

```python
# 방법 1: in 연산자
if 'Close' in hist.columns:
    current = hist['Close'].iloc[-1]

# 방법 2: .get() — Series/dict 모두 동일
value = info.get('trailingPE', 0)    # 없으면 기본값 0 반환
sector = info.get('sector', 'N/A')

# 방법 3: .reindex() — 없는 컬럼은 NaN으로 채움
df = df.reindex(columns=['Close', 'Open', 'Volume'])

# 방법 4: try/except (외부 API 응답처럼 구조가 불확실할 때)
try:
    market_cap = info['marketCap']
except KeyError:
    market_cap = 0
```

---

## 4. 0 나누기 방지

```python
# 수익률
profit_rate = ((current - avg) / avg * 100) if avg != 0 else 0.0

# 변화율 (주가)
change_pct = (change / prev * 100) if prev > 0 else 0.0

# 비중 계산
weight = (value / total * 100) if total > 0 else 0.0

# pandas Series에서 0 나누기
# replace(0, nan)으로 처리하면 NaN으로 안전하게 변환
pct = series / series.replace(0, float('nan')) * 100
```

---

## 5. NaN 처리

### NaN 발생 원인
```python
# rolling — 초기 n-1개 행은 NaN
hist['MA20'] = hist['Close'].rolling(20).mean()
# 처음 19개 행: NaN, 20번째부터 유효값

# diff — 첫 번째 행은 NaN
delta = hist['Close'].diff()
# 첫 행: NaN

# 나누기에서 0/0
gain = delta.where(delta > 0, 0).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rsi = 100 - (100 / (1 + (gain / loss)))   # loss가 0이면 NaN 발생
```

### NaN 처리 방법
```python
# 1. fillna — 특정 값으로 채움
df['MA20'] = df['Close'].rolling(20).mean().fillna(0)
df['RSI']  = rsi.fillna(50)      # 중립값 50으로 채움

# 2. dropna — NaN 행 제거 (차트 데이터 정제 시)
df_clean = df.dropna(subset=['MA20', 'RSI'])

# 3. ffill / bfill — 앞/뒤 값으로 채움
df['Close'] = df['Close'].fillna(method='ffill')

# 4. Plotly는 NaN을 자동 갭 처리 → 차트 렌더링에는 별도 처리 불필요
# 단, st.metric이나 숫자 포맷팅에는 NaN 체크 필요
val = df['MA20'].iloc[-1]
display = f"{val:.2f}" if pd.notna(val) else "N/A"
```

### NaN 여부 확인
```python
import math, pandas as pd

# 단일 값
if pd.isna(value):
    ...
if math.isnan(value):   # float NaN 한정
    ...

# Series 전체
df[df['MA20'].notna()]          # NaN 아닌 행만
df['MA20'].isna().sum()         # NaN 개수
```

---

## 6. 타입 에러 방지

### 엑셀/CSV 읽기 후 타입 변환
```python
df = pd.read_excel(file)

# 숫자 컬럼 — 문자열로 읽힐 수 있음
df['보유수량'] = pd.to_numeric(df['보유수량'], errors='coerce').fillna(0)
df['평균단가'] = pd.to_numeric(df['평균단가'], errors='coerce').fillna(0)

# 문자열 컬럼 — 숫자로 읽힐 수 있음
df['종목코드'] = df['종목코드'].astype(str).str.strip()
df['종목명']   = df['종목명'].astype(str)

# 날짜 컬럼
df['날짜'] = pd.to_datetime(df['날짜'], errors='coerce')
```

### iterrows에서 행 접근 시
```python
for _, row in df.iterrows():
    # str()로 감싸면 float/int/NaN 모두 안전 처리
    ticker = str(row['종목코드']).strip()
    name   = str(row['종목명']).strip()

    # 숫자는 float()로 명시적 변환
    qty    = float(row['보유수량'])
    price  = float(row['평균단가'])
```

---

## 7. 스크래핑 결과 처리

### BeautifulSoup select_one 반환값 None 체크
```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, 'html.parser')

# 위험
current = int(soup.select_one('.no_today .blind').text.replace(',', ''))

# 안전
el = soup.select_one('.no_today .blind')
if el is None:
    return None
current = int(el.text.replace(',', '').strip())
```

### 문자열 → 숫자 변환 시 공백/특수문자 제거
```python
def parse_price(text):
    try:
        return int(text.replace(',', '').replace(' ', '').strip())
    except (ValueError, AttributeError):
        return 0
```

---

## 8. 전체 함수 방어 패턴

### 외부 데이터 조회 함수 표준 구조
```python
@st.cache_data(ttl=60)
def get_stock_data(ticker: str) -> dict | None:
    try:
        # 1. 데이터 조회
        stock = yf.Ticker(ticker)
        hist  = stock.history(period="1y")
        info  = stock.info

        # 2. 빈 데이터 조기 반환
        if hist.empty:
            return None

        # 3. 안전한 값 추출
        current = hist['Close'].iloc[-1]
        prev    = hist['Close'].iloc[-2] if len(hist) > 1 else current
        change  = current - prev
        change_pct = (change / prev * 100) if prev != 0 else 0.0

        # 4. 기술 지표 (NaN 허용 — Plotly가 처리)
        hist['MA20'] = hist['Close'].rolling(20).mean()

        # 5. info는 .get()으로 기본값 지정
        return {
            'current_price': current,
            'change':        change,
            'change_pct':    change_pct,
            'hist':          hist,
            'pe_ratio':      info.get('trailingPE', 0),
            'sector':        info.get('sector', 'N/A'),
            'market_cap':    info.get('marketCap', 0),
        }

    except Exception:
        # 네트워크 오류, 파싱 오류 등 모든 예외 → None 반환
        return None
```

---

## 9. pandas 자주 쓰는 방어 코드 모음

```python
# 빈 리스트로 DataFrame 만들기 — 컬럼 선언 필수
df = pd.DataFrame(columns=['name', 'value'])

# DataFrame이 비었는지 확인
if df.empty or len(df) == 0:
    st.info("데이터가 없습니다")

# 특정 컬럼 기준 NaN 행 제거
df = df.dropna(subset=['종목코드', '종목명'])

# 중복 제거
df = df.drop_duplicates(subset=['종목코드'])

# 안전한 최대/최소 (빈 시리즈 대비)
high = hist['High'].max() if not hist.empty else 0
low  = hist['Low'].min()  if not hist.empty else 0

# 조건부 컬럼 생성 — apply로 행별 처리
df['수익률'] = df.apply(
    lambda row: (row['현재가'] - row['평단']) / row['평단'] * 100
                if row['평단'] != 0 else 0.0,
    axis=1
)
```

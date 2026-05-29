# /security — 다온 포트폴리오 앱 보안 감사

다음 항목을 순서대로 점검하라. 각 항목은 ✅(안전)/⚠️(주의)/❌(취약) 로 평가한다.
문제 발견 시 즉시 코드를 읽고 수정안을 제시하라.

---

## 1. 인증 구현 검토

`backend/main.py`를 읽고 아래를 확인하라:

- [ ] 비밀번호가 평문으로 저장되지 않는가? (PBKDF2/bcrypt/argon2 사용 여부)
- [ ] 세션 토큰이 `secrets.token_hex(32)` 이상의 강도로 생성되는가?
- [ ] 토큰에 만료 시간(expiry)이 설정되어 있는가?
- [ ] 로그아웃 시 서버 측 세션이 실제로 삭제되는가?
- [ ] 로그인 실패 시 "이메일 없음"과 "비밀번호 틀림"을 동일 메시지로 처리하는가? (사용자 열거 방지)

```bash
grep -n "password\|token\|session\|hash\|pbkdf\|bcrypt" "c:/Users/user/Desktop/쿠든카피 주식앱/backend/main.py" | head -30
```

## 2. API 인증 적용 범위 확인

인증이 필요한 엔드포인트에 `Depends(get_current_user)`가 적용되었는지 확인한다.

```bash
grep -n "^@app\.\|Depends(get_current_user)" "c:/Users/user/Desktop/쿠든카피 주식앱/backend/main.py" | grep -A1 "@app\."
```

다음 엔드포인트가 인증 없이 접근 가능한지 서버에서 직접 확인한다:

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 "
BASE=http://localhost:8501/api
echo '--- 인증 없이 portfolio 접근 (401이어야 함) ---'
curl -s -o /dev/null -w 'HTTP %{http_code}' \$BASE/portfolio
echo
echo '--- 인증 없이 watchlist 추가 (401이어야 함) ---'
curl -s -o /dev/null -w 'HTTP %{http_code}' -X POST \$BASE/watchlist/add \
  -H 'Content-Type: application/json' -d '{\"ticker\":\"AAPL\",\"name\":\"Apple\"}'
echo
echo '--- 공개 API (200이어야 함) ---'
curl -s -o /dev/null -w 'HTTP %{http_code}' \$BASE/market
echo
"
```

## 3. 민감 데이터 노출 점검

### 3-1. users.json 권한 확인

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 \
  "ls -la ~/portfolio/users.json ~/portfolio/portfolio_data.json 2>/dev/null"
```
파일 권한이 `-rw-r--r--` (644) 이상으로 노출되어 있으면 ⚠️. `chmod 600`을 권고하라.

### 3-2. API Key 응답 마스킹 확인

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 "
TOKEN=\$(curl -s -X POST http://localhost:8501/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{\"email\":\"test@check.com\",\"password\":\"check123\"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"token\",\"\"))')
echo 'API Key endpoint response:'
curl -s http://localhost:8501/api/settings/apikey -H \"Authorization: Bearer \$TOKEN\" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); k=d.get(\"key\",\"\"); print(f\"has_key={d.get(\\\"has_key\\\")}, key_length={len(k)}, prefix={k[:12] if k else \\\"N/A\\\"}\")'
"
```
Anthropic API Key가 전체 노출되면 ⚠️ — 프론트에 `has_key` + prefix만 반환하도록 수정 권고.

### 3-3. 소스코드에 하드코딩된 비밀값 스캔

```bash
grep -rn "sk-ant\|password.*=.*['\"][a-z]" \
  "c:/Users/user/Desktop/쿠든카피 주식앱/backend/main.py" \
  "c:/Users/user/Desktop/쿠든카피 주식앱/frontend/src/" 2>/dev/null | grep -v ".json"
```

## 4. CORS 설정 검토

```bash
grep -n "CORSMiddleware\|allow_origins\|allow_credentials" \
  "c:/Users/user/Desktop/쿠든카피 주식앱/backend/main.py"
```

`allow_origins=["*"]`이면 ⚠️. 개인용 앱이므로 허용 가능하나, 운영 환경에서는 서버 IP로 제한 권고.

## 5. 입력값 검증 확인

`backend/main.py`에서 사용자 입력이 직접 Shell 또는 파일 경로에 사용되는지 확인한다.

```bash
grep -n "os\.system\|subprocess\|eval\|exec\|open.*ticker\|open.*email" \
  "c:/Users/user/Desktop/쿠든카피 주식앱/backend/main.py" | head -20
```

## 6. 서버 노출 포트 확인

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 \
  "ss -tlnp | grep -E '8501|5432|6379|27017'"
```

8501 외에 DB 포트가 외부 노출되면 ❌.

## 7. 보안 감사 결과 보고

아래 형식으로 최종 보고서를 작성하라:

```
## Security Audit Report — [날짜/시간]

### 요약
- 심각(❌): N건
- 주의(⚠️): N건  
- 정상(✅): N건

### 항목별 결과

| 항목 | 상태 | 상세 |
|------|------|------|
| 비밀번호 해싱        | ✅/⚠️/❌ | ... |
| 세션 토큰 강도       | ✅/⚠️/❌ | ... |
| 토큰 만료 처리       | ✅/⚠️/❌ | ... |
| API 인증 적용 범위   | ✅/⚠️/❌ | 미인증 엔드포인트: ... |
| 민감 데이터 노출     | ✅/⚠️/❌ | ... |
| CORS 설정           | ✅/⚠️/❌ | ... |
| 입력값 검증         | ✅/⚠️/❌ | ... |
| 서버 포트 노출       | ✅/⚠️/❌ | ... |

### 즉시 조치 필요 항목
1. ...

### 중장기 개선 권고
1. ...
```

발견된 취약점은 즉시 `backend/main.py` 또는 해당 파일을 수정하여 해결하라.

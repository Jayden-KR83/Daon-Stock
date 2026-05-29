# /qa — 다온 포트폴리오 앱 QA 검증

다음 순서대로 QA를 실행하라. 각 단계 결과를 ✅/❌/⚠️ 로 표시하고, 문제 발견 시 즉시 수정 방법을 제안하라.

---

## 1. 백엔드 API 상태 확인

서버가 운영 중인지 확인한다.

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 \
  "sudo systemctl is-active portfolio && curl -s http://localhost:8501/api/market | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f\"마켓 지수: {len(d)}개\")'"
```

## 2. 인증 플로우 검증

순서대로 register → login → me → logout → me(실패) 를 테스트한다.

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 "
BASE=http://localhost:8501/api
TEST_EMAIL=qa_test_$(date +%s)@daon.test
TEST_PW=qatest123

echo '--- [1] Register ---'
TOKEN=\$(curl -s -X POST \$BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d \"{\\\"email\\\":\\\"\$TEST_EMAIL\\\",\\\"password\\\":\\\"\$TEST_PW\\\",\\\"name\\\":\\\"QA Bot\\\"}\" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get(\"token\",\"FAIL\"))')
echo \"Token: \${TOKEN:0:16}...\"

echo '--- [2] GET /auth/me ---'
curl -s \$BASE/auth/me -H \"Authorization: Bearer \$TOKEN\" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"User:\", d.get(\"email\"))'

echo '--- [3] Portfolio (empty) ---'
curl -s \$BASE/portfolio -H \"Authorization: Bearer \$TOKEN\" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"Portfolios:\", list(d.get(\"portfolios\",{}).keys()))'

echo '--- [4] Logout ---'
curl -s -X POST \$BASE/auth/logout -H \"Authorization: Bearer \$TOKEN\" \
  | python3 -c 'import sys,json; print(\"Logout:\", json.load(sys.stdin))'

echo '--- [5] Auth after logout (should fail) ---'
STATUS=\$(curl -s -o /dev/null -w '%{http_code}' \$BASE/auth/me -H \"Authorization: Bearer \$TOKEN\")
echo \"HTTP Status (expect 401): \$STATUS\"
"
```

## 3. 핵심 API 엔드포인트 응답 속도 검증

각 엔드포인트의 응답 시간을 측정한다 (3초 초과 시 ⚠️).

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 "
BASE=http://localhost:8501/api
for ENDPOINT in market usdkrw sector/us sector/kr; do
  TIME=\$(curl -s -o /dev/null -w '%{time_total}' \$BASE/\$ENDPOINT)
  echo \"/api/\$ENDPOINT → \${TIME}s\"
done
"
```

## 4. 프론트엔드 빌드 무결성 확인

로컬에서 빌드가 오류 없이 완료되는지 확인한다.

```bash
cd "c:/Users/user/Desktop/쿠든카피 주식앱/frontend" && npm run build 2>&1 | tail -5
```

## 5. 서버 파일 일관성 확인

index.html이 최신 JS 번들을 참조하는지 확인한다.

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 "
echo '=== index.html 참조 번들 ==='
grep -o 'index-[^\"]*\.js' ~/portfolio/backend/static/index.html
echo '=== assets 디렉토리 JS 파일 ==='
ls ~/portfolio/backend/static/assets/*.js | xargs -I{} basename {}
"
```

## 6. 백엔드 에러 로그 확인

최근 50줄 로그에서 ERROR/CRITICAL 를 스캔한다.

```bash
ssh -i "C:\Users\user\Downloads\oracle-key.key" -o StrictHostKeyChecking=no ubuntu@168.107.13.20 \
  "journalctl -u portfolio -n 50 --no-pager | grep -i 'error\|critical\|traceback' | head -20 || echo 'No errors found'"
```

## 7. QA 결과 요약 보고

위 1~6 단계 결과를 아래 형식으로 정리하라:

```
## QA Report — [날짜/시간]

| 항목 | 상태 | 비고 |
|------|------|------|
| 서버 상태        | ✅/❌ | ... |
| 인증 플로우      | ✅/❌ | ... |
| API 응답 속도    | ✅/⚠️/❌ | 느린 엔드포인트: ... |
| 프론트 빌드      | ✅/❌ | ... |
| 파일 일관성      | ✅/❌ | ... |
| 에러 로그        | ✅/⚠️ | ... |

### 발견된 문제
- ...

### 권장 조치
- ...
```

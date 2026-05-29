# 다온 — 트러블슈팅 · 흔한 함정 · 검증

## 1. 자체검증 — UI 변경 9 체크리스트 (시트/모달/오버레이)

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | **Portal** 사용 | `createPortal(node, document.body)` — 부모 transform/filter 회피 |
| 2 | **z-index** | grep으로 모든 fixed 요소 z-index 수집해 비교. 시트는 최상위 (2147483647 권장) |
| 3 | **명시적 배경** | `background: var(--m-surface)` — 컨테이너 + body div 양쪽 |
| 4 | **AnimatePresence + Portal** | Fragment 형제 X, children 1개 |
| 5 | **flex layout** | 시트 body는 `flex:1 + overflow-y:auto + min-height:0` |
| 6 | **모바일 viewport** | `width: min(380px, 100vw)` |
| 7 | **다크/프로 테마** | 토큰만 (`var(--m-*)`), 하드코딩 `#fff/#000` 금지 |
| 8 | **포커스/접근성** | aria-label, ESC keydown, 오버레이 클릭 닫기 |
| 9 | **빌드 후 재검증** | 정적 grep + 사용자에게 "어떻게 확인했는지" 명시 |

→ 사용자가 깨진 UI를 발견하기 전에 잡아낼 것. `feedback_ui_self_verify.md` 참조.

## 2. React 함정 — TDZ + useEffect deps

### Temporal Dead Zone
```jsx
// ❌ 위험: data 사용이 declaration보다 위
useEffect(() => { if (data) ... }, [data])
const { data } = useQuery(...)

// ✅ 정상: declaration 먼저
const { data } = useQuery(...)
useEffect(() => { if (data) ... }, [data])
```

### useEffect deps 정적 검사
```jsx
// ❌ 객체/배열 참조 → 매 렌더마다 새 ref → 무한 루프
useEffect(() => { ... }, [obj, arr])

// ✅ primitive 또는 stable 변환
useEffect(() => { ... }, [obj.id, JSON.stringify(arr), !!arr])
useEffect(() => { ... }, [arr.length])
```

→ 빌드 통과해도 런타임 freeze. 새 useEffect 추가 시 deps 배열 grep 필수.

## 3. Claude API JSON 파싱

- Sonnet 4.6 + web_search는 web_search 사고과정을 text 블록으로 반환
- **마지막 text 블록만 JSON 파싱** — 첫 블록은 search 결과 요약일 수 있음
- 파싱 실패 시 502 반환 (raw text를 캐시에 저장 금지)
- prefill (`{` assistant turn 마지막 메시지)은 web_search와 호환성 문제 → 금지
- `_call_claude_with_search` 헬퍼 사용 권장

## 4. Oracle Cloud Free Tier 함정

| 증상 | 원인 | 처치 |
|---|---|---|
| ping 100% loss, HTTP 000 | idle reclaim (24h 무사용) | OCI 콘솔에서 인스턴스 start. CPU 부하 1% 유지 cron 등록 |
| OOM kill (서비스 갑자기 죽음) | 1GB RAM 초과 | 1GB swap 추가 + systemd MemoryHigh=700M |
| 빌드 후 마켓바 0.00% | index.html 업로드 누락 | 항상 index.html + sw.js + assets/ 함께 |

## 5. 한국 종목 가격 0 표시

- **원인 1**: Naver HTML 구조 변경 → 1차 실패
- **원인 2**: yfinance .KS/.KQ도 데이터 없음 (상장폐지 ETF 등)
- **원인 3**: A-prefix 정규식 누락 — `^A?\d{6}$` 형태로 수정 (`A005490` POSCO 케이스)
- **해결**: `_kr_price` 함수의 stale-while-revalidate (30분 fallback) — 30분 내 정상값이 있으면 0 대신 마지막 값 반환

## 6. 배포 후 마켓바 0.00% 패턴

| 단계 | 확인 |
|---|---|
| 1 | 새 번들 생성됨: `grep -oE "index-[A-Za-z0-9_-]+\.js" backend/static/index.html` |
| 2 | sw.js가 새 번들 참조: `grep -oE "index-..." backend/static/sw.js` |
| 3 | scp가 index.html + sw.js + 모든 vendor-*.js + 탭별 청크까지 업로드 |
| 4 | 사용자 브라우저: `Ctrl+Shift+R` (PWA precache 무시) |

## 7. 검증 명령 (배포 직후 1줄)
```bash
ssh -i $KEY ubuntu@168.107.13.20 \
  "sudo systemctl restart portfolio && sleep 4 && \
   systemctl is-active portfolio && \
   curl -s -o /dev/null -w 'market:%{http_code} stock:%{http_code}\n' \
     http://127.0.0.1:8501/api/market http://127.0.0.1:8501/api/stock/AAPL && \
   journalctl -u portfolio --since '1 minute ago' --no-pager | \
     grep -iE 'error|exception|traceback' | head -3"
```
모두 200 + 에러 0건이어야 통과.

## 8. 흔한 변수 shadowing — `time`

```python
# main.py 상단:
from time import time, sleep   # ← time이 module이 아니라 function 자체

# ❌ 잘못된 사용 (AttributeError 발생):
now = time.time()

# ✅ 올바른 사용:
now = time()
```

→ 새로 추가하는 코드의 `time.time()`은 모두 `time()`으로 (이미 한번 인시던트 발생).

## 9. 변경 후 보고 원칙
1. 빌드 OK + 배포 + endpoint 200 + 로그 에러 0건 → 자동 검증 통과
2. UI 변경이면 9 체크리스트(섹션 1) 정적 grep 통과
3. **무엇을 어떻게 검증했는지 사용자에게 명시** ("market 200 / 시트 portal grep 5건 / z-index max 등")
4. 통과하지 못한 채 "완료" 보고 금지 — 사용자가 발견하면 신뢰가 무너짐

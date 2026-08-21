# 다온(Daon) 포트폴리오 앱 — 개발 로그

> 마지막 업데이트: **2026-08-21** (계좌별 예수금 · 온보딩 투어)
> 모델: claude-opus-4-8
> 서버: ubuntu@168.107.13.20 | 포트: 8501 (127.0.0.1 전용) · 공개: https://daonwealth.com
> 로컬: `C:\Users\user\Desktop\쿠든카피 주식앱\`



## 🆕 2026-08-21 세션 (2차) — 계좌별 예수금

**한 줄 요약**: 계좌마다 예수금(안 쓰고 남은 현금)을 넣을 수 있게 하고, 그 돈을
포트폴리오 상단 **총자산**과 분석 탭 **현금 비중**까지 이어지게 했다.

### 설계 결정 3가지

**① 금액은 계좌 통화 그대로 저장한다.** 미국 계좌면 달러로 넣고 달러로 저장한다.
서버가 원화로 환산해 저장하면 환율이 바뀔 때마다 **과거에 넣은 값이 슬금슬금 달라진다.**
환산은 화면에서 표시 시점 환율로만 한다.

**② 예수금은 손익·수익률에 넣지 않는다.** 현금은 사고판 것이 아니라 수익률의 분모가
될 수 없다. 상단 손익과 수익률은 지금까지처럼 **주식만** 기준이다. 바뀌는 것은 총액뿐이다.

**③ 뷰마다 현금을 다르게 표현한다.**
- 계좌별 비중: 현금을 **그 계좌 몫에 합친다**(= 계좌의 실제 총액).
- 섹터별·종목별 비중: **'현금' 한 칸**을 따로 세운다. 종목별은 상위 15 컷 *뒤에* 붙인다 —
  컷에 걸려 사라지면 '전액 투자'처럼 보인다.

### 음수를 허용한 이유
미수금·마이너스 잔고는 실제로 존재한다. 0 으로 깎으면 총자산이 실제보다 커진다.
대신 NaN·무한대는 막았다 — 한 번 들어가면 그 뒤 모든 합계가 NaN 이 된다.

### 실제로 띄워 보고 고친 것 2건
1. **'주식 + 예수금'이 총자산과 1원 어긋났다.** 항목마다 따로 반올림해서 생긴 차이다
   (134,314,070.6 + 6,163,823.6). 총자산과 예수금을 먼저 반올림하고 주식은 그 **차이로**
   내도록 바꿔 합이 반드시 맞게 했다.
2. **원화 입력칸이 `1250000` 으로 보여 자릿수를 세야 했다.** number 입력칸은 천 단위
   구분자를 못 넣는다. 칸 아래에 `₩1,250,000` 을 찍어 눈으로 확인되게 했다.

### 검증
| 항목 | 결과 |
|---|---|
| pytest (신규 10건 포함) | 200 통과 |
| 소유권 — 남의 계좌 키를 그대로 불러도 못 건드림 | 통과 |
| NaN·무한대·과대값 거부 후 DB 불변 | 통과 |
| 360·390px 총자산 = 주식 + 예수금 (자릿수까지 일치) | 통과 |
| 저장 → 새로고침 후 값 유지 | 통과 |
| 계좌별(현금 합산) · 섹터별(현금 6.1% 슬라이스) | 통과 |
| 가로 오버플로 · 콘솔 에러 | 0건 |

### 산출물
`backend/main.py`(accounts.cash 마이그레이션 + `PUT /api/accounts/{key}/cash`) ·
`tests/test_account_cash.py`(신규) · `components/AccountCashCard.jsx`(신규) ·
`HoldingsTab`(총자산) · `AllocationTab`(현금 비중·리포트) · `api.js` · `ManageTab`

---

## 🆕 2026-08-21 세션 — 최초 로그인 온보딩 투어

**한 줄 요약**: 주식을 모르는 사람이 처음 들어와도 헤매지 않도록, 화면의 **실제 요소**를
하나씩 비추며 따라가는 10단계 코치마크 투어를 넣었다. 계기는 오너가 친구들에게 앱을
소개하면서 "게임·주식 앱은 다들 첫 로그인 튜토리얼이 있다"고 느낀 것.

### 왜 이렇게 만들었나

**그림 설명이 아니라 실제 화면을 뚫어 비춘다.** 별도 안내 페이지로 만들면 투어가 끝난
뒤 "아까 그게 어디였지"가 남는다. 지금 보고 있는 화면의 그 자리를 가리키면 위치 기억이
함께 남는다. 하이라이트를 누르면 다음으로 넘어가게 해서 "클릭하며 따라가는" 감각도 살렸다.

**어두운 막은 사각형 4개로 만든다.** 흔히 쓰는 `box-shadow: 0 0 0 9999px` 트릭은
design.md R1ب 가 금지하는 그림자에 걸리고, 4분할이 경계도 더 또렷하다.

**화면 상태에 따라 문구가 갈리는 단계를 하나 뒀다.** 보유 종목이 있으면 '종목 한 줄 읽는 법',
0개면 '첫 종목 추가하기'를 비춘다. 처음엔 두 단계로 나눴다가 합쳤다 — 나누면 한쪽은 반드시
건너뛰어져 `4 / 11` 처럼 번호가 비어 보인다.

### 실제로 띄워 보고 잡은 것 3건 (빌드만으로는 하나도 안 잡혔다)

로컬에 백엔드(8000) + vite(3000)를 띄우고 Edge 를 Playwright 로 몰아 **10단계를 끝까지
클릭하며** 확인했다. 데모 계정(보유 13종목)과 보유 0개 신규 계정 두 경로 모두.

1. **투어가 아예 안 떴다.** `currentUser` 는 authMe 응답마다 **새 객체**라 effect 가
   재실행되는데, 그 cleanup 이 예약해 둔 타이머를 취소하고 재실행분은 ref 가드에 걸려
   조기 반환했다. → 타이머를 ref 에 두고 언마운트에서만 정리.
2. **하단바가 '다음' 클릭을 가로챘다.** 투어 z-index 를 4000 으로 잡았는데 하단바 9999 ·
   전체메뉴 시트 10000 · InfoTip 10001 이 이미 더 높았다. 어두운 막이 하단바를 못 덮은
   것도 같은 원인. → 20000 으로.
3. **금액이 전부 점(●)인 채로 "맨 위 큰 숫자"를 설명했다.** 프라이버시 모드가 로드 시
   기본 ON 이라서다. 설명과 화면이 정면으로 어긋났다. → 해당 단계 진입 시 가림을 직접
   벗기고, 바로 다음 단계에서 그 버튼을 알려주는 순서로 바꿨다.

> 셋 다 타입 오류가 아니라 **타이밍·레이어·상태**의 문제라 컴파일로는 잡히지 않는다.
> "빌드 OK 만으로 완료 보고 금지"가 왜 규칙인지 그대로 보여준 사례.

### 부수 결정
- **'새 소식' 모달과의 순서 정리** — 신규 사용자에게 changelog 는 의미가 없다(전부 새 것).
  투어를 띄우기로 정하면 `daon_last_seen_version` 을 미리 찍어 모달이 안 뜨게 하고,
  판단이 끝나기 전에는 모달을 아예 렌더하지 않는다(읽는 도중 투어에 빼앗기는 것 방지).
  대가: v2.4 changelog 항목은 기존 사용자도 못 보게 된다. 대신 투어 자체가 뜬다.
- **1회성 + 재실행** — 사용자별 localStorage 키. 설정 탭 → '안내 다시 보기'.

### 검증 (전부 실행함)
| 항목 | 결과 |
|---|---|
| 데모(보유 13종목) 390px · 1280px 10단계 완주 | 통과, 콘솔 에러 0 |
| 보유 0개 신규 계정 10단계 완주 | 통과, 4단계가 '첫 종목 추가' 로 자동 전환 |
| R5 앱폭 360px 완주 | 가로 오버플로 0 (`scrollWidth == innerWidth`) |
| 말풍선이 화면 밖으로 나가는지 / 하이라이트와 겹치는지 | 10단계 전부 0건 |
| 건너뛰기 → 종료 · 스크롤 잠금 해제 | 통과 |
| 새로고침 후 재등장 안 함 | 통과 |
| 설정 → '안내 다시 보기' 재실행 | 통과 |
| R1·R1ب·R4·R6 정적 grep | 0건 |
| pytest | 190 통과 |

### 산출물
`components/Tour.jsx`·`Tour.css`(신규) · `App.jsx`(자동 시작·모달 순서) · `store.js`(tourOpen) ·
`BottomNav`·`SideNavBar`·`HoldingsTab`(data-tour 앵커) · `ManageTab`(다시 보기 카드) · `changelog.json`

---

## 🆕 2026-08-20 세션 (2차) — 백업 암호화 · 시크릿 스캔 상시화

**한 줄 요약**: 보안 백로그의 남은 개발 항목 두 개(백업 암호화 · `gitleaks`)를 처리하고,
그 과정에서 **CI 가 조용히 빨간불이었던 것**과 **백업 권한이 664 였던 것**을 발견해 고쳤다.

### 1. 백업 암호화 — 왜 대칭이 아니라 공개키인가

보안 문서 R2 는 "저장 암호화는 서버가 복호화 키를 쥐어야 하니 이득이 제한적"이라고 적어
두었는데, 그건 **대칭키를 전제했을 때** 맞는 말이다. 서버에 암호가 있으면 서버가 털릴 때
백업도 같이 털린다.

그래서 **비대칭**으로 갔다. 서버에는 인증서(공개키)만 두어 **암호화만 가능**하게 하고,
개인키는 오너 PC 에만 둔다(`C:\Users\user\.daon-backup-key\`). 서버가 통째로 장악돼도
과거 30일치 스냅샷은 읽히지 않는다.

**과장하지 않기 위해 한계를 명시해 둔다**: 이 조치는 서버 장악 시점의 **현재** `daon.db`
를 지키지 못한다. 그건 여전히 평문 600 이다. 백업 암호화가 실제로 사는 지점은
① 과거 이력 ② **백업을 서버 밖으로 복사할 때**다. 지금 백업이 서버 한 대에만 있어
서버가 죽으면 백업도 같이 죽는 상태인데, 암호화를 해 두었으니 이제 그냥 복사해도 된다.
오프사이트 복사를 다음 후보로 남겼다.

**fail-closed 로 만들었다.** 인증서가 없으면 평문으로 흘러가지 않고 그냥 실패한다(exit 1).
조용히 평문을 만들면 암호화됐다고 착각한 채로 몇 달이 지나가기 때문이다.

**검증**(추정 아님, 전부 실행): 기존 평문 31건 암호화 → 다운로드 → 로컬 복호화 →
sha256 이 원본과 **바이트 동일** → `PRAGMA integrity_check: ok` 확인 후에야 평문을 지웠다.
인증서를 치우고 돌려 exit 1 도 확인했다.

**이 조치가 새로 만든 위험**: 개인키를 잃으면 백업 전부가 못 쓰는 파일이 된다.
패스프레이즈는 일부러 걸지 않았다 — 백업 키는 "잊어버리면 백업이 죽는" 물건이다.
대신 오프라인 사본을 오너 할 일로 올렸다.

### 2. gitleaks — 결과는 "0건", 다만 오탐 5건

전체 히스토리 스캔에서 5건이 떴는데 전부 같은 패턴의 오탐이었다:
`_call_claude(api_key, "claude-haiku-4-5-20251001", ...)` 의 **모델 ID** 가 인자 이름
`api_key` 뒤에 온다는 이유로 `generic-api-key` 룰에 걸린 것. 실제 Anthropic 키는
`sk-ant-` 로 시작하므로 겹치지 않는다. `.gitleaks.toml` 에 규칙으로 남기고 CI 게이트로 만들었다.
집현전 저장소도 같이 스캔했고 0건.

### 3. 발견 — CI 의 backend 잡이 이미 실패하고 있었다

`security` 잡을 붙이면서 로컬에서 CI 와 같은 방식(`backend/` 안에서 pytest)으로 돌려 보니
`ModuleNotFoundError: No module named 'backend'` 로 죽었다. 원인은 `conftest.py` 가
`_PROJECT_DIR` 을 **계산만 하고 sys.path 에 넣지 않은 것**. 리포 루트에서 돌리면 cwd 덕에
우연히 통과해서 안 보였다. 한 줄 추가로 양쪽 다 190 통과.

> 교훈은 지난 세션과 같은 것의 반복이다 — **"돌 것 같다"가 아니라 그 경로로 실제 실행해 본다.**
> CI 는 초록불이라서 믿은 게 아니라, 아무도 안 봐서 몰랐던 것이다.

### 4. bandit 게이트를 붙이자 HIGH 3건이 실제로 걸렸다

전부 캐시 키 지문용 MD5(B324). 보안 용도가 아니므로 `usedforsecurity=False` 로
의도를 코드에 명시해 해소했다(서버 Python 3.10.12 — 지원 확인).

### 5. 무엇을 차단하고 무엇을 안 하는지 명시

`pip-audit` 는 **차단하지 않는다**. 전이 의존성에 새 CVE 가 뜨면 무관한 배포까지 막히기
때문이고, 추적은 Dependabot 이 맡는다. 즉 **CI 초록불이 "CVE 없음"을 뜻하지 않는다** —
이걸 문서에 적어두지 않으면 초록불을 잘못 읽게 된다.
`bandit` 도 MEDIUM 이하는 로그만 남긴다(도입 시 노이즈 108건).

### 부수 수정
- 신규 백업 권한 **664 → 600**. 기존 백업이 다른 로컬 계정에도 읽혔다.
- `docs/deployment.md` 의 cron 블록이 실제 crontab 과 달랐다(문서엔 `cp` 한 줄, 실제는
  `daon-backup.sh`). 실측 기준으로 정정.

### 산출물
`.gitleaks.toml` · `.github/workflows/ci.yml`(security 잡) · `scripts/daon-backup.sh`(재작성) ·
`scripts/daon-backup-restore.sh`(신규) · `docs/backup-restore.md`(신규) ·
`backend/tests/conftest.py`(CI 수정) · `backend/main.py`(B324 3곳)

---

## 2026-08-20 세션 (1차) — 운영 구조 전환 (서버 cron → PC 구독 자동화)

**한 줄 요약**: 분석 갱신을 종량제 서버 cron(월 $79)에서 **PC 작업 스케줄러 + Claude Code
구독(0원)**으로 옮기고, 그 과정에서 드러난 결함 3건과 내 오진 2건을 바로잡았다.

### 왜 그렇게 했나

**비용 구조가 선택을 강제했다.** 보유 52종목을 API 종량제로 매일 돌리면 월 $79다.
반면 구독은 이미 내고 있는 정액이라 한계비용이 0이다. 문제는 구독이 PC 의 Claude Code
클라이언트에 딸려 있어 **서버가 빌려 쓸 수 없다**는 것. 그래서 '무료+자동'의 유일한 조합인
PC 작업 스케줄러로 옮겼고, 대가로 'PC 가 켜져 있어야 한다'는 조건을 받아들였다.
앱 화면에서 완전 자동은 원리상 불가능하므로, AI 를 부르는 한 단계만 밖에 두고 나머지
(대상 선정·프롬프트·검증·저장)를 앱 안에 넣은 반자동 경로를 함께 만들었다.

**기계적인 일과 판단이 필요한 일을 분리했다.** 대상 조회·검증·주입은 스크립트가 결정론적으로
처리하고, 조사와 작성만 `claude -p` 에 맡겼다. LLM 을 결정론적 작업에까지 쓰면 느리고
재현이 안 된다.

**검증 실패 시 부분 주입을 막았다.** 하나라도 어긋나면 아무것도 넣지 않는다. 절반만 들어간
상태가 가장 나쁘기 때문이다. 실제로 이 관문이 스키마 이탈 생성물을 잡아냈다.

### 확인 과정에서 드러난 결함
1. **나침반 신호가 끊길 상태였다** — 신호 기록이 API cron 경로에만 있었다. 무료 경로로
   갈아탄 순간 배너가 영원히 안 뜨게 된다. 같은 규칙으로 주입 스크립트에 추가.
2. **스케줄러가 등록만 되고 이틀간 안 돌았다** — `DisallowStartIfOnBatteries` 기본값 True.
   내가 안내한 등록 명령에 `-AllowStartIfOnBatteries` 가 빠져 있었다.
3. **생성이 필드명을 camelCase 로 바꾸고 절반을 누락** — 검증기가 막아 데이터는 안전했으나
   하루치가 버려졌다. 프롬프트에 13키 체크리스트·저장 후 재확인 절차를 넣고 1회 재시도 추가.

### 내 오진 2건 (정정)
- **"사용자 1명"** 전제로 보안 위협모델을 썼으나 실측 결과 **승인 사용자 5명**. 타인의 금융
  데이터도 있어 2FA·백업 암호화 우선순위가 올라간다.
- **"집현전은 원격 백업 없음"** 이라 두 문서에 적고 오너에게도 보고했으나 **오진**.
  `cd` 없이 명령을 돌려 다른 저장소를 보고 착각했다. 실제로는 완전 동기화 상태.

### 오너 결정 반영
- 서버 cron 삭제(엔드포인트는 되돌림 여지로 유지)
- **중복 보유는 의도된 장기 배분** — 매일 분석이 반복 지적하지 않도록 프롬프트에서 제외.
  단 기초지수 변경·상장폐지 등 새 위험은 계속 알린다.

### 검증
작업 스케줄러 경로로 실제 실행 성공(22:21→22:26 주입) · 프롬프트 강화 후 첫 시도 통과 ·
pytest 190 · cron 삭제 후 crontab 잔여 0.

## 🆕 2026-08-18 세션 — 오너 지시 5건 + GitHub 복구

**한 줄 요약**: 업비트 원화 평단 환산기 → 분석 머릿글 체계 통일 → 보유종목 일1회 웹검색 갱신 →
보안 종합분석 → 투자 나침반 설계안. 그리고 2026-07-27부터 막혀 있던 GitHub 푸시가 풀려 18커밋 일괄 push.

### 왜 그렇게 했나 (설계 근거·트레이드오프)

**① 원화 평단 — 왜 '매수 시점' 환율인가**
현재 환율로 나누면 환율이 움직일 때마다 과거 매수 원가가 따라 흔들린다. 매수 시점 환율로 한 번
확정하면 `avg_price`(달러)가 고정된다 — 앱이 이미 미국 주식을 다루는 방식과 같다.
`krw_avg_price`·`krw_fx` 는 **계산에 안 쓴다**. 기록을 계산에 끌어들이면 원가 기준이 둘이 된다.
남는 한계: 원화 손익이 `r_now/r_buy` 만큼 스케일된다 — 달러 표시 자산의 구조적 성질이고,
정확히 맞추려면 안 B(`BTC-KRW`)가 필요한데 `is_kr()` 의미 혼선 위험은 그대로라 미채택.

**③ 머릿글 — 증상이 아니라 원인을 고쳤다**
"어떤 문단엔 제목이 없다"는 증상의 원인은 **한 리포트에 머릿글 체계가 셋**이었던 것이다.
개별 문단에 제목을 덧붙이는 대신 `Section` 을 유일 체계로 승격하고 나머지를 흡수시켰다.
AllocationTab 의 2단계 라벨도 인라인 중복을 `SubLabel` 로 접었다 — 인라인 중복이 곧
스타일 드리프트의 원인이기 때문이다.

**② 일1회 갱신 — 핸드오프의 전제가 틀렸다**
"웹검색 도구 사용 가능 여부부터 확인"이 미확인 항목이었는데, **이미 쓰고 있었다**.
붙일 것은 주기 호출 경로뿐이었다. 생성부를 `_generate_stock_analysis()` 로 뽑아
사용자 경로와 배치가 같은 프롬프트를 쓰게 했다 — 배치가 자기 사본을 가지면 프롬프트 수정 시
한쪽만 고치게 된다. 비용은 4겹(대상 제한·티커 중복제거·시간 간격·건수 상한)으로 묶고,
초과분은 **오래된 것 먼저** 정렬로 다음 날 순번이 돌아오게 했다(조용한 누락 방지).
쿼터 로그는 `user_id`·`event_type` 두 축 모두 사용자 경로와 어긋나게 둬서 배치가 사용자의
월 무료 쿼터를 갉아먹지 않게 했다.

**⑤ 보안 — 위협모델을 먼저 정의했다**
사용자 1명 앱이라 "대규모 유출"이 아니라 **단일 계정 탈취 = 전부 상실**이 위협모델이다.
그래서 다중 사용자 서비스의 표준 체크리스트가 아니라 계정탈취·서버장악·비용유발 세 축에 집중.
3자 침투테스트는 **비권장** 결론 — 감사는 스냅샷이고 다음 주 커밋은 검증되지 않는다.
상시성(CI 정적분석 + Dependabot)이 1회 감사를 이긴다.
Anthropic 키도 암호화보다 **콘솔 월 사용한도**를 권고했다. 서버가 복호화 키를 쥐어야 하니
암호화 이득이 제한적인 반면, 한도는 유출돼도 손실 상한을 만든다.

**④ 나침반 — 원안을 비권장했다**
기존 `/api/youtube/analyze` 가 **자막을 안 읽는다**(제목·채널명만)는 걸 확인. 그대로 확장하면
구조적 환각 생성기가 된다. 자막은 공식 경로로 못 받는다(`captions.download` 는 소유자 전용).
"유튜브"는 수단이지 목적이 아니라고 판단 — 목적(동향을 내 투자에 연결)은 보유 연동(A)+매크로(B)로
더 싸고 더 정확하게 달성된다. 구현 전 승인이 지시였으므로 코드는 쓰지 않았다.

### 검증
pytest 160 통과(신규 8) · vite build OK · design.md R1/R1ب/R4/R6 grep 자가검증.
⚠️ R5-앱폭 육안 확인 미실시(로컬 구동이 운영 daon.db 를 건드려 안 띄웠다) · **전체 미배포**.

## 🆕 2026-07-30 세션 (모바일 UX 7건 + 아이콘 확정 + 잠복 버그 2건)

**한 줄 요약**: 오너 지적 7건(로고 흰테두리·PWA아이콘·하단네비·발굴탭 접힘·뷰전환·지수배너 이동·지표설명) 처리. 검증 중 **흰 화면을 유발하는 잠복 버그**와 **▶ 버튼이 아예 눌리지 않는 오버레이 버그**를 함께 발견·수정.

- **앱 아이콘 확정(L2 비중 링)**: 흰 바탕 + conic 그라데이션 도넛(코발트→시안→에메랄드→바이올렛). 512/192/maskable/badge 4종 교체.
  - **maskable 버그 수정**: 기존 `icon-512-maskable.png`이 `icon-512.png`와 **바이트 단위 동일 복사본**이라 안전영역이 없어 안드로이드 원형 마스크에서 링이 잘렸다. 링 도형을 80%로 줄여 재생성(비트맵 축소 후 붙이면 이음매 경계선이 원 안쪽에 걸쳐 보인다 → 도형 스케일로 처리).
  - 상태바 뱃지도 링 실루엣 모노크롬으로 재생성.
- **로고 흰 테두리 제거**(다크모드): `LogoCircle`이 로고 위에 `rgba(255,255,255,.9)` 배경 + `padding:2`를 줬는데, 로고가 2px 안으로 밀려 그 틈으로 흰 바탕이 드러난 것. 제공처 이미지가 이미 자기 배경을 갖고 온다(AAPL=검정 바탕 흰 사과, alpha 없음)는 걸 확인하고 배경·패딩 제거 + `objectFit:cover`.
- **하단 네비 → 스크롤 스트립**: 5칸 고정(주요 4탭 + 점3개)을 **전체 탭 가로 스크롤 + 우측 고정 '전체' 버튼**으로 교체. 활성 탭이 바뀌면 스트립이 그 탭을 가운데로 스크롤해 안 보였던 탭이 드러난다(`scrollIntoView`는 페이지까지 스크롤해서 컨테이너 기준 직접 계산). 스와이프 순서는 `navTabOrder()`로 BottomNav에서 export → App.jsx 하드코딩 배열 제거(동기화 이탈 불가).
- **지수 배너 좌우 이동**: CSS `translateX` 마퀴 → **실제 스크롤 컨테이너**로 전환. 이제 ◀▶ 버튼·터치 스와이프·트랙패드가 모두 동작(예전엔 흐르는 항목을 눌러야만 접근 가능). 시퀀스 2배 복제 + 절반 되돌림으로 무한 루프, hover/조작 시 정지 후 2.6초 뒤 재개.
- **뷰 전환(모바일↔웹)**: `appMode('web'|'app')` → `layoutMode('auto'|'web'|'app')`. 기존 값은 `'web'`이 기본값이라 "명시적 웹 선호"와 구분되지 않아 **모바일에서 웹 레이아웃을 고를 수 없었다**(버튼 자체를 `!isMobile`로 숨김). 이제 auto=폭으로 결정, 명시 선택은 폭과 무관하게 존중. 앱 상단 '웹' 버튼 + 전체 메뉴 시트에도 진입점 추가.
- **발굴탭 산정방식 기본 접힘**: `<details open>` → 접힘. 매번 펼쳐져 결과 목록이 아래로 밀리던 문제.
- **지표 설명(주식 초보자용)**: `METRIC_TIPS`(hover `title`, 모바일에서 동작 안 함) → **`METRIC_HELP` 18개 지표 × 4요소**(한글명·정의·계산식·읽는 법, 일부 예시). 지표명을 누르면 인라인 펼침. 예: PEG = "P/E 30배는 비싸 보이지만 이익이 매년 30% 늘면 30÷30=1.0으로 적정". Valuation 그리드는 `auto-fit minmax(250px)`로 좁은 폭에서 1열로 떨어진다(2열 고정이면 설명이 반쪽 칸에 갇혀 4~5자씩 끊김).

### 함께 발견·수정한 잠복 버그 2건
- **React #310 흰 화면**(치명적): `App.jsx`의 `useRef`·`useSwipeNav(useEffect)`가 `if (!authToken) return <LoginPage/>` **아래**에 있어, 로그아웃(훅 N개) → 로그인 직후(훅 N+2개)로 개수가 바뀌며 "Rendered more hooks than during the previous render"로 흰 화면. 저장된 토큰으로 새로고침하면 첫 렌더부터 개수가 같아 안 드러나고, **같은 세션에서 로그인/데모 진입할 때만** 재현되던 버그. 훅 전체를 조기 반환 위로 이동.
- **▶ 버튼 클릭 불가**: `.app-top-controls`가 `position:fixed; z-index:9999`로 마켓바 **위에** 떠 있어, 오른쪽 끝 ▶ 버튼이 덮여 좌표 클릭이 전부 삼켜졌다(DOM `.click()`은 동작 → 핸들러는 정상). 흐르는 지수 텍스트가 버튼 아래로 지나가 읽기 어렵던 문제도 같은 원인. 흐름 안의 한 줄로 되돌림.
- 부수: `.top-nav-app-btn` 클래스를 테마 버튼과 앱전환 버튼이 **공유**해 선택이 모호했다 → 테마 쪽에 `.top-nav-theme-btn` 추가.

### 배포 (2026-07-30 14:0x KST) — 급등락 알림 + 아이콘 뱃지 + UX 7건 일괄
- 운영 DB 사전 백업(`backup/daon-predeploy-20260730-1403.db`) → 정적/아이콘/main.py 업로드 → `systemctl restart`.
- 서버 마이그레이션 자동 적용 확인: `move_alert_prefs`·`move_alert_state` 생성, `notifications.change_pct` 추가, `integrity_check=ok`, 데이터 무손상(users 10 / portfolios 61 / watchlist 11).
- sha256 로컬=원격 일치 · 번들 `index-BxmZSJRw.js`(index.html·sw.js·공개도메인 3곳 일치) · 아이콘 3종 서버=로컬 일치 + **maskable ≠ 일반**(예전 동일본 버그 재발 없음).
- **공개 도메인(daonwealth.com)에서 스모크 21/21 PASS** — 로컬뿐 아니라 실서비스에서 재검증.
- 엔드포인트 200: `/api/market`(2.3s) `/api/stock/AAPL`(4.5s) `/api/discover`(0.1s). 재기동 후 에러 로그 0건.

#### 배포 직후 운영에서 발견·수정한 A접두 중복 버그
첫 급등락 스캔이 **18건 발화**(오너 14 + 데모 4 — 티커 중복은 사용자 간 분리라 정상). 그 과정에서 오너 데이터에 **`381170`과 `A381170`이 함께 등록**돼 있음을 확인. `_run_move_scan`이 raw 티커를 키로 쓰고 있어 같은 종목이 2건으로 갈라질 상태였다(시세도 2회 조회). → `kr_code()` 정규화 키로 합침(`items` = 정규화키 → (대표티커, 이름, 출처), `move_alert_state`도 정규화 키).
- 회귀테스트 3건 추가(`TestKrTickerDedup`) + 로컬 통합 재현 검증(2건 → 1건, 상태행 1개).
- 재배포 후 재스캔에서 **3건 재발화** — 기존 상태행이 raw 키(`A003670`·`A051910`·`A373220`)라 조회가 빗나간 1회성 마이그레이션 비용. 해당 죽은 행 3개 삭제 후 3회차 스캔 `triggered:0` 으로 안정화 확인.
- 오너 체감: 이날 급등락 알림 21건 도달(18 최초무장 + 3 마이그레이션). 다음 스캔부터는 임계 재돌파 시에만 발화.

### 검증
- pytest **114 통과**(급등락 12 + A접두 dedup 3 신규).
- **Puppeteer 스모크 `scripts/smoke-2026-07-30.js` 21/21 PASS** — 390×844 데모 모드에서 네비 스트립·센터링·◀▶ 이동·**버튼 피복 여부(elementFromPoint)**·로고 스타일·발굴탭 접힘·PEG 4요소·뷰 전환 왕복·JS 에러 0건.
  - ⚠️ 좌표 클릭 테스트는 ChangelogModal 스크림(z-9999)이 삼키므로 `daon_last_seen_version='dismissed'` sentinel 선행 필요.
- 다크모드 스크린샷으로 로고 흰테두리 소멸 육안 확인. 빌드 `index.html`·`sw.js` 해시 일치.
- 로컬 서버는 리포 루트 `daon.db`(=**개발용**, 전 계정이 test/demo)로 기동. 데모 진입이 demo 사용자 샘플 포트폴리오를 리셋했고 `integrity_check=ok`. 운영 DB는 Oracle 서버 별도.

---

## 🆕 2026-07-29 세션 (급등락 알림 — 보유·관심 ±5% 자동 감지)

**한 줄 요약**: "자기 전 / 눈 뜨자마자 시세 확인" 흐름 대응 — 종목별 등록 없이 **보유·관심 전체**를 훑어 일간 변동률 ±N%(기본 5%) 돌파 시 인앱 + Web Push 알림. PWA는 2026-05-29에 이미 활성화돼 있어 설치 관련 변경 없음(설치 절차만 안내).

- **DB**: `move_alert_prefs`(user_id PK · enabled · threshold_pct · scope) + `move_alert_state`(재발화 제어) 신규. `notifications.change_pct` 컬럼 ALTER(멱등). `kind`에 `surge`/`plunge` 추가.
- **판정 룰**(`_decide_move_alert`, 순수함수): 최초 돌파 발화 → 같은 방향은 임계만큼 더 벌어질 때만 재발화(−5% 후 −10%) → 방향 전환 즉시 발화 → 임계 아래로 되돌아오면 상태 삭제해 재무장. **KST 날짜 경계가 아니라 '되돌림'을 기준**으로 한 이유: 미국장은 마감 후 change_pct가 다음 개장까지 고정이라, 날짜 기준이면 자정마다 같은 알림이 중복 발화한다.
- **스캔**(`_run_move_scan`): 기존 5분 `check_alerts` cron에 편승(**cron 추가 없음**). 시세 호출 비용 억제를 위해 **15분 스로틀**(`settings.move_scan_at`) + 티커 상한 200(초과분은 응답 `move.truncated`로 노출 — 조용한 절단 금지). 목표가 스캔과 `quotes` dict 공유해 같은 티커 중복 조회 0.
- **기본 ON**: prefs 행이 없으면 `MOVE_ALERT_DEFAULTS`(켜짐·5%·보유+관심). 사용자가 아무것도 설정하지 않아도 동작한다.
- **API**: `GET/POST /api/alerts/move`. 저장 시 임계·범위가 바뀌면 `move_alert_state` 전삭제(옛 임계 기준 상태로 발화 막힘 방지).
- **UI**: 알림 벨 → 설정 탭 최상단 `MoveAlertSettings`(켜기/끄기 · 임계 프리셋 3/5/7/10% + 직접입력 · 대상 보유+관심/보유만/관심만). 알림 목록에 `급등`/`급락` 배지 + 변동률(`+6.2%` pos/neg 색). design.md R1/R1ب/R6 준수(4면 hairline · radius 4/2 · 좌측 색띠 없음 · 다문장 안내 `pre-line`).
- **검증**: pytest **111 통과**(`test_move_alerts.py` 12건 신규). 운영 daon.db **사본**에 마이그레이션 적용 확인(테이블 2개 + 컬럼 생성, 기존 데이터 무손상). 실 데이터(16티커·7사용자) 기준 스캔 5회 시뮬레이션 — 최초발화 2 → 유지 0 → 악화 1 → 회복 0 → 재돌파 1, 스로틀 동작까지 기대와 일치. 프론트 빌드 `index-DmmO9TTn.js`(index.html·sw.js 해시 일치).

---

## 🆕 2026-06-24~25 세션 (보유종목 분석 탭 대규모 개선 — 좌측 CLI)

**한 줄 요약**: 분석 탭 데이터 정합성 근본 수정(캐시 fingerprint·verified_facts 실시간 시세 권위화) + 분석탭 3장 재배치(B3) + 리스크 진단 카드 UI(R1 준수) + 배당/Health/전략 타임아웃 격리 + 전략 비동기화(524 해소) + 목표기반 방법론·필요 CAGR. **2-CLI 동시개발**(좌=보유종목 분석, 우=신규 종목 발굴) — 배포 클로버 방지 절차 확립.

- **한국 비상장 펀드 수동 기준가**: `portfolios.manual_price` 컬럼(ALTER 멱등) + `utils/effPrice`(라이브→수동→평단 우선순위) 전 surface 통일. HoldingsTab 수정 폼 입력칸. (404610 등 yfinance 미커버 대응)
- **은퇴기간·월납입 단일화**: GoalsCard가 목표시점→은퇴년수·월납입을 localStorage 공유. Portfolio Strategy Report는 중복 입력 제거 → 그 값 읽어 AI 분석만.
- **AI 리포트 정합성(핵심)**: ① 전략 캐시 `_strategy_fingerprint`에 수량·평단·현재가 포함(stale 리포트 차단, 회귀테스트 7건) ② **verified_facts 백엔드 실시간 시세 직접 조회(Phase 1)** — `_price_fast`/`_kr_price`로 평단가 폴백 deflate(NVDA 23%→5%) 차단, 앱 표와 일치 ③ 프롬프트 변수 바인딩 규칙(임의 숫자 금지) ④ 절세 스코프(US/KR 과세권 분리).
- **타임아웃 격리(셧다운 방지)**: `_as_completed_safe` 헬퍼로 모든 병렬 루프(배당·Health·전략 metrics, 18곳) 일괄 안전화 — 51종목 일부 미완료 시 TimeoutError로 엔드포인트가 죽던 버그(배당 조회 실패) 차단. Health Score 외부지표 전부 실패 시 분산·섹터집중 로컬 fallback.
- **전략 리포트 비동기화(524 해소)**: Cloudflare 100s 한도 초과 → POST는 백그라운드 생성 후 즉시 반환(`_strategy_jobs`) + `/strategy/poll` 폴링. 프론트 5초 간격 ~3.5분.
- **배당 캘린더**: 월별 → **분기 히스토그램(YY/NQ)**, 과거 이력 48개월·events 400건 확대. "현재 수량 기준 환산" 고지.
- **목표 기반 산정 근거**: `_project_goal` 방법론+학술/업계 레퍼런스(GBM 로그정규·Betterment 10/90·Kasten 2013) + 낙관/비관 80% 신뢰구간 + 쉬운 설명 + 행동 조언 + **목표 달성 필요 CAGR 역산**(`_required_cagr`, 회귀테스트 5건).
- **저점발굴 시계열 매칭**: `_discovery_candidates_by_horizon` — 단기(런웨이>3·바닥다지기>80)·중기(R&D 집중도)·장기(0% decay). 전략 프롬프트 주입 + 리포트 블록.
- **UI/UX**: 검증수치 프론트 숨김(백엔드 바인딩용 유지) · 분석탭 전 영역 문장 줄바꿈(BulletList·breakSentences) · 편집형 월배당 시뮬레이터(비중·배당률 즉시 재계산) · 리포트 분석 도출시각 우측 표기 · MD 생성일 KST 보정.
- **B3 — 분석탭 3장 재배치**: Ⅰ스냅샷(추이·배당·비중) / Ⅱ리스크 진단·건강도(Health·경고·백테스트) / Ⅲ액션&목표(목표기반·AI전략) + 장 구분 헤더.
- **[제2장] 리스크 진단 카드 UI**: 심각도별 카드(CRITICAL/MEDIUM 배지 + 제목 글자색 + ▪ 마커 + 카테고리). **design.md R1 준수** — Gemini 제안의 좌측 색 보더(border-left)는 R1 절대금지라 배지·글자색으로 대체.
- **인시던트**: 2026-06-24 Anthropic API 가용성 저하(500/529 + Bash 안전분류기 일시 불가) → [docs/INCIDENT_2026-06-24_anthropic_availability.md](docs/INCIDENT_2026-06-24_anthropic_availability.md). provider-side, 코드 무관.
- **테스트**: pytest 47 → **52 통과**(strategy_fingerprint 7 + goal_cagr 5 신규).
- **판단·반박(Gemini 3자 검증)**: ① verified_facts가 진실이라는 전제 반박 — 평단가 폴백이 deflate된 쪽 → 실시간 시세(~23%)로 바로잡음 ② "하드코딩 디커플링 리팩터링" 반박 — 이미 멀티테넌트(개인값 0건), 제안된 파일(config_loader/timeframe_engine 등) 미존재.

### 미결(다음 단계)
- **B2 풀 통합**(상용화 단계): 리스크 카드에 Claude 정성 진단 1:1 매칭(백엔드 알림↔AI문단 구조화) + 스냅샷/액션 섹션 통합.
- **SaaS 온보딩**(상용화 단계): `target_markets` 마스킹 + 리스크 성향 토글 → 발굴/추천 동적 연동.
- ~~**TrendsTab(시장 탭) R1 위반 2건**~~ **✅ 해결(2026-07-27)** — `.tt-index-card-accent`·`.tt-news-card`는 이미 4면 hairline으로 수정돼 있었음. 실제 잔존 위반은 `App.css .m3-card.is-emphasized`의 `border-left:3px m-primary`(미사용 죽은 CSS)였고 4면 accent 보더로 교체. R1 전면 grep 클린(나머지 border-left는 중립 구조선).
- **2-CLI 배포 규칙**: 한쪽만 배포하거나, 양쪽 모두 `fetch+merge origin/main → 재빌드 → 배포 → index.html·sw.js 번들 해시 일치 검증` 절차 준수(클로버 방지).

## 🆕 2026-06 세션 (상용화 + 로드맵 실행 + 보안)

**한 줄 요약**: 도메인·HTTPS 상용 배포 → Web Push·KR Fundamentals/Peers·모바일 스와이프·AI 주간 리밸런싱 로드맵 4건 → 가이드/여정 탭 최신화 → 보안 감사·하드닝. 문서·릴리스 반영 사이클 + 월간 클라우드 루틴 자동화.

- **도메인 + HTTPS 상용 배포**: daonwealth.com · Cloudflare(DNS/프록시) → nginx 리버스 프록시(443→8501) + Cloudflare Origin Cert(Full strict) · uvicorn `127.0.0.1` 바인딩(외부 직노출 차단). 설정: [deploy/](deploy/)
- **Web Push (V2)**: `push_subscriptions` 테이블 + VAPID 자동생성(`_get_vapid`) + `_send_push` + 엔드포인트 4종(`/api/push/public_key·subscribe·unsubscribe·test`) + `push-sw.js`(importScripts) + 알림벨 켜기/끄기·테스트 토글(`pushClient.js`). cron 알림 트리거 시 푸시 동반.
- **한국 종목 Fundamentals & Peers**: Naver 스크래핑 `_kr_fundamentals`(PER·PBR·ROE·시총·EPS·배당) + `_kr_peers`(동일업종비교). 프론트 게이트(`isUs`) KR 개방 + 통화 인식(₩ 조/억).
- **모바일 스와이프 탭 전환**: `useSwipeNav.js` — 좌우 스와이프로 인접 탭(BottomNav 순서). 차트 드래그·가로 스크롤·입력칸 충돌 가드. (풀투리프레시는 회귀 위험으로 보류)
- **AI 주간 리밸런싱**: `/api/cron/weekly_rebalance` + `_weekly_rebalance_for_user`(Haiku) → 인앱 알림 + 푸시. 서버 cron `0 9 * * 1`(월 KST 18시).
- **가이드 탭 최신화**: 탭명 전면 교체(포트폴리오·분석·종목·시장·등록·설정) + 가격알림/Web Push/배당/PWA/KR Valuation 추가.
- **여정 탭**: 로드맵 verdict 완료 4건 + 마일스톤 P30~P33 + 인프라(Cloudflare·nginx) 반영.
- **보안 감사(/security)**: 심각 0건. CORS `*`→daonwealth.com 제한, daon.db 644→600 즉시 조치. 중장기: 로그인 레이트리밋·관리자 2FA 권고.
- **운영 자동화**: 문서·릴리스 반영 사이클 문서화([docs/deployment.md](docs/deployment.md) 5.5) + 월간 릴리스 클라우드 루틴 등록(매월 1일 → 여정탭 PR).
- **캐시 워밍**: `daon-cache-warm.sh` cron(5분) — sector/kr·sector/us·heatmap 콜드(2~6초) 제거, 사용자 캐시 hit(~0.05초)만.
- **목표 기반 포트폴리오(GBI)**: `goals` 테이블 + `_project_goal`(결정론 중앙값+80% 밴드+달성확률) + `/api/goals` CRUD·project. `GoalsCard.jsx`(폼+Recharts fan+상태배지+권고+고지) → 분석 탭 NetWorth 아래. **새 탭 아님(발굴 탭과 충돌 회피)**. 격리 worktree에서 개발 후 발굴과 머지 배포.
- **신규 종목 발굴(GARP)**: 발굴 탭 + `/api/discover` + `discovery_scores` + GARP cron(다른 CLI 동시개발, 머지 통합).

## 🆕 2026-05-19 ~ 2026-05-21 세션 (대규모 업그레이드)
**자세한 내용**: [SESSION_2026-05-19.md](SESSION_2026-05-19.md)

**한 줄 요약**: 개인 앱 → 다중 사용자 가입 승인 + AI 권한 토글 + 동적 계좌 + Net Worth 추이 + Health Score + 룰 리밸런싱 + 상관관계 매트릭스 + 실적 캘린더 + 차트 비교 + 단축키 + Changelog + 자동 백업 cron + Puppeteer 회귀 테스트 시스템.

**신규 자산 (5/19 + 5/21 합산)**:
- 컴포넌트 18개 (Motion·시각화·관리·분석·UX)
- SQLite 테이블 7개 (`accounts`, `audit_log`, `strategy_cache`, `holding_notes`, `transactions`, `net_worth_snapshots`, `holding_pnl_snapshots`)
- API 40+ 신규
- 회귀 테스트 자동화 (`scripts/regression-test.js` — PASS ✅)
- 서버 cron job (매일 KST 04:00 daon.db 백업, 30일 보관)
- 인앱 Changelog 시스템 + 버전 단위 사용자 공지
- 백업 3개 (롤백 가능): `_backup/daon-pre-v2-`, `daon-pre-A-plan-`, `daon-pre-BCE-`

---

## 프로젝트 구조

```
쿠든카피 주식앱/
├── backend/
│   ├── main.py              ← FastAPI 서버 (28개 엔드포인트)
│   └── static/              ← Vite 빌드 산출물 (index.html + assets/)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          ← 루트 컴포넌트, 탭 라우팅
│   │   ├── store.js         ← Zustand 전역 상태
│   │   ├── api.js           ← Axios API 함수 모음
│   │   ├── App.css          ← 전역 스타일
│   │   ├── components/
│   │   │   ├── BottomNav.jsx / .css   ← 하단 10탭 네비게이션
│   │   │   ├── MarketBar.jsx          ← 상단 12개 지수 바
│   │   │   ├── LogoCircle.jsx         ← 종목 로고 원형 아이콘
│   │   │   └── Sparkline.jsx          ← 미니 스파크라인 차트
│   │   └── tabs/
│   │       ├── HoldingsTab.jsx        ← 보유 종목
│   │       ├── WatchlistTab.jsx       ← 관심 종목
│   │       ├── ExploreTab.jsx         ← 종목 탐색
│   │       ├── AllocationTab.jsx      ← 비중 분석 + AI 분석
│   │       ├── ChartTab.jsx           ← 캔들차트 + RSI + 실적
│   │       ├── TrendsTab.jsx          ← 트렌드 + 섹터 히트맵
│   │       ├── AddTab.jsx             ← 종목 추가
│   │       ├── ManageTab.jsx          ← 관리 (API Key, 데이터)
│   │       ├── GuideTab.jsx           ← 설명서
│   │       └── PresentationTab.jsx    ← 여정 탭
├── portfolio_data.json      ← 런타임 데이터 (절대 삭제 금지)
├── CLAUDE.md                ← AI 지침서
├── DEVELOPMENT_LOG.md       ← 이 파일
└── scripts/
    ├── deploy.ps1
    └── dev.ps1
```

---

## 탭 구성 (10개)

| 인덱스 | 아이콘 | 탭명 | 주요 기능 |
|--------|--------|------|-----------|
| 0 | 🏛️ | 보유 | 계좌별 종목 카드, 스파크라인, 클릭 → 차트이동 |
| 1 | 🔖 | 관심 | 관심종목 등록/삭제, 가격 조회 |
| 2 | 🧭 | 탐색 | 종목 검색, AI 분석, YouTube 분석 |
| 3 | ⚖️ | 비중 | 도넛차트, AI 포트폴리오 분석 (01~05) |
| 4 | 📊 | 차트 | SVG 캔들, MA20/60/120 실선, RSI, 거래량, 실적 |
| 5 | ⚡ | 트렌드 | 섹터 히트맵, 드릴다운 Top10, 거래량 순위 |
| 6 | 📌 | 추가 | 종목 수동 추가 |
| 7 | 🗂️ | 관리 | API Key 저장, 엑셀 업/다운로드, 종목 삭제 |
| 8 | 📋 | 설명서 | 탭별 사용 가이드 |
| 9 | 🗺️ | 여정 | 개발 히스토리, UI변천사, 통계, 마일스톤, 비교, 로드맵 |

---

## 핵심 아키텍처

### 상태 관리 (store.js — Zustand)
```js
{
  activeTab: 0,              // 현재 탭 인덱스
  chartTicker: null,         // 차트탭 표시 종목
  accFilter: '전체',         // 보유탭 계좌 필터
  viewMode: '평가액',        // 보유탭 뷰 모드
  sortOrder: '높은순',
  currencyMode: 'KRW',
  appMode: 'web',            // 'web' | 'app' (localStorage 유지)
  usdKrw: 1300,              // 환율 (서버에서 로드)
  anthropicKey: '',          // API Key (서버 portfolio_data.json에서 로드)
}
```

### API Key 흐름
- **저장**: `PUT /api/settings/apikey` → `portfolio_data.json`의 `settings.anthropic_key`
- **로드**: 앱 시작 시 `GET /api/settings/apikey` → Zustand store
- **사용**: 분석 요청 시 `req.api_key` 또는 백엔드 fallback `_stored_api_key()`
- **효과**: 모든 기기에서 한 번만 입력하면 영구 공유

### 캐시 TTL 정책 (backend/main.py)
| 함수 | TTL | 이유 |
|------|-----|------|
| get_market_data | 300s | 마켓 바 |
| get_us/kr_stock_data | 60s | 실시간성 |
| get_kr_stock_history | 1800s | 무거운 호출 |
| get_earnings_data | 3600s | 분기 데이터 |
| get_most_active_* | 1800s | 거래량 순위 |
| get_sector_performance | 1800s | 섹터 ETF |

---

## 누적 개발 내역 (최신 세션 기준)

### [세션 A] API Key 중앙화
- **변경 파일**: `store.js`, `App.jsx`, `api.js`, `ManageTab.jsx`, `backend/main.py`
- **내용**:
  - `store.js`: anthropicKey를 localStorage → 메모리 전용으로 변경
  - `App.jsx`: 앱 시작 시 `GET /api/settings/apikey`로 서버에서 자동 로드
  - `backend/main.py`: `GET/PUT /api/settings/apikey` 엔드포인트 추가
  - `ManageTab.jsx`: 저장 버튼 + 👁 show/hide 토글 추가 (중복 입력 방지)
  - analyze 엔드포인트 3개 모두 fallback `_stored_api_key()` 적용
- **버그 수정**: 오염된 키(중복 붙여넣기) 서버 API로 초기화 처리

### [세션 B] BottomNav 10탭 오버플로우 수정
- **변경 파일**: `BottomNav.css`, `BottomNav.jsx`
- **내용**:
  - `.bottom-nav`: `overflow-x: auto`, `scrollbar-width: none`
  - `.nav-btn`: `width: 62px; min-width: 62px` (고정 너비)
  - `useRef` 배열 + `scrollIntoView({ behavior: 'smooth', inline: 'center' })`
  - 이모지 세트: 🏛️🔖🧭⚖️📊⚡📌🗂️📋🗺️

### [세션 C] 트렌드탭 섹터 드릴다운
- **변경 파일**: `TrendsTab.jsx`, `backend/main.py`, `api.js`
- **내용**:
  - `US_SECTOR_TOP`, `KR_SECTOR_TOP` 딕셔너리 (11섹터 × 10종목) 하드코딩
  - `GET /api/sector/stocks/us/{sector}`, `GET /api/sector/stocks/kr/{sector}` 엔드포인트
  - 섹터 셀 클릭 → `selectedSector` 상태 → Top10 종목 애니메이션 패널
  - Yahoo Finance Screener 401 오류 → yfinance `download()` 대체
  - module-level `_onSectorClick` workaround (Recharts content prop 콜백 이슈)

### [세션 D] 종목 클릭 → 차트탭 이동
- **변경 파일**: `HoldingsTab.jsx`, `AllocationTab.jsx`
- **내용**:
  - `HoldingsTab`: 종목 행 클릭 → `setChartTicker(ticker)`
  - `AllocationTab`: 종목별 legend 클릭 → `setChartTicker(ticker)`
  - `store.js`: `setChartTicker: (tkr) => set({ chartTicker: tkr, activeTab: 4 })`

### [세션 E] PresentationTab (여정 탭) 전면 재구축
- **변경 파일**: `PresentationTab.jsx`
- **섹션 구성**: 개요 / UI변천사 / 통계 / 마일스톤 / 앱비교 / 로드맵
- **주요 내용**:
  - McKinsey 컨설팅 스타일 톤앤매너 (다크 Hero, 블루 accent bar, 대문자 레이블)
  - 기술 스택 5개 카테고리 분류 (Frontend/Backend/데이터수집/AI·분석/인프라)
  - UI 변천사: 가로 카드 5개 한눈에 비교 + 선택 시 상세 패널
  - 마일스톤: 날짜 제거 → Phase 1~12 단계 표기 (2026.02 시작 기준)
  - 앱 비교: 키움/토스/삼성/도미노/다온 5열 비교표
  - 로드맵: 예상 비용 / 개발 시간 / 고려 사항 3칸 메타 정보

### [세션 F] UI 세부 개선
- **HoldingsTab**: 📈 차트 / ✏️ 수정 버튼 제거 (행 클릭으로 대체)
- **AllocationTab**: AI 분석 레이블 `◈◇≋◉▷` → `01 02 03 04 05` 컨설팅 스타일
- **ChartTab**: MA20/60/120 점선 → 실선 (`strokeDasharray` 제거, `strokeWidth=1.8`)
- **ManageTab**: 섹션명 `🗃️ 데이터 관리`, API Key 저장 UI 개선
- **PresentationTab**: 어두운 배경 섹션 → 흰색 통일

### [세션 G] AI 분석 타임아웃 연장
- **변경 파일**: `api.js`, `backend/main.py`
- **내용**:
  - `analyzePortfolio` 타임아웃: 20s → **90s**
  - `analyzeStock`, `analyzeYoutube`: 20s → **60s**
  - 백엔드 Claude API `timeout=40` → **80s**, `timeout=30` → **60s**

---

## 디자인 시스템

```
배경:      #0B1120   카드:    #111C2D   테두리: #1E2D42
강세:      #00C48C   약세:    #FF5C5C   강조:   #0EA5E9
텍스트:    #E2E8F0   부가:    #94A3B8   어두운: #4B6080
차트배경:  #111C2D / #0D1829
폰트:      Inter (Google Fonts)
```

---

## 배포 명령어

```powershell
# 프론트엔드 빌드
cd "C:\Users\user\Desktop\쿠든카피 주식앱\frontend"
npm run build

# 서버 업로드 (JS 번들명은 빌드마다 변경됨)
scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "backend\static\index.html" `
  "backend\static\assets\index-XXXXXX.js" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/assets/

scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "backend\static\index.html" `
  ubuntu@168.107.13.20:~/portfolio/backend/static/

# 백엔드 업로드 (main.py 수정 시)
scp -i "C:\Users\user\Downloads\oracle-key.key" `
  "backend\main.py" `
  ubuntu@168.107.13.20:~/portfolio/backend/

# 서비스 재시작
ssh -i "C:\Users\user\Downloads\oracle-key.key" ubuntu@168.107.13.20 `
  "sudo systemctl restart portfolio"
```

---

## 다음 단계 계획

### Phase 13: 이메일 로그인/로그아웃 (완료 2026-03-30)

#### 목표
- 이메일 계정별로 개별 포트폴리오 데이터 관리
- 로그인/로그아웃 기능
- 계정별 `portfolio_data_{email}.json` 분리 저장

#### 구현 방향
1. **Backend**
   - `POST /api/auth/login` — 이메일 + 비밀번호 검증, JWT 토큰 발급
   - `POST /api/auth/logout` — 토큰 무효화
   - `GET /api/auth/me` — 현재 로그인 사용자 조회
   - `POST /api/auth/register` — 신규 계정 등록
   - 모든 portfolio 엔드포인트에 JWT 인증 미들웨어 적용
   - 사용자 DB: `users.json` 또는 SQLite

2. **Frontend**
   - `LoginPage.jsx` — 이메일/비밀번호 입력 폼
   - `store.js`: `currentUser`, `authToken` 상태 추가
   - 로그인 전: LoginPage 표시
   - 로그인 후: 기존 앱 표시
   - `ManageTab.jsx`: 로그아웃 버튼 추가

3. **데이터 분리**
   - `portfolio_data.json` → `portfolio_data_{user_id}.json` 또는 단일 파일 내 userId 키로 분리

#### 고려 사항
- 기존 `portfolio_data.json` 데이터 마이그레이션 필요
- JWT secret key 환경변수 처리
- 비밀번호 bcrypt 해싱
- 토큰 만료 처리 (자동 갱신 또는 재로그인 유도)

---

## 주요 버그 수정 이력

| 번호 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 1 | 한국 종목 ₩560억 오표시 | A005490을 미국 주식 오인 | 정규식 `^A?\d{6}$` |
| 2 | 캔들차트 무한 렌더링 | Recharts Customized 불안정 | 순수 SVG + ResizeObserver |
| 3 | 여정탭(10번째) 안 보임 | BottomNav 9등분 → 10탭 오버플로우 | overflow-x: auto, 62px 고정 |
| 4 | AI 분석 invalid x-api-key | API Key 중복 붙여넣기로 오염 | 서버 API로 초기화 + 👁 토글 |
| 5 | Yahoo Finance Screener 401 | Oracle 서버에서 인증 필요 | yfinance download() 대체 |
| 6 | index.html 누락 → 0.00% | JS만 업로드 | 배포 체크리스트에 index.html 추가 |
| 7 | AI 분석 timeout 20s 초과 | 종목 많을 때 Claude 응답 지연 | 90s/60s로 연장 |
| 8 | 시세 변동률 +25~+40% 비정상 | `_chart_to_price`가 `chartPreviousClose`(=1개월 전 종가) 사용 | `closes[-2]` (직전 거래일 종가) 우선 사용 |
| 9 | 다크모드 상단 바 흰색 잔존 | TopNavBar 배경 `rgba(248,250,252,.85)` 하드코딩 | `var(--clr-bg)` 사용, 라이트 테마만 투명도 유지 |
| 10 | 한국 종목 로고 폴백 색상만 표시 | Naver/Daum 기존 URL이 404 응답 | Toss CDN(`static.toss.im`) + Alphasquare(`file.alphasquare.co.kr`)로 교체 |
| 11 | AI 분석 결과 영문 사고과정 노출 | max_tokens=4096 부족 + 첫 `{...}` 매칭 실패 | Sonnet 4.6 + 8192 tokens + **마지막 text 블록** 우선 추출, JSON 파싱 실패 시 502 에러 |
| 12 | 모바일에서 웹 모드 UI 압축 | 데스크톱 사이드바·우측패널 강제 표시 | `window.innerWidth < 768`이면 앱 레이아웃 강제 |
| 13 | NVDA 클릭 시 빈 검정 화면 | **TDZ 위반** — `portfolioReady = !!portfolio`를 portfolio 선언(line 482)보다 50줄 앞(line 432)에서 사용 | useEffect 블록을 portfolio 선언 뒤로 이동 |

---

## 2026-05-10 세션 — UI/UX 대규모 개선

### 1. 한국 종목 로고 (`LogoCircle.jsx`)
- 6자리 코드 추출 후 **Toss CDN 1차 → Alphasquare 2차 → 색상 배지**
- `https://static.toss.im/png-icons/securities/icn-sec-fill-{code}.png`
- `https://file.alphasquare.co.kr/media/images/stock_logo/kr/{code}.png`
- 005380(현대차), 005930(삼성전자), 035720(카카오), 035420(네이버) 모두 200 OK 검증

### 2. TrendsTab 토글 정리
- 중복 US/KR 토글 1개로 통일 (Market Performance 카드 헤더)
- 기능 없던 1D/1W/1M/1Y/ALL 범위 토글 완전 삭제

### 3. 보유 탭 프라이버시 양방향 토글
- hero 카드 우측 상단 eye-icon 버튼 (가림↔표시)
- 본문 클릭으로도 가림 → 표시 가능 (단방향)
- localStorage 저장 제거 → 새로고침 시 항상 가림 상태로 복귀

### 4. 3-모드 테마 시스템
- **Light** (☀️ 화이트, 기본) / **Dark** (🌙) / **Pro** (📈 GitHub Dark + Bloomberg)
- `:root[data-theme='...']` 어트리뷰트 셀렉터로 60+ CSS 변수 일괄 오버라이드
- 인라인 하드코딩 색상 약 200개를 `var(--clr-...)`로 일괄 변환
- 접근: 관리 탭의 테마 카드 + 앱/웹 모드 우측 상단 빠른 토글

### 5. UI 잘림 방지
- `hero-value` 폰트 `clamp(22px, 8vw, 36px)` 반응형
- 좁은 화면(<480, <380, <340px)별 padding/font 단계 축소
- 모든 카드 `max-width: 100%; box-sizing: border-box`
- 모바일 자동 앱 레이아웃 (`<768px`)

### 6. 차트 시간 스케일 + 드래그 줌 (`ChartTab.jsx`)
- D/W/M 토글 — `aggregateOHLC()`로 일/주/월봉 집계
  - 주봉: ISO 주차(월요일 시작)
  - 월봉: YYYY-MM
  - 거래량 합산, high/low 구간 max/min
- SVG 마우스 드래그로 영역 선택 → 줌 인
- 더블클릭 또는 헤더 "↺ 줌 리셋" 버튼으로 복원

### 7. AI 분석 대폭 확장 (`backend/main.py` + `ChartTab.jsx`)
**모델**: Haiku 4.5 → **Sonnet 4.6** + Anthropic `web_search_20250305` (max_uses=4)

**컨텍스트 강화**:
- 가격, 펀더멘털(P/E, ROE, 매출 등), Yahoo 애널리스트 컨센서스, 최근 뉴스 5개

**새 응답 스키마**:
- `recommendation`, `priceTarget`, `summary`
- `company_overview` — 회사 동향·신사업·미래 전략
- `earnings_ir` — 분기 실적·CEO 발언·가이던스
- `catalysts_short` / `catalysts_medium` — 정량 단기/중기 호재
- `backlog` — 수주 잔고·RPO
- `analyst_views` — 최근 애널리스트 보고서 요약
- `bull` / `bear` / `verdict`
- `sources` — 클릭 가능한 출처 URL 리스트 (web_search 인용 자동 추출)

**캐시 메타데이터 + 미리보기**:
- `GET /api/stock/{ticker}/analyze/cached` — 캐시 조회 전용 (분석 트리거 X)
- `POST /analyze`에 `force_refresh: bool` 파라미터
- 응답에 `_cached`, `_computed_at` (epoch) 포함
- 프론트: 종목 진입 시 캐시 자동 fetch → 즉시 표시 + "마지막 분석: 3시간 전 · ↻ 최신 정보로 업데이트" 버튼
- 업데이트 클릭 시 confirm 다이얼로그

**한국어 강제**:
- 시스템 프롬프트: "ALL field values 한국어, no preamble, no markdown fence"
- 마지막 text 블록 우선 추출 (web_search 사고과정 텍스트 무시)
- JSON 파싱 실패 시 502 반환 (영문 raw 텍스트 캐시 오염 방지)

**프론트 UI**:
- `AiStockResult` 컴포넌트를 6개 접고-펼치는 섹션 카드로 분리
- 출처 섹션 — 도메인별 클릭 가능한 링크 (새 탭)
- axios timeout 60s → 200s

### 8. 백엔드 일간 변동률 정상화
- `_chart_to_price`에서 `chartPreviousClose` 우선 사용 → `closes[-2]` 우선 사용
- NVDA: +25.05% (월간 누적) → +0.5% (정상 일간)
- KOSPI/S&P500/모든 종목 정상화

### 9. PWA 캐시 + 모바일 자동 전환
- 모바일(<768px)에서 사용자 설정 무관하게 앱 레이아웃 강제
- 모바일에서 웹 모드 전환 버튼 숨김

---

## 2026-05-10 인시던트 — TDZ 무한 루프 → 빈 화면

**1차 증상**: NVDA 클릭 시 페이지 freeze. 1차 수정: useEffect deps에 `portfolio` 객체 → `portfolioReady` boolean으로 변경.

**2차 증상 (빈 화면)**: 시크릿 모드에서도 본문이 빈 검정. 백엔드 정상, sha 일치, sw.js 정상.

**근본 원인**: ChartTab 컴포넌트 내 변수 사용 순서 위반.
```js
const portfolioReady = !!portfolio   // line 432 — portfolio 사용
...
const { data: portfolio } = useQuery(...)  // line 482 — portfolio 선언 (50줄 늦음)
```

JavaScript `const`의 TDZ로 ReferenceError → React mount 실패 → 빈 화면. **빌드 통과** (esbuild는 동일 함수 내 변수 사용 순서 검사 안 함).

**해결**: cache fetch useEffect 블록을 portfolio 선언 뒤로 이동.

**교훈 → 자체 테스트 체크리스트 강화**:
1. 빌드 성공
2. 백엔드 syntax (`python3 -m py_compile`)
3. **변수 선언 순서 정적 검사** (TDZ 방지)
4. **useEffect deps에 객체/배열 참조 0건** (무한 루프 방지)
5. 배포 후 systemd `is-active`
6. 핵심 endpoint 헬스체크 (200 응답 시간)
7. journalctl 에러 0건
8. **로컬-서버 sha 일치** (배포 무결성)
9. **sw.js precache가 새 번들 참조** (PWA 업데이트)

---

## 2026-05-10 세션 변경 파일

| 파일 | 변경 |
|------|------|
| `backend/main.py` | `_chart_to_price` 일간 변동률, `_call_claude_with_search` 추가, `analyze_stock` 재작성, `/analyze/cached` 신규 |
| `frontend/src/store.js` | `theme` 상태(localStorage) + `cycleTheme` |
| `frontend/src/tokens.css` | `[data-theme='dark/pro']` 변수 오버라이드 + 인라인 셀렉터 보정 |
| `frontend/src/App.jsx` | 모바일 자동 감지(`isMobile`), 테마 적용 useEffect, ThemeQuickToggle |
| `frontend/src/App.css` | hero-value 반응형, 잘림 방지, 테마 보정 |
| `frontend/src/api.js` | `getCachedAnalysis`, `analyzeStock` timeout 200s |
| `frontend/src/components/LogoCircle.jsx` | Toss + Alphasquare 폴백 |
| `frontend/src/components/TopNavBar.jsx` + `.css` | 다크 모드 보정, 테마 빠른 토글 버튼 |
| `frontend/src/components/BottomNav.css` | 좁은 화면 라벨 잘림 방지 |
| `frontend/src/tabs/HoldingsTab.jsx` | 프라이버시 양방향 토글, 클릭 reveal, 한글 종목명 ellipsis |
| `frontend/src/tabs/TrendsTab.jsx` | 중복 토글 + 1D/1W/1M/1Y/ALL 제거 |
| `frontend/src/tabs/ChartTab.jsx` + `.css` | D/W/M, 드래그 줌, AI 분석 6개 섹션, 캐시 자동 fetch + 업데이트 버튼 |
| `frontend/src/tabs/ManageTab.jsx` | ThemeToggleCard 추가 |
| `frontend/src/tabs/AddTab.jsx`, `LoginPage.jsx`, `WatchlistTab.jsx`, `AllocationTab.jsx`, `GuideTab.jsx`, `PresentationTab.jsx`, `components/InstallPrompt.jsx`, `RightPanel.jsx` | 인라인 색상 → CSS 변수 일괄 변환 (테마 호환성) |

---

## 다음 세션 예정

**목표**: UI 모션 추가 (현재 정적 UI 개선)

**참고 리소스**:
- [21st.dev](https://21st.dev) — React 컴포넌트 컬렉션 (Magic UI, motion-primitives 등)
- `framer-motion` 또는 `motion` (Framer Motion 후속) 라이브러리
- 후보 작업 영역:
  - 탭 전환 트랜지션 (페이드/슬라이드)
  - 카드 등장 애니메이션 (stagger)
  - 숫자 카운트업 (hero-value, 손익 표시)
  - 차트 진입 애니메이션
  - 마우스 호버 마이크로 인터랙션
  - 페이지 전환 시 skeleton → content 페이드

**현재 적용된 애니메이션**:
- `flashUp/flashDn` 가격 변경 플래시 (tokens.css)
- `shimmer` 스켈레톤
- `rpPulse` 라이브 도트
- `slideUp` BottomNav 더보기 시트
- `transform: translateY(-1px)` 카드 hover


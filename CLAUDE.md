# 다온 (쿠든카피 주식앱) — Claude Code 인덱스

> 단일 거대 CLAUDE.md → **도메인별 분할 문서** 모듈화 (2026-05-29).
> 새 세션 진입 시 **이 인덱스만 자동 로드**되고, 필요한 도메인 .md를 골라 참조.

## 빠른 참조

| 분야 | 문서 | 언제 봐야 하나 |
|---|---|---|
| 시스템 구조 + DB 스키마 + Mermaid | [docs/architecture.md](docs/architecture.md) | 새 기능 추가 전, 흐름 파악 필요 시 |
| 엔드포인트 · 캐시 · AI 모델 | [docs/api.md](docs/api.md) | 백엔드 endpoint 추가/수정 시 |
| 디자인 시스템 (M3 + 핀테크) | [design.md](design.md) | 모든 UI 추가/수정 시 — **위반 절대 금지** |
| 배포 · cron · systemd | [docs/deployment.md](docs/deployment.md) | 빌드/배포/cron 작업 시 |
| 트러블슈팅 + 검증 체크리스트 | [docs/troubleshooting.md](docs/troubleshooting.md) | 변경 후 검증 + 함정 회피 |
| 시간순 변경 이력 | [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) | "언제 무엇이 바뀌었나" 추적 |
| 세션 핸드오프 | [SESSION_HANDOFF.md](SESSION_HANDOFF.md) | **새 세션 시작 시 가장 먼저** — 맨 위 "복구 순서" 5단계 |

## 절대 수정 금지 파일
- `daon.db` — 운영 SQLite DB. 코드로 직접 조작 금지. 백업 후 스키마 변경.
- `portfolio_data.json`, `users.json` — 마이그레이션 완료된 구버전.

## 작업 시작 전 필수 확인

1. **기능 추가 / 큰 변경** — `docs/architecture.md`로 영향 범위 파악 → 필요시 **Plan Mode 선행** (구조 먼저 합의)
2. **UI 추가/수정** — `design.md` 준수 (특히 **"🟥 AGENT 필수 규칙" R1~R6은 강제** — 둥근 AI-인사이트 카드 금지 / 차트 무채색 금지·CHART_COLORS / 도형 hover 금액 / 버튼 `.btn-primary` 단일 위계 / **R6 다문장 산문은 문장마다 줄바꿈(breakSentences·pre-line)·점수 나열 세로정렬** / 머지 전 self-check) + `docs/troubleshooting.md`의 UI 9 체크리스트. **머지 전 R1~R6 정적 grep 자가검증 필수.**
3. **백엔드 endpoint** — `docs/api.md`의 캐시 TTL · 인증 의존성 · 에러 처리 원칙 따름
4. **🟥 개인 데이터 격리 (강제)** — 2026-08-26 자산 노출 사고 재발 방지
   - **공유 캐시(`ai_cache`)에는 종목 분석(`stock_v2:`)만 넣는다.** 전략 리포트·포트폴리오
     분석 등 개인 스코프 결과는 `_PRIVATE_CACHE_PREFIXES` 로 차단되어 있으니 우회하지 말 것.
   - **캐시 키에 접두 검색(`LIKE 'x:%'`)을 새로 추가할 때는 그 접두가 공유 가능한지 먼저 따진다.**
     개인 키가 섞인 테이블에서 접두 검색을 하면 그 순간 남의 재무 데이터가 나간다.
   - **개인 값을 `localStorage` 에 저장하면 `store.js` 의 `PERSONAL_LOCAL_KEYS` 에 반드시 등록한다.**
     등록하지 않으면 로그아웃·계정 전환 후에도 남아 다음 사용자(데모 포함)에게 승계된다.
   - **개인 금액을 화면에 찍을 때는 반드시 `src/utils/privacy.js` 의
     `usePrivacy()` / `maskText()` 를 거친다.** 직접 `toLocaleString()` 해서 붙이면
     가림(privacy) 모드가 그 화면에서만 뚫린다 — 2026-08-27 확정된 노출 경로다.
     화면에는 '가림'이라고 표시되므로 안전하다고 믿게 되어 더 위험하다.
   - **채팅(`/api/chat`)**: 컨텍스트는 서버가 조립한다(프론트는 질문만 보냄) ·
     **데모 계정은 대화를 저장하지 않는다**(공용 계정이라 다음 방문자에게 보인다) ·
     응답은 프론트에서 `maskText` 통과 · 대화는 `chat_messages`(user_id) 에만.
   - **AI 답변을 화면용으로 쪼갤 때 마크업을 깨지 말 것** — `**강조**` 짝이 갈리면
     별표가 그대로 노출된다(2026-09-03 사고). 분해는 `utils/answerText.js` 하나만 쓰고,
     `node scripts/answer-split-check.mjs`(CI 포함)로 지킨다.
   - **길이 상한에 걸려 끊긴 답을 완성된 답처럼 보여주지 말 것** — `stop_reason` 을
     받아 화면에 '끊겼음'을 밝히고 이어받기를 준다.
   - 회귀 보호: `backend/tests/test_shared_cache_privacy.py` (공유 캐시에 개인 키가
     들어가거나 남아 있으면 실패) · `node scripts/privacy-scan.mjs`
     (가림 모드에서 전 탭 금액 노출 0건 확인).
5. **배포** — `docs/deployment.md`의 검증 체크리스트 모두 통과 후에만 "완료" 보고

## 🟥 숫자 규약 — 같은 이름은 같은 것을 가리킨다 (2026-09-14)

분석 탭이 1억 2,866만을 크게 띄우는데 포트폴리오 탭 총자산은 1억 3,472만이었다.
차이는 예수금 604만. **계산 실수가 아니라 이름이 문제였다** — 일별 스냅샷
(`net_worth_snapshots`)은 예수금을 저장한 적이 없어 그 숫자는 주식 평가액인데,
카드 제목이 '자산 추이'였다.

사용자는 계산을 검산하지 않는다. 두 화면을 나란히 볼 뿐이다.
**틀린 계산보다 같은 말로 다른 것을 가리키는 쪽이 더 위험하다.**

1. **금액을 화면에 띄울 때는 그것이 무엇인지 이름에 넣는다.**
   '자산'은 총자산(주식+예수금)만 쓴다. 주식만이면 '주식 평가액'이라고 쓴다.
2. **두 화면에 같은 이름의 숫자가 있으면 반드시 같은 식으로 계산한다.**
   한쪽만 예수금을 더하는 일이 없도록, 계산식은 한 곳에서만 정의한다.
3. **과거 데이터에 없던 값을 소급해 채우지 않는다.**
   예수금이 없는 과거 스냅샷에 오늘의 현금을 넣으면 없던 사실을 지어내는 것이다.
   컬럼을 추가해 오늘부터 쌓고, NULL(몰랐다)과 0(없었다)을 구분한다.
4. **회귀 보호**: `node scripts/number-consistency.mjs https://daonwealth.com`
   (`npm run guard:numbers`, `guard:all` 포함). 시세 변동 흡수를 위해 0.5% 허용 오차를
   두되, 예수금 누락(보통 3~5%)은 잡는다.

## 주 1회 자가발전 루프 (daon-radar)

2026-09-09 신설. 지인 피드백 10건이 전부 "먼저 찾을 수 있었던 것"이었기에 만들었다.
실행 지침은 [.claude/skills/daon-radar/SKILL.md](.claude/skills/daon-radar/SKILL.md),
기록은 [docs/RADAR.md](docs/RADAR.md).

```
cd scripts && npm run guard:all     # 답변분해 · 개인정보 · 첫사용UX(자기검사 포함)
```

- `--selftest` 에 🔴 가 하나라도 뜨면 **그 주 다른 작업보다 먼저 고친다.**
  규칙이 죽은 검사기는 초록불을 켜면서 결함을 통과시킨다.
- 바깥 조사 채택은 **주당 3건 상한**. "다온의 어떤 화면/함수가 바뀌나"를
  못 쓰면 기각하고, 기각도 이유와 다시 볼 조건을 남긴다.
- 로드맵 반영(`PresentationTab.jsx` 의 `ROADMAP`)까지가 루프의 일이고,
  **구현 착수는 오너의 별개 결정이다.**

## Plan Mode 권장 시나리오 (바이브 코딩 무기고)

복잡한 변경(여러 파일 + 여러 endpoint + DB 스키마)은 **즉시 코드 변경 금지**. Plan Mode로:
1. AI가 먼저 영향 범위 + 단계별 변경 계획 제시
2. 사용자 합의 후 코드 작업 진입
3. 작은 단위(1~3 파일) 변경은 Plan Mode 생략 가능

## TDD 원칙 (할루시네이션 필터)

`backend/tests/` pytest로 핵심 5건 회귀 보호:
- 환율 환산 · FIFO 실현손익 · A-prefix 정규식 · KR 가격 fallback · 알림 트리거 룰

새 백엔드 함수 추가 시 가능하면 단위 테스트 동반.

## 협업 스타일 (사용자 선호)
- 한국어 응답, 간결하게, 결과부터 → 근거
- 빌드 OK만으로 완료 보고 금지 — 정적/동적 검증 통과 후에만
- "왜?"에는 메커니즘 + 트레이드오프 함께 설명
- 모바일/PC 모두 지원하는 반응형이 기본 요구사항
- 사용자 발견 전에 정적 검증으로 잡아내기

## 마지막 대규모 작업
2026-07-29 — **급등락 알림**(보유·관심 일간 ±5% 자동 감지 → 인앱 + Web Push, 기존 5분 cron 편승·15분 스로틀). pytest 111 통과.
2026-05-29 — PWA 활성화 + 가격 알림 V1 인앱 + 배당금 카드 + 코드 스플릿(manualChunks + lazy) + KR 가격 stale-while-revalidate + 알림 시트 portal 수정 + CLAUDE.md 모듈화.
이전 이력은 [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).

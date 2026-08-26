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
   - 회귀 보호: `backend/tests/test_shared_cache_privacy.py` (공유 캐시에 개인 키가
     들어가거나 남아 있으면 실패) · `node scripts/privacy-scan.mjs`
     (가림 모드에서 전 탭 금액 노출 0건 확인).
5. **배포** — `docs/deployment.md`의 검증 체크리스트 모두 통과 후에만 "완료" 보고

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

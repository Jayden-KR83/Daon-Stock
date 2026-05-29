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
| 세션 핸드오프 | [SESSION_HANDOFF.md](SESSION_HANDOFF.md) | 세션 중단 복구 시 |

## 절대 수정 금지 파일
- `daon.db` — 운영 SQLite DB. 코드로 직접 조작 금지. 백업 후 스키마 변경.
- `portfolio_data.json`, `users.json` — 마이그레이션 완료된 구버전.

## 작업 시작 전 필수 확인

1. **기능 추가 / 큰 변경** — `docs/architecture.md`로 영향 범위 파악 → 필요시 **Plan Mode 선행** (구조 먼저 합의)
2. **UI 추가/수정** — `design.md` + `docs/troubleshooting.md`의 UI 9 체크리스트 두 군데 모두 준수
3. **백엔드 endpoint** — `docs/api.md`의 캐시 TTL · 인증 의존성 · 에러 처리 원칙 따름
4. **배포** — `docs/deployment.md`의 검증 체크리스트 모두 통과 후에만 "완료" 보고

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
2026-05-29 — PWA 활성화 + 가격 알림 V1 인앱 + 배당금 카드 + 코드 스플릿(manualChunks + lazy) + KR 가격 stale-while-revalidate + 알림 시트 portal 수정 + **CLAUDE.md 모듈화 (이번)**.
이전 이력은 [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).

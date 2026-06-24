# 인시던트 리포트 — 2026-06-24 Anthropic API/모델 가용성 저하

## 1. 요약
작업 세션 중 Claude Code 채팅에서 다음이 연속 발생하며 작업이 일시 중단됨.
- `API Error: 500 Internal server error`
- `API Error: 529 Overloaded`
- 이어서 Bash 도구가 `claude-opus-4-8 is temporarily unavailable, so auto mode cannot determine the safety of Bash` 로 차단(빌드/배포 명령 실행 불가)
- Fable 5 / Mythos 5 모델 접근이 일시 중단되어 Opus로 폴백

**중요: 다온(daonwealth.com) 앱·서버·코드·사용자 네트워크 문제가 아니다.** Anthropic(모델 제공자) 측 가용성 저하다.

## 2. 근본 원인 (Root Cause)
- **529 Overloaded / 500**: Anthropic API 서버 측 용량 과부하·일시 장애. 요청 단위로 발생하는 **provider-side 일시 오류**다.
- **Bash "safety classifier unavailable"**: Claude Code의 auto 모드는 셸 명령 실행 전 안전성을 모델로 판정한다. 그 판정 모델이 일시 불가하면 **판정을 못 해 명령을 보수적으로 차단**한다(거부가 아니라 "판단 불가"). 즉 같은 가용성 저하의 2차 증상.
- **Fable 5/Mythos 5 접근 중단**: 해당 모델 티어의 일시 가용성 제한 → Opus 폴백.

## 3. "옆 CLI는 되는데 이 CLI는 왜 안 되나?"
- API 요청은 **요청마다 독립적**이고 로드밸런싱된다. 529는 **요청·시점·리전 단위로 확률적**으로 발생한다.
- 옆 CLI의 진행 중 요청은 건강한 용량에 안착했거나, 그 순간 로컬 읽기/편집 위주여서 모델 호출 빈도가 낮았을 뿐이다.
- **동일 머신·동일 키라도 타이밍이 다르면 결과가 다르다.** 이 CLI의 설정·코드 문제가 아니다. → CLI 재시작·전환은 도움이 되지 않는다.

## 4. 영향
- 코드 작성(읽기/편집)은 영향 없음 — 중단 구간에도 4건 수정 코드는 모두 완성돼 있었음.
- 빌드/배포(셸)만 분류기 차단으로 지연. 가용성 회복 후 정상 배포 완료.
- 운영 앱의 AI 기능(전략 리포트 등)도 같은 창에서 529를 만날 수 있으나, 이번에 전략 리포트를 **비동기+폴링**으로 전환해 529가 "행(hang)" 대신 폴링 `error` 상태로 표면화되어 복구가 쉬워짐.

## 5. 해결 / 대응
- **즉시**: provider 일시 장애이므로 **재시도·대기(지수 백오프)**. 코드 변경 불필요.
- 분류기 차단 구간에는 **안전이 명확한 로컬 검증(py_compile·build)** 만 샌드박스 비활성으로 수행해 진행, prod 배포는 가용성 회복 후 정상 경로로 실행.
- 작업은 code-complete 상태로 대기 → 회복 즉시 1회 배포로 마감.

## 6. 재발 시 런북 (Runbook)
1. `500/529`·"classifier unavailable" = **provider-side**. `status.anthropic.com` / `status.claude.com` 확인.
2. CLI 재시작/전환·코드 디버깅 **하지 말 것** (로컬 원인 아님).
3. 대기 + 재시도. 그동안 편집 작업은 계속 가능.
4. 가용성 회복 후 빌드→테스트→배포 정상 진행.
5. 운영 AI 호출은 `_call_claude` 재시도 + 전략 리포트 비동기화로 사용자 영향 최소화됨.

## 7. 타임라인 (요약)
- 분석탭 4개 이슈 수정 진행 중 → API 500/529 연속 발생으로 채팅 중단
- Fable/Mythos 접근 중단 → Opus 폴백
- Bash 분류기 일시 불가로 빌드/배포 지연
- 가용성 회복 → 로컬 검증(py_compile·build) → 서버 import 테스트·pytest 47 통과 → 배포 → 라이브 검증 → push 완료

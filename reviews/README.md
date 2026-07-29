# 다온 UI/UX 3자 검증 (Gemini) — 사용 가이드

목적: daon 앱의 웹/모바일 UI·UX를 **독립 3자(Gemini)** 관점에서 감사받고,
그 findings를 **Claude와의 판정 절차**로 걸러 필요한 것만 과감히 반영한다.

## 왜 Gemini인가 / 한계
- Gemini는 daon을 **실행·클릭할 수 없다.** hover·탭·전환·성능은 못 본다.
  → 스크린샷 품질이 리뷰 품질을 결정하고, 상호작용 기반 지적은 판정 단계에서 걸러야 한다.
- 일반론으로 daon의 **의도적 결정**(design.md R1~R6)을 되돌리려는 오지적이 나온다.
  → `design.md`를 반드시 함께 준다.

## 준비물 (리뷰 패킷)
1. **스크린샷** — `SHOTLIST.md` 체크리스트대로 모바일(360~400px)+데스크톱, 라이트/다크.
   툴팁·펼침 등 상호작용으로만 보이는 것은 **열린 상태**로 캡처.
2. **제약 문서** — 리포 루트 `design.md` (팀의 의도적 결정).
3. **브리프 + 프롬프트** — `GEMINI-UX-REVIEW.md` (앱 정체성 + 리뷰 지침).
   ※ 편향 방지를 위해 Claude의 의견/결론은 패킷에 넣지 않는다.

## 절차
1. **캡처**: `SHOTLIST.md`를 따라 스크린샷을 `reviews/out/shots/`에 저장.
   - 인증 불필요 화면(로그인·네비·발굴 등)은 Claude 하네스로도 생성 가능.
   - 인증·실데이터 화면(포트폴리오·분석)은 오너가 실앱에서 캡처.
2. **리뷰 요청 (권장: 2패스)** — Google AI Studio(aistudio.google.com), Gemini 2.5 Pro급:
   - **패스 1 (블라인드)**: 스크린샷 + `GEMINI-UX-REVIEW.md`만 → 순수 지적.
   - **패스 2 (제약)**: 여기에 `design.md`를 추가 → "이 제약 하에서도 유효한 것"만 재정리.
3. **결과 저장**: Gemini 출력을 `reviews/out/gemini-findings-<날짜>.md`로 저장.
4. **판정**: Claude가 `ADJUDICATION-TEMPLATE.md` 양식으로 각 findings를 5분류
   (수용 / 규칙 재고 / 기각-주관 / 기각-오독 / 이미 반영)하고 근거를 단다.
5. **반영**: '수용'·'규칙 재고(오너 승인)'만 코드에 반영. design.md R5 self-check + 360px 검증 필수.

## 파일
| 파일 | 용도 |
|---|---|
| `GEMINI-UX-REVIEW.md` | Gemini에 붙여넣을 브리프 + 리뷰 프롬프트 |
| `SHOTLIST.md` | 스크린샷 캡처 체크리스트 (화면·폭·상태) |
| `ADJUDICATION-TEMPLATE.md` | findings 판정 양식 (Claude 작성) |
| `out/` | 캡처 스샷·Gemini 원본·판정 결과 보관 |

# 다온 MCP 서버 — Claude로 보유종목 일괄 분석 (복붙 0)

기존 "API 호출(느림·비용)" / "JSON 복붙 import(수작업)"을 대체합니다.
Claude Desktop이 **다온 보유종목을 직접 읽고 → web_search로 분석 → 결과를 다온 캐시에 직접 저장**합니다.
저장 즉시 다온 종목 탭에서 `cached`로 표시됩니다.

```
[Claude Desktop] ──(MCP)──> daon_mcp_server.py ──(HTTPS+토큰)──> 다온 서버
   "보유종목 분석해서 저장해줘"
        │ list_holdings()      ← 보유 목록 읽기
        │ get_analysis_schema() ← 저장 형식 확인
        │ (web_search 분석)
        └ save_analysis(...)    → 캐시에 저장
```

> **역할분담**: LLM 분석 = Claude Desktop(MCP), UI/기능 = Claude Code. API 비용 0 · throttle 무관 · 복붙 0.

---

## 1. 설치

Python 3.10+ 필요.

```powershell
cd "C:\Users\user\Desktop\쿠든카피 주식앱\mcp_server"
python -m pip install -r requirements.txt
```

## 2. 토큰 발급 (admin 계정)

MCP 서버는 본인의 **세션 Bearer 토큰**으로 다온에 접근합니다. (30일 유효)

가장 쉬운 방법:
1. 브라우저에서 다온(http://168.107.13.20:8501)에 **admin 계정으로 로그인**
2. `F12` → **Application** 탭 → 좌측 **Local Storage** → `http://168.107.13.20:8501`
3. `authToken` 값(긴 hex 문자열)을 복사

> 토큰 = 계정 전체 권한. 외부에 공유 금지. 만료 시 다시 로그인해 갱신.

## 3. Claude Desktop 연결

`claude_desktop_config.json` 에 추가 (Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "daon": {
      "command": "python",
      "args": ["C:\\Users\\user\\Desktop\\쿠든카피 주식앱\\mcp_server\\daon_mcp_server.py"],
      "env": {
        "DAON_BASE_URL": "http://168.107.13.20:8501",
        "DAON_TOKEN": "여기에_복사한_authToken"
      }
    }
  }
}
```

저장 후 **Claude Desktop 재시작**. 도구(🔌)에 `daon` 의 `list_holdings`/`get_analysis_schema`/`save_analysis`가 보이면 성공.

## 4. 사용

Claude Desktop에서:

> 다온에서 get_work_plan으로 아직 분석 안 된(pending) 종목만 받아서, get_analysis_schema 형식대로 web_search 분석한 뒤 5개씩 save_analysis로 저장해줘.

끝. 다온 종목 탭을 열면 분석 결과가 cached로 떠 있습니다.

> 핵심: **get_work_plan** 을 먼저 부르면 이미 분석된 종목을 건너뛰어 훨씬 빠르고 깔끔합니다.

---

## 도구

| 도구 | 설명 |
|---|---|
| `get_work_plan()` | **분석 필요한 종목만**(pending) + 이미 캐시된 ticker. 가장 먼저 호출 권장 |
| `list_holdings()` | 보유 종목 전체 (ticker·name·market·accounts·수량) |
| `get_analysis_schema()` | 저장 형식(stock_v2) + 필드 설명·예시 |
| `save_analysis(items, overwrite=False)` | 분석 결과를 캐시에 저장. items=[{ticker, name, data}]. 5~10개씩 권장 |

## 보안

- 토큰은 `env`에만 두고 코드/깃에 커밋 금지.
- 분석 저장은 **admin 토큰 전용**(`/api/admin/ai_cache/import`는 `is_admin` 검사).
- 다온 서버는 HTTP(평문)라 토큰이 네트워크에 노출됨 — 향후 도메인+HTTPS(Cloudflare) 적용 시 안전성↑.

## Cowork / 원격 환경

이 V1은 **로컬 stdio** 서버라 Claude Desktop(같은 PC)에서 동작합니다.
클라우드 Cowork(원격)에서 쓰려면 동일 도구를 HTTP/SSE MCP 트랜스포트로 **오라클 서버에 호스팅**하는 V2가 필요합니다 — 필요 시 추가 작업으로 진행.

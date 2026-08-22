# TRD — Standin (스탠드인)

> Technical Requirements Document — 심사 AI가 읽는 기술 문서이자 **원샷 구현의 유일한 스펙**.
> 참조 아키텍처: github.com/devkimchi/battle-school-lunch (강사 예제) —
> 단, 모델 연결은 Foundry 대신 **GitHub Copilot SDK**(팀 Copilot Max 계정)로 교체.
> 아래 모든 패키지 버전·클래스명·API는 2026-08-22 PyPI/GitHub에서 실물 검증됨. 추측 없음.

## 0. 검증된 사실 (이 문서의 전제)

| # | 사실 | 검증 방법 |
|---|------|-----------|
| F1 | `agent-framework-github-copilot==1.0.3` (PyPI 최신) = AF↔Copilot SDK 공식 어댑터. `from agent_framework.github import GitHubCopilotAgent, GitHubCopilotOptions` | PyPI README 원문 |
| F2 | 어댑터는 `github-copilot-sdk==1.0.2`를 **정확히 고정** 의존 → sdk를 별도 핀하면 충돌. pyproject에 sdk를 직접 적지 말 것 | PyPI requires_dist |
| F3 | sdk 1.0.2는 **Copilot CLI 바이너리를 wheel에 번들** (manylinux_2_28_x86_64 97MB 포함) → 컨테이너에서 다운로드 단계 불필요, 오프라인 동작 | PyPI wheel 목록 |
| F4 | 비대화형 인증: `COPILOT_GITHUB_TOKEN`(또는 GH_TOKEN/GITHUB_TOKEN) 환경변수 지원. `CopilotClient(github_token=...)` kw 존재 | sdk README |
| F5 | `MCPStreamableHTTPTool`은 `agent_framework` 코어에서 임포트. 시그니처: `MCPStreamableHTTPTool("name", url, allowed_tools=[...], approval_mode="never_require", load_prompts=False)` | 강사 예제 data.py L13,58 |
| F6 | `ConcurrentBuilder(participants=[...]).with_aggregator(Executor)` 패턴은 `agent-framework-orchestrations==1.0.1` | 강사 예제 workflow.py |
| F7 | Aspire 13은 Python 앱을 **자동 컨테이너화** (Dockerfile 불필요). 강사 예제의 Dockerfile은 선택적 커스터마이징(`publishAsDockerFile()`) | Aspire 공식 블로그 "Python is First Class in Aspire 13" + 강사 슬라이드 "Dockerfile 필요 없음" |
| F8 | apphost.mts API: `createBuilder`, `addAzureContainerAppEnvironment`, `addParameter(name,{value,secret:true})`, `addUvicornApp(...).withUv()`, `addViteApp`, `withEnvironment`, `getEndpoint('http')`, `withExternalHttpEndpoints()` | 예제 apphost.mts 원문 |
| F9 | aspire CLI 13.5.2 설치 완료 (공식 스크립트, brew formula 없음) | 로컬 실행 |

## 1. 시스템 아키텍처

```text
브라우저
  └─ web (React+Vite+TS, nginx 컨테이너, ACA external ingress)
       └─ /agent/* 를 agent 서비스로 리버스 프록시 (같은 오리진 → CORS 자체가 없음)
            └─ agent (Python·FastAPI·Agent Framework + GitHubCopilotAgent)
                 ├─ 모델 연결: Copilot SDK (팀 Max 계정, COPILOT_GITHUB_TOKEN)
                 ├─ MCP Streamable HTTP → mcp 서비스 (check_redlines, make_ics)
                 └─ 3 아바타 동시 평가 → 결정적 판정(코드) → Facilitator 브리핑
Aspire AppHost(apphost.mts, TypeScript)가 web/agent/mcp 오케스트레이션
Azure Container Apps: web=external, agent/mcp=internal
```

서비스는 정확히 **3개** (web/agent/mcp). DB·큐·캐시·Foundry·Azure OpenAI 없음
(모델 접근은 Copilot SDK가 유일 — 불필요 Azure 서비스 추가는 심사 감점).

## 2. 서비스 & 확정 스택

| 서비스 | 스택 | 로컬 | 프로덕션 |
|--------|------|------|----------|
| web | React 19 + Vite + TypeScript + Tailwind | :5173 (vite dev proxy `/agent`→127.0.0.1:8002) | nginx :8080, `/agent/` → AGENT_UPSTREAM (`proxy_buffering off` — SSE 필수) |
| agent | Python 3.12 · FastAPI · uvicorn | :8002 | ACA internal :8000 |
| mcp | Python 3.12 · `mcp` SDK · Streamable HTTP | :8001/mcp | ACA internal :8000/mcp |
| apphost | `apphost.mts` (TypeScript Aspire) | `aspire run` 대시보드 | `aspire deploy` |

**agent pyproject.toml 의존성 (이대로만 적을 것 — sdk 직접 핀 금지, F2):**

```toml
requires-python = ">=3.12"
dependencies = [
    "agent-framework-github-copilot==1.0.3",   # pulls agent-framework-core>=1.15 + github-copilot-sdk==1.0.2 (CLI bundled)
    "agent-framework-orchestrations==1.0.1",
    "fastapi==0.138.0",
    "pydantic-settings>=2.5",
    "tzdata>=2026.1",
    "uvicorn[standard]>=0.32",
]
```

mcp pyproject: `mcp>=1.27,<2`, `uvicorn[standard]`, `fastapi`(헬스체크용) 만.

## 3. 필수 기술 사용법 (심사 1번 항목 25%)

### 3.1 Copilot SDK = 유일한 모델 연결 (검증된 임포트)

```python
from agent_framework.github import GitHubCopilotAgent, GitHubCopilotOptions

avatar = GitHubCopilotAgent(
    name=f"avatar-{card.name}",
    instructions=render_avatar_instructions(card),   # instructions/avatar.md 템플릿
)
result = await avatar.run(prompt)   # 응답 텍스트 → JSON 파싱 → Pydantic 검증
```

- 다른 LLM 프로바이더 SDK/키는 repo 어디에도 없어야 함.
- 인증: 환경변수 `COPILOT_GITHUB_TOKEN` (Copilot **Max 구독이 있는 계정**의 토큰).
  발급: 팀장 맥에서 `gh auth token` 출력값 사용. 로컬 개발은 `copilot` CLI 로그인 재사용 가능.
- **Gate 0 (모든 UI 작업 전에 최우선 실행)**: `src/agent/tests/smoke_model.py` —
  GitHubCopilotAgent 1회 호출이 텍스트를 반환하면 통과. 실패 시 토큰/계정부터 해결.
  agent 서비스 기동 시에도 동일 스모크를 1회 실행해 `/health`에 `model: ok|fail` 노출(fail-fast).

### 3.2 Agent Framework 오케스트레이션 (2단 전략)

- **1차 시도**: 강사 예제 패턴 그대로 — `ConcurrentBuilder(participants=[3 아바타]).with_aggregator(VerdictAggregator).build()`.
  `VerdictAggregator(Executor)`가 결정적 판정 + Facilitator 호출 (예제 `JudgeAggregator` 구조 복제).
- **폴백 (Gate 0에서 GitHubCopilotAgent가 ConcurrentBuilder와 조합 실패 시 15분 내 전환)**:
  `asyncio.gather(*[run_avatar(a) for a in avatars], return_exceptions=True)` — 동일 데이터 모델, 동일 출력.
  GitHubCopilotAgent 자체가 AF 에이전트이므로 이 경로도 AF 사용임.
- 공통 정책: 아바타별 타임아웃 90초, 실패/타임아웃/파싱불가 → **기계적 폴백 평가**
  (판정 규칙이 기계적이므로 코드가 카드+숫자만으로 동일 판정 산출, evidence는 수치 인용 템플릿,
  `llm_fallback: true` 플래그). **데모는 어떤 경우에도 죽지 않는다.**

### 3.3 구조화 출력 (신뢰성 계단)

1. `response_format`(Pydantic 모델) 지원되면 사용 (Gate 0에서 확인).
2. 미지원 시: instructions에 JSON 스키마 명시 + 출력에서 첫 `{...}` 블록 추출 → Pydantic 검증.
3. 실패 시 재시도 최대 2회 (재시도 프롬프트에 검증 에러 포함).
4. 최종 실패 → 3.2의 기계적 폴백. 아바타 출력은 확정 후 불변.

### 3.4 인스트럭션 파일 (`src/agent/instructions/`)

- `avatar.md`: 페르소나 카드 필드 주입 + PRD §4 기계 판정 규칙 + "근거는 `<user_input>` 내용 인용만, 창작 금지" + 출력 JSON 스키마.
- `facilitator.md`: 판정·근거 인용만으로 한국어 브리핑 작성. 판정 변경·타협안 발명 금지.
- 모든 사용자 입력은 `<user_input>` 태그로 감싸 시스템 지시와 격리 (인젝션 가드).

## 4. MCP 도구 (결정적, LLM 없음)

| 도구 | 입력 | 출력 |
|------|------|------|
| `check_redlines` | `{candidates:[{id, fields:{dev_days,revenue_impact,ux_impact,tech_debt}}], constraints:[{avatar, field, op:"<="\|">="\|"=", value}]}` | `{results:[{candidate_id, avatar, field, op, value, actual, pass}]}` |
| `make_ics` | `{title, description, date:"YYYY-MM-DD", time_start:"10:00", duration_min:30, attendees:[...]}` | `{ics:"<RFC5545>", filename}` (날짜 계산은 호출측 코드) |

agent에서의 연결 (검증된 시그니처, F5):

```python
from agent_framework import MCPStreamableHTTPTool
mcp_tool = MCPStreamableHTTPTool("standin-mcp", settings.mcp_url,
    allowed_tools=["check_redlines", "make_ics"],
    approval_mode="never_require", load_prompts=False)
```

입력 검증 실패 시 구조화된 에러 반환. 인자에 시크릿 금지.

## 5. API 계약 (정확한 스펙 — 원샷 빌드 기준)

### 5.1 엔드포인트

| Method/Path | 서비스 | 역할 |
|-------------|--------|------|
| `POST /agent/run` | agent | 본 실행. 응답 = SSE 스트림 (`text/event-stream`) |
| `GET /health` | 셋 다 | `{status:"ok", model:"ok"\|"fail"(agent만)}` |

### 5.2 `POST /agent/run` 요청 (Pydantic 검증: 문자열 길이 ≤500, 숫자 0~100, 후보 정확히 3, 아바타 정확히 3)

```json
{
  "agenda": "다음 스프린트 기능 우선순위",
  "expected_minutes": 60, "attendees": 3,
  "candidates": [
    {"id":"A","name":"간편 온보딩","fields":{"dev_days":6,"revenue_impact":3,"ux_impact":5,"tech_debt":2}},
    {"id":"B","name":"결제 연동","fields":{"dev_days":9,"revenue_impact":5,"ux_impact":2,"tech_debt":3}},
    {"id":"C","name":"관리자 대시보드","fields":{"dev_days":12,"revenue_impact":2,"ux_impact":2,"tech_debt":4}}
  ],
  "avatars": [
    {"name":"Yehoshua","role":"COO","top_priority":"revenue_impact","hard_constraints":[{"field":"dev_days","op":"<=","value":10}]},
    {"name":"Caleb","role":"Developer","top_priority":"tech_debt","hard_constraints":[{"field":"tech_debt","op":"<=","value":4}]},
    {"name":"Samuel","role":"Designer","top_priority":"ux_impact","hard_constraints":[{"field":"ux_impact","op":">=","value":2}]}
  ]
}
```

(위 값이 그대로 "샘플로 시작" 프리셋. 기대 결과: A=RESOLVED, B=CONTESTED(Samuel 우려), C=REJECTED — PRD §4와 동일해야 함.)

### 5.3 SSE 이벤트 (POST라 EventSource 불가 → fetch ReadableStream 파싱)

```text
event: phase          data: {"phase":"received|evaluating|verdict|briefing|done|error"}
event: avatar_result  data: AvatarEval (아바타 완료마다 1건)
event: heartbeat      data: {}          (10초마다 — 프록시 idle timeout 방지)
event: final          data: RunResult
```

응답 헤더: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`X-Accel-Buffering: no`. nginx 프록시에 `proxy_buffering off; proxy_read_timeout 300s;`.

### 5.4 데이터 모델 (단일 소스 `src/agent/app/models.py`, `src/web/src/types.ts` 미러)

```ts
type Fields = { dev_days:number; revenue_impact:number; ux_impact:number; tech_debt:number };
type Candidate = { id:"A"|"B"|"C"; name:string; fields:Fields };
type Constraint = { field:keyof Fields; op:"<="|">="|"="; value:number };
type Avatar = { name:string; role:string; top_priority:keyof Fields; hard_constraints:Constraint[] };
type AvatarEval = { avatar:string; candidate_id:string;
  verdict:"ACCEPT"|"ACCEPT_WITH_CONCERNS"|"REJECT";
  evidence:string; cited_constraint?:string; llm_fallback:boolean };
type CandidateOutcome = { candidate_id:string; status:"RESOLVED"|"CONTESTED"|"REJECTED";
  reasons:string[]; matrix:{avatar:string; constraint:string; pass:boolean}[]; needs_review:boolean };
type RunResult = { outcomes:CandidateOutcome[]; briefing_md:string; decision_record_md:string;
  ics?:{filename:string; content:string};
  receipt:{ expected_person_minutes:number; measured_seconds:number;
            note:"잠재 절감 추정치, 검토 비용 미포함" } };
```

### 5.5 판정 (앱 코드가 최종 권한 — LLM 아님)

`check_redlines` 결과 기준: 하드 위반 1개↑ → REJECTED / 하드 전원통과 + 아바타 전원 plain ACCEPT → RESOLVED / 하드 전원통과 + 우려 1개↑ → CONTESTED (익일 10:00 KST 30분 회의 .ics 생성).
LLM 판정과 코드 판정 불일치 → 코드 우선 + `needs_review: true`.

## 6. 컨테이너화 — **Dockerfile 없이 간다** (F7)

- **기본 경로(1순위, 이것으로 구현할 것)**: Dockerfile을 만들지 않는다.
  apphost에서 `addUvicornApp(...).withUv()` / `addViteApp(...)`만 선언하면
  Aspire 13이 배포 시 컨테이너 이미지를 자동 생성한다 (uv 의존성 설치 + uvicorn 진입점 포함).
  원샷 빌드에서 파일 수를 줄이는 것이 성공률에 직결되므로 이 경로를 택한다.
- **아키텍처 주의 (Apple Silicon 필수)**: ACA는 linux/amd64. `aspire deploy`가 로컬 docker 빌드를 쓰므로
  M-시리즈 맥에서는 배포 전 `export DOCKER_DEFAULT_PLATFORM=linux/amd64`.
  amd64로 빌드해야 uv가 x86_64 wheel(=x86_64 Copilot CLI 바이너리, F3)을 설치한다. **이건 Dockerfile 유무와 무관하게 필요.**
- **폴백 (자동 빌드가 실패할 때만)**: 강사 예제 패턴으로 서비스별 Dockerfile 추가 +
  apphost에서 `.publishAsDockerFile(c => c.withDockerfile('./src', {dockerfilePath:'agent/Dockerfile'}))`.
  예제 패턴 = `python:3.12-slim-bookworm` 멀티스테이지, `COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv`,
  non-root appuser, `EXPOSE 8000`, `uvicorn app.main:app --host 0.0.0.0 --port ${PORT}`.
- web은 Vite 빌드 산출물을 nginx로 서빙. `/agent/`를 AGENT_UPSTREAM으로 프록시하며
  **SSE 때문에 `proxy_buffering off; proxy_read_timeout 300s;` 필수** (§5.3).
  nginx 설정 커스터마이즈가 필요하므로 **web만은 Dockerfile+nginx.conf를 둘 수 있다** (자동 생성이 SSE 버퍼링을 못 끄면).

## 7. apphost.mts (예제 원문 API만 사용, F8 — Foundry 블록 전부 제거)

```ts
import { createBuilder } from './.aspire/modules/aspire.mjs';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) loadEnvFile('.env');

const builder = await createBuilder();
const aca = await builder.addAzureContainerAppEnvironment('aca');
const copilotToken = await builder.addParameter('copilot-github-token',
  { value: process.env.COPILOT_GITHUB_TOKEN, secret: true });

const mcp = await builder.addUvicornApp('mcp', './src/mcp', 'app.main:app').withUv()
  .withHttpHealthCheck({ path: '/health' }).withComputeEnvironment(aca);

const agent = await builder.addUvicornApp('agent', './src/agent', 'app.main:app').withUv()
  .withEnvironment('MCP_URL', mcp.getEndpoint('http'))
  .withEnvironment('COPILOT_GITHUB_TOKEN', copilotToken)
  .withReference(mcp).waitFor(mcp)
  .withHttpHealthCheck({ path: '/health' }).withComputeEnvironment(aca);

await builder.addViteApp('web', './src/web')
  .withEnvironment('AGENT_UPSTREAM', agent.getEndpoint('http'))
  .withReference(agent).waitFor(agent)
  .withComputeEnvironment(aca).withExternalHttpEndpoints();

await builder.build().run();
```

Dockerfile 선언(`publishAsDockerFile`)은 넣지 않는다 — Aspire가 자동 컨테이너화(§6).
자동 빌드 실패 시에만 §6 폴백을 적용.

`.env`(gitignore): `COPILOT_GITHUB_TOKEN=...` — apphost가 `loadEnvFile`로 읽어 secret parameter로 주입.

## 8. 실행 & 배포 (단일 승인 경로)

```bash
# ── 로컬 개발 — 터미널, 한 줄씩 ──
aspire run
# 정상: 대시보드 URL 출력 + web/agent/mcp 3개 Running. http://localhost:5173 열어 [샘플로 시작] E2E 확인.

# ── 배포 — 터미널, 한 줄씩 ──
az login                                        # 정상: 브라우저 인증 후 구독 목록
export DOCKER_DEFAULT_PLATFORM=linux/amd64      # Apple Silicon 필수 (§6)
aspire deploy
# 정상: ACR 빌드/푸시 → ACA 생성 → 서비스별 URL 출력. web URL이 제출용 배포 URL.
```

배포 직후: web URL 열어 샘플 플로우 E2E → Playwright 스모크 1회. 철회는 `aspire destroy`(승인 후에만).

## 9. 테스트 (타임박스)

1. **Gate 0** (최우선): 모델 스모크 — 통과 전 UI 금지.
2. 단위: 판정 진리표(RESOLVED/CONTESTED/REJECTED), check_redlines 비교연산, 기계적 폴백, ics.
3. E2E: Playwright 1본 — 홈 → [샘플로 시작] → SSE 진행 표시 → 결과 매트릭스 → .ics/결정기록 노출.

## 10. 시간 초과 시 컷 순서 (품질 게이트)

| 순서 | 컷 | 유지되는 것 |
|------|-----|------------|
| 1 | Facilitator LLM → 결정적 한국어 템플릿 브리핑 | 3 아바타 Copilot 에이전트(핵심 심사 근거) |
| 2 | ConcurrentBuilder → asyncio.gather 폴백 고정 | AF 사용(GitHubCopilotAgent+MCPTool) 유지 |
| 3 | .ics/결정기록 다운로드 버튼 → 인라인 텍스트 표시 | 산출물 자체는 유지 |
| 절대 컷 금지 | — | 3 아바타 병렬 평가, 결정적 판정, MCP check_redlines, 샘플 프리셋, 무로그인, Azure 배포 |

## 11. 결정 기록

| 결정 | 이유 | 트레이드오프 |
|------|------|--------------|
| 백엔드 Python | AF↔Copilot 어댑터가 Python 전용 (F1) | repo에 TS(web)+Py 혼재 |
| sdk 버전은 어댑터에 위임 (1.0.2) | 어댑터가 `==1.0.2` 강제 (F2), 직접 핀 시 충돌 | 최신 sdk(1.0.11) 기능 미사용 |
| Dockerfile 없이 Aspire 자동 컨테이너화 | 강사 슬라이드 + Aspire 13 공식 문서가 자동 생성 보장 (F7). 파일 수↓ = 원샷 성공률↑ | 빌드 세부 제어 불가 → 실패 시 §6 폴백으로 전환 |
| 판정은 코드, LLM은 평가·브리핑만 | 타협안 발명 방지 (책임 AI 6%) | 아바타는 자유 협상자가 아님 |
| 기계적 폴백 평가 | 데모 무중단 (완성도 16%) | 폴백 시 evidence가 템플릿 문체 |
| 같은 오리진 프록시 (CORS 미사용) | 설정 실수 원천 차단 | nginx 설정 1블록 추가 |
| 인메모리 rate limit (8KB/1동시/10회·h·IP) | 무로그인 공개 엔드포인트 가드, DB 없이 | 재시작 시 리셋(허용) |

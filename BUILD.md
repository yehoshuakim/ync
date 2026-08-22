# BUILD — 원샷 실행 지침 (3대 기기 동시)

> 이 파일은 **팀 내부용 실행 매뉴얼**이다. 심사 대상 문서는 `PRD.md` / `TRD.md`.
> 목적: 현빈·건주·사무엘이 각자 기기에서 **동일한 프롬프트**로 원샷 구현 →
> 셋 중 가장 잘 나온 결과를 채택 → 수정·검증 → 배포.

## 0. 시작 전 각자 기기에서 (터미널, 한 줄씩)

```bash
git clone https://github.com/yehoshuakim/ync.git
```

```bash
cd ync
```

→ 정상: `ls` 했을 때 `PRD.md TRD.md BUILD.md HACKATHON.md AGENTS.md` 가 보인다.
**이 폴더가 곧 저장소 루트다. `matdathon` 하위 폴더는 없다.**

```bash
curl -sSL https://aspire.dev/install.sh | bash
```

→ 정상: `Aspire CLI successfully installed to: ~/.aspire/bin/aspire`.
**여기서 터미널을 새로 열고** 다음 줄로.

```bash
aspire --version
```

→ 정상: `13.5.2` 같은 버전 번호. `command not found`면 `source ~/.zshrc` 후 재시도.

```bash
copilot
```

→ Copilot CLI가 뜨면 `/login` 으로 로그인. **Copilot Max 쿠폰이 적용된 계정**이어야 함.
로그인 확인 후 `/exit`.

```bash
gh auth token
```

→ 정상: `gho_...` 로 시작하는 토큰 1줄 출력.
아무것도 안 나오면 `gh auth login` 먼저.

**여기서 바로 `.env`를 만든다. 원샷 프롬프트보다 먼저다** — Gate 0(실제 Copilot
호출 검증)이 토큰 없이는 통과할 수 없어서, 나중에 만들면 에이전트가 첫 관문에서 멈춘다.

```bash
printf 'COPILOT_GITHUB_TOKEN=%s\n' "$(gh auth token)" > .env
```

```bash
grep -c COPILOT_GITHUB_TOKEN .env
```

→ 정상: `1`. (`.gitignore`가 `.env`를 막고 있으니 커밋될 걱정 없음.
확인: `git status --short` 에 `.env`가 **안 보여야** 정상.)

각자 브랜치를 나눠서 충돌을 막는다 (터미널, 한 줄씩):

```bash
git checkout -b oneshot-hyunbin
```

(건주는 `oneshot-gunju`, 사무엘은 `oneshot-samuel`)

## 1. 원샷 프롬프트 (Copilot App/CLI에 **통째로 복붙**)

아래 블록 전체를 복사해서 한 번에 붙여넣는다. 중간에 질문이 오면 답하지 말고
`계속 진행해` 라고만 하고, 끝날 때까지 개입하지 않는다.

---

```text
이 저장소 루트의 PRD.md 와 TRD.md 를 처음부터 끝까지 정독한 뒤,
그 문서에 정의된 웹 서비스 "Standin"을 한 번에 전부 구현해라.
저장소 루트의 AGENTS.md 의 규칙을 반드시 따른다.
.env 파일에 COPILOT_GITHUB_TOKEN 이 이미 준비되어 있다. 새로 만들지 말고 그대로 써라.

절대 조건 (하나라도 어기면 실격):
- 로그인/인증/회원가입/세션/쿠키/localStorage/API키 입력창을 절대 만들지 마라.
  접속 즉시 모든 기능이 동작해야 한다. 아바타는 그냥 폼 입력값이며 서버에 저장하지 않는다.
- 모델 호출은 GitHub Copilot SDK(agent-framework-github-copilot)로만 한다.
  OpenAI/Azure OpenAI/Anthropic 등 다른 LLM provider SDK나 API 키를 절대 쓰지 마라.
- Microsoft Agent Framework를 핵심 경로에 쓴다.
- 시크릿을 코드에 하드코딩하지 마라. 환경변수 COPILOT_GITHUB_TOKEN 만 쓴다.
- 서비스는 정확히 3개(web/agent/mcp). DB·큐·캐시·Foundry·Azure OpenAI를 추가하지 마라.

구현 순서를 반드시 이 순서로 지켜라:
1) src/agent 최소 구성 + tests/smoke_model.py 를 먼저 만들고 실행해서
   GitHubCopilotAgent 호출 1건이 텍스트를 반환하는지 확인해라(Gate 0).
   여기서 실패하면 UI를 만들지 말고 원인을 보고해라.
2) src/mcp (check_redlines, make_ics)
3) src/agent 본체 (아바타 3 동시 평가 → 결정적 판정 → facilitator → SSE)
4) src/web (PRD 6장 화면 스펙 그대로. 색상·문구·상태·검증 메시지까지 그대로)
5) src/web/Dockerfile + src/web/nginx.conf.template (TRD 6.1/6.2 그대로 — SSE 버퍼링 차단용)
6) apphost.mts (TRD 7장 그대로. agent/mcp는 Dockerfile 없음, web만 publishAsDockerFile)
7) aspire run 으로 로컬 E2E 확인

지켜야 할 핵심 구현 규칙:
- 판정(RESOLVED/CONTESTED/REJECTED)은 반드시 앱 코드가 계산한다. LLM 판정을 그대로 쓰지 마라.
- 아바타 응답 파싱 실패/타임아웃 시 TRD 3.2의 규칙 기반 폴백으로 결과를 만들어라. 화면이 비어서는 안 된다.
- 사용자 입력은 프롬프트에 넣기 전에 XML 이스케이프(&, <, >)하거나 json.dumps로 직렬화해라.
  태그로만 감싸면 </user_input> 주입을 막지 못한다.
- 필드 방향을 지켜라: revenue_impact/ux_impact는 높을수록 좋고, dev_days/tech_debt는 낮을수록 좋다.
  우려 조건은 "높을수록 좋은 top_priority가 2 이하" 또는 "낮을수록 좋은 top_priority가 4 이상"이다.
- 전체 실행 마감은 45초다. asyncio.wait_for로 감싸고, 넘으면 규칙 기반 폴백으로 채워 final을 보내라.
- rate limit은 서버 전체 동시 12건 / IP당 시간당 60회로 하고, 429에 Retry-After를 붙여라.
  "1분에 한 번" 같은 좁은 제한을 절대 넣지 마라. 심사 AI 여러 대가 같은 IP로 동시에 들어온다.
- 결과 출처 라벨을 구분해라: AI 평가 / MCP 검증 / 앱 코드 판정 / 규칙 기반 대체.
- 퍼실리테이터 마크다운을 dangerouslySetInnerHTML로 렌더하지 마라. 텍스트로 이스케이프해서 렌더해라.
- 토큰 값을 응답·로그·에러 메시지에 절대 출력하지 마라.
- SSE 응답 헤더에 Cache-Control: no-cache 와 X-Accel-Buffering: no 를 넣고,
  10초마다 heartbeat 이벤트를 보내라.
- 첫 화면에 PRD 4장의 샘플 프리셋이 이미 채워져 있어야 한다(타이핑 0회로 실행 가능).
- 헤더에 "AI 생성 결과 — 검토 후 사용하세요" 배지를 두되, 결정적 판정에는 "앱 코드 판정" 칩을 써라.
- 반응형(모바일 1단/데스크톱 2단)과 aria 속성을 PRD 6장대로 구현해라.

완료 후 다음을 순서대로 실행하고 결과를 보고해라:
- aspire run 이 정상 기동하는지
- http://localhost:5173 에서 샘플 실행이 끝까지 되는지 (판정 A=합의, B=사람회의, C=폐기)
- 실패한 항목이 있으면 고쳐서 다시 확인

문서에 없는 내용을 임의로 발명하지 말고, 애매하면 PRD/TRD의 문구를 그대로 따라라.
과도하게 복잡하게 만들지 말고, 문서에 적힌 범위만 정확히 구현해라.
```

---

## 2. 토큰 재확인 (0장에서 이미 만들었음)

```bash
git status --short
```

→ 정상: 목록에 `.env`가 **없다**. 보이면 즉시 `.gitignore`에 `.env` 추가 후 재확인.

## 3. 로컬 확인 (터미널)

```bash
aspire run
```

→ 정상: 대시보드 URL + web/agent/mcp 3개가 Running. 브라우저에서 web URL 열고
`[프리플라이트 실행]` 한 번 눌러 A=합의 / B=사람 회의 / C=폐기가 나오면 성공.

## 4. 3인 결과 비교 → 채택 (현빈 판단)

| 체크 | 확인 방법 |
|------|-----------|
| Gate 0 통과 | smoke_model.py 가 텍스트 반환 |
| 로그인 요소 0 | 화면에 로그인/가입 버튼이 없음 |
| 샘플 0클릭 실행 | 새로고침 직후 바로 실행 버튼 클릭 가능 |
| 판정 3종 정확 | A 합의 / B 사람회의 / C 폐기 |
| 스트리밍 보임 | 아바타 카드가 하나씩 채워짐 |
| 모바일 | 창 좁혀도 깨지지 않음 |

가장 많이 통과한 브랜치를 `main`에 병합하고, 나머지 두 명은 그 브랜치로 갈아탄 뒤
부족한 항목만 나눠서 고친다 (역할 분담은 HACKATHON.md 6장).

## 5. 배포 (팀장 기기에서만, 터미널 한 줄씩)

```bash
az login
```

→ 정상: 브라우저 인증 후 구독 목록 출력.

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
```

→ 정상: 출력 없음. (Apple Silicon 필수. 이 줄과 다음 줄은 **같은 터미널 창**에서 실행)

```bash
aspire deploy
```

→ 정상: 이미지 빌드/푸시 → ACA 생성 → 서비스 URL 출력. **web URL이 제출용 배포 URL.**

### 5.1 콜드스타트 제거 (심사 중 타임아웃 방지 — 필수)

리소스 그룹 이름은 `aspire deploy` 출력에 나온다. 아래를 그 값으로 바꿔 실행:

```bash
az containerapp update -n web -g <리소스그룹> --min-replicas 1
```

```bash
az containerapp update -n agent -g <리소스그룹> --min-replicas 1
```

→ 정상: JSON 출력의 `provisioningState: Succeeded`.
(Azure Portal에서 해도 됨: Container App → Scale → Min replicas = 1)

### 5.2 심사자 접근 검증 (제출 전 필수 — 규칙 7)

배포 URL을 **시크릿 창 + 모바일 데이터(회사 와이파이 아님)** 로 열고 확인:

| 확인 | 통과 기준 |
|------|-----------|
| 로그인/가입/쿠키 배너/CAPTCHA | 하나도 안 뜬다 |
| 첫 화면 | 샘플이 이미 채워져 있다 |
| 실행 | 클릭 1번으로 45초 안에 A=합의 / B=사람회의 / C=폐기 |
| 연속 실행 | 5회 연속 눌러도 429가 안 뜬다 |
| 모바일 폭 | 360px에서 가로 스크롤이 없다 |

```bash
curl -s -o /dev/null -w '%{http_code}\n' <배포URL>/health
```

→ 정상: `200`. agent 상태는 화면 하단 또는 `/agent/health`에서 `model: ok` 확인.
**`model: fail`이면 실제 Copilot 호출이 안 되고 있는 것이므로 제출하지 말고 토큰부터 고친다.**
로컬에서만 되는 데모는 제출 자격이 없다.

## 6. 제출 (팀장 계정)

https://matdaaiga.kr/matdathon/issues → "결과 제출":
앱 제목 `Standin` / repo URL / **커밋 해시** / **배포 URL**.
1차는 15:00 전후로 먼저 내고 점수를 본 뒤, 16:10까지 2차(최종)를 낸다.
**2차 제출이 최종 점수**이므로 2차 직전에 배포 URL 재확인 필수.

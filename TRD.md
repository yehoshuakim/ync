# TRD — Standin (스탠드인)

> Technical Requirements Document. Judges' AI agents read this as the primary
> technical source. Repo root, next to `PRD.md`. Reference architecture:
> github.com/devkimchi/battle-school-lunch (Matdathon instructor example),
> adapted: model connection is **GitHub Copilot SDK** (not Foundry).
> All package names/versions below verified against npm/PyPI on 2026-08-22.

## 1. System architecture

```text
Browser
   └─ web (React + Vite + TS, external ingress, nginx in container)
        └─ /agent/run  (POST, SSE over fetch-stream response)
             └─ agent service (Python · FastAPI · Microsoft Agent Framework
                               + GitHub Copilot SDK via agent-framework-github-copilot)
                  ├─ model connection: GitHubCopilotAgent (Copilot SDK, team
                  │    Copilot Max account via COPILOT_GITHUB_TOKEN)
                  ├─ MCP Streamable HTTP → mcp service (check_redlines, make_ics)
                  └─ workflow: 3 concurrent avatar agents → deterministic
                       verdict (app code) → facilitator fan-in
Aspire AppHost (apphost.mts, TypeScript) orchestrates: web, agent, mcp
Azure: Container Apps environment — web external, agent/mcp internal
```

Exactly **3 services** (web / agent / mcp). No DB, no queue, no cache, no
Foundry/Azure OpenAI (model access is entirely through the Copilot SDK; adding
unused Azure AI services would be a judged deduction).

## 2. Services & stack (verified packages)

| Service | Stack | Local endpoint | Role |
|---------|-------|----------------|------|
| web | React 19 + Vite + TypeScript + Tailwind | http://localhost:5173 | input UI, SSE progress, verdict matrix, results |
| agent | Python 3.12 · FastAPI · uvicorn · `agent-framework` (PyPI 1.15.0) · `agent-framework-github-copilot` (PyPI 1.0.3) · `github-copilot-sdk` (PyPI 1.0.11, pulled as dep) | http://127.0.0.1:8002 | avatar workflow, deterministic verdict, SSE streaming |
| mcp | Python 3.12 · `mcp` SDK (>=1.27,<2) · Streamable HTTP · uvicorn | http://127.0.0.1:8001/mcp | tools: `check_redlines`, `make_ics` — deterministic, no LLM |
| apphost | Aspire TypeScript AppHost (`apphost.mts`) | dashboard | orchestration + `aspire deploy` to ACA |

Python everywhere on the backend because `agent-framework-github-copilot`
(the official AF↔Copilot SDK bridge) is Python-only. Package layout mirrors
the instructor example: `src/web`, `src/agent` (uv project), `src/mcp`
(uv project), root `apphost.mts`.

## 3. Required-tech usage (judging item 1, 25%)

- **GitHub Copilot SDK** = the ONLY model connection. The agent service builds
  every agent as `GitHubCopilotAgent` from `agent_framework.github`
  (package `agent-framework-github-copilot`), which drives the bundled
  Copilot CLI over JSON-RPC using the team's Copilot Max account.
  No other LLM provider SDK/key anywhere in the repo.
- **Microsoft Agent Framework** = agent definitions (3 avatars + facilitator),
  concurrent fan-out/fan-in workflow, MCP tool binding, streaming events.
  Pattern named for judges: *Concurrent specialists + custom aggregator*.
- **Instruction engineering**: files under `src/agent/instructions/`:
  - `avatar.md` (template): role header + persona card fields injected as
    variables + mechanical verdict rules (PRD §4) + "evidence may only quote
    `<user_input>` content; never fabricate" + output schema.
  - `facilitator.md`: quote-only briefing rules; may not alter verdicts.
- **Auth (verified from github/copilot-sdk docs)**: SDK supports non-interactive
  auth via env var **`COPILOT_GITHUB_TOKEN`** (also `GH_TOKEN`/`GITHUB_TOKEN`).
  Locally it can reuse `copilot` CLI login; on Azure the token is injected as
  an Aspire secret parameter. Billing = team's Copilot Max allowance.

## 4. MCP tools (deterministic, no LLM inside)

| Tool | Input (JSON) | Output (JSON) | Notes |
|------|--------------|---------------|-------|
| `check_redlines` | `{candidates: [{id, fields: {dev_days, revenue_impact, ux_impact, tech_debt}}], constraints: [{avatar, field, op: "<="\|">="\|"=", value}]}` | `{results: [{candidate_id, avatar, field, op, value, actual, pass}]}` | pure comparison; unknown field/op → structured error |
| `make_ics` | `{title, description, date: "YYYY-MM-DD", time_start: "10:00", duration_min: 30, attendees: [names]}` | `{ics: "<RFC5545 text>", filename}` | meeting fixed to next day 10:00 KST (computed by caller code, not the tool) |

Rules: tools validate inputs and return structured errors; no secrets in
arguments; agent may call tools only through MCP (Streamable HTTP).

## 5. Agent workflow (maps to PRD §4)

1. `POST /agent/run` body = `{agenda, expected_minutes, attendees, candidates[3], avatars[3]}` — validated by Pydantic (lengths, numeric ranges); every user string later wrapped in `<user_input>` tags.
2. **Fan-out**: 3 avatar agents run concurrently (`asyncio.gather`), each a
   `GitHubCopilotAgent` with `avatar.md` instructions + its persona card.
   Output = structured JSON (Pydantic-validated):
   `{candidate_id, verdict: ACCEPT|ACCEPT_WITH_CONCERNS|REJECT, evidence, cited_constraint?}` × 3 candidates. Retry once on schema failure; outputs immutable afterwards.
3. **Deterministic verdict (app code, authoritative)**: calls `check_redlines`
   via MCP; computes per candidate: REJECTED (any hard violation) /
   RESOLVED (3× plain ACCEPT) / CONTESTED (hard pass + ≥1 concern).
   LLM-vs-code mismatch → code wins + `needs_review: true` tag.
4. **Fan-in**: facilitator agent writes the Korean briefing from verdicts +
   quoted evidence (may not change them).
5. Deterministic packaging: decision-record markdown, `.ics` via `make_ics`
   (next day 10:00 KST), time receipt (`expected_minutes × attendees` vs
   measured wall-clock seconds).
6. **SSE stream** (fetch-stream, NOT EventSource since it's a POST):
   events `phase` (`received → evaluating → verdict → briefing → done|error`),
   `avatar_result` (per avatar as each finishes), `final` (full result JSON).

## 6. Data models (single source: `src/agent/app/models.py`, mirrored in `src/web/src/types.ts`)

```ts
type Candidate = { id: "A"|"B"|"C"; name: string;
  fields: { dev_days: number; revenue_impact: number; ux_impact: number; tech_debt: number } };
type Constraint = { field: keyof Candidate["fields"]; op: "<="|">="|"="; value: number };
type Avatar = { name: string; role: string; top_priority: keyof Candidate["fields"];
  hard_constraints: Constraint[] };
type RunRequest = { agenda: string; expected_minutes: number; attendees: number;
  candidates: Candidate[]; avatars: Avatar[] };
type AvatarEval = { avatar: string; candidate_id: string;
  verdict: "ACCEPT"|"ACCEPT_WITH_CONCERNS"|"REJECT"; evidence: string;
  cited_constraint?: string };
type CandidateOutcome = { candidate_id: string;
  status: "RESOLVED"|"CONTESTED"|"REJECTED"; reasons: string[];
  matrix: { avatar: string; constraint: string; pass: boolean }[];
  needs_review: boolean };
type RunResult = { outcomes: CandidateOutcome[]; briefing_md: string;
  decision_record_md: string; ics?: { filename: string; content: string };
  receipt: { expected_person_minutes: number; measured_seconds: number;
    note: "잠재 절감 추정치, 검토 비용 미포함" } };
```

## 7. Environment & secrets

| Var | Consumer | Notes |
|-----|----------|-------|
| `COPILOT_GITHUB_TOKEN` | agent | team-account token for Copilot SDK; local dev may omit (SDK reuses `copilot` CLI login); on Azure injected as Aspire secret parameter. NEVER committed |
| `MCP_URL` | agent | injected by Aspire service reference |
| `AGENT_URL` | web (vite proxy / nginx) | injected by Aspire |

`.env` gitignored. Abuse guard in agent service: request body ≤ 8 KB,
1 concurrent run per client IP, 10 runs/hour/IP (in-memory counters — no DB).

## 8. Run & deploy

```bash
# prerequisites (once) — terminal, line by line
curl -sSL https://aspire.dev/install.sh | bash   # aspire CLI (brew has no formula)
aspire --version                                  # expect a version number

# local — terminal, line by line
npm install          # root apphost deps
aspire run           # starts web+agent+mcp; expect dashboard URL in output
# open http://localhost:5173 → click [샘플로 시작] → full flow works

# deploy — terminal, line by line
az login             # expect browser auth + subscription listed
aspire deploy        # expect ACA provisioning, then app URLs; web is external
```

After deploy: open the web URL, run the sample flow end-to-end, then Playwright
smoke test against the deployed URL. `/health` endpoint on all 3 services.

## 9. Testing (time-boxed)

- **Gate 0 (BEFORE any UI work)**: minimal script `src/agent/tests/smoke_model.py`
  — one `GitHubCopilotAgent` call returns text. Proves SDK auth + AF bridge.
- Unit: verdict computation (RESOLVED/CONTESTED/REJECTED truth table),
  `check_redlines` comparisons, ics generation.
- E2E: one Playwright script — home → [샘플로 시작] → result matrix rendered →
  approve → downloads present.

## 10. Decisions & trade-offs

| Decision | Reason | Trade-off |
|----------|--------|-----------|
| Python backend (not Node) | `agent-framework-github-copilot` bridge is Python-only (verified on PyPI) | two languages in repo (TS web, Py services) |
| Copilot SDK via env-token auth | non-interactive, works on ACA; verified in SDK docs | token must be provisioned as secret at deploy time |
| No Foundry/Azure OpenAI | contest requires Copilot SDK as model layer; unused Azure AI = deduction | none |
| Verdict in app code, not LLM | prevents invented compromises; judging item 6 | avatars are evaluators, not free negotiators |
| SSE over fetch-stream on POST | EventSource can't POST; single request carries full input | manual stream parsing in web (small util) |
| Fixed columns/constraint format | one-shot buildable UI + parseable `check_redlines` | less flexible input (roadmap item) |
| In-memory rate limit | no-login public endpoint abuse guard without DB | resets on restart (acceptable) |

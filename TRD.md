# TRD — {App Name}

> Technical Requirements Document. Judges' AI agents read this as the
> primary technical source. Keep in repo root next to `PRD.md`.
> Reference architecture: github.com/devkimchi/battle-school-lunch (Matdathon instructor example).

## 1. System architecture

```text
Browser
   └─ web (React + Vite, external ingress)
        └─ /agent  (POST + SSE streaming)
             └─ agent service (Microsoft Agent Framework + GitHub Copilot SDK)
                  ├─ model connection: GitHub Copilot SDK chat client
                  ├─ MCP Streamable HTTP → mcp service (domain tools)
                  └─ concurrent specialist agents → judge fan-in
Aspire AppHost (apphost.mts, TypeScript) orchestrates: web, agent, mcp
Azure: Container Apps environment — web external, agent/mcp internal
```

Keep it to **3 services** (web / agent / mcp). Do not add a separate API
service, database, queue, or cache unless a P0 feature requires it
(judges deduct for meaningless Azure services).

## 2. Services & stack

| Service | Stack | Local endpoint | Role |
|---------|-------|----------------|------|
| web | React 19 + Vite + TypeScript, Tailwind | http://localhost:5173 | input UI, streaming progress, results |
| agent | {Python 3.12 + agent-framework + copilot-sdk / or Node + TS equivalents} | http://127.0.0.1:8002/agent | multi-agent workflow, SSE streaming |
| mcp | {Python MCP SDK / Node MCP SDK}, Streamable HTTP | http://127.0.0.1:8001/mcp | domain tools: {list} |
| apphost | Aspire TypeScript AppHost (`apphost.mts`) | dashboard | orchestration + Azure deploy |

> Decide Python vs Node for agent/mcp based on which Copilot SDK package
> installs cleanly first — verify with a hello-world call BEFORE building.

## 3. Required-tech usage (judging item 1, 25%)

- **GitHub Copilot SDK** = model connection. Wrap it as the chat client used
  by every agent. No direct provider SDK calls.
- **Microsoft Agent Framework** = agent definitions, concurrent workflow
  (3 specialists), judge aggregator, MCP tool binding, streaming events.
- **Instruction engineering** per agent (files under `src/agent/instructions/`):
  clear role, boundaries ("use only data from tools/input, never fabricate
  numbers"), step-by-step process, tool usage rules, tone, respond ONLY in
  the given structured schema.

## 4. MCP tools

| Tool | Input | Output | Notes |
|------|-------|--------|-------|
| {tool_1} | {schema} | {schema} | deterministic, no LLM inside |
| {tool_2} | {schema} | {schema} | |

Rules: tools validate inputs, return structured errors; secrets never
appear in tool arguments.

## 5. Agent workflow

1. Parse/normalize user input (deterministic code, not LLM).
2. Run specialists concurrently: {A: ...}, {B: ...}, {C: ...} — each returns
   a Pydantic/zod-validated structured object.
3. Application code computes any scores/aggregations deterministically.
4. Judge agent reviews evidence, writes final Korean report; it may not
   alter specialist outputs.
5. Stream phases to web: `receiving → analyzing → judging → done | error`.

## 6. Data models

```ts
// {fill: input, specialist output, final report}
```

## 7. Environment & secrets

| Var | Consumer | Notes |
|-----|----------|-------|
| {COPILOT_* auth} | agent | via Copilot SDK auth flow; never committed |
| MCP_URL | agent | injected by Aspire service reference |
| AGENT_URL | web (vite proxy) | injected by Aspire |

`.env` gitignored; Aspire parameters for deploy-time secrets.

## 8. Run & deploy

```bash
# local — terminal, run line by line
npm install        # root apphost deps
aspire run         # starts web+agent+mcp; expect dashboard URL in output

# deploy — terminal, run line by line
az login           # expect browser auth success + subscription listed
aspire deploy      # expect Azure Container Apps provisioning, then app URLs
```

After deploy: open the web URL, run the full demo path, then ask Copilot to
verify with Playwright against the deployed URL.

## 9. Testing (time-boxed)

- Smoke: one Playwright script covering the judge demo path (home → sample
  input → result rendered).
- Unit tests only for deterministic logic (parsers, score math).

## 10. Decisions & trade-offs

| Decision | Reason | Trade-off |
|----------|--------|-----------|
| 3 services, no DB | 5h budget; judges penalize unused infra | no persistence |
| Structured outputs + deterministic aggregation | prevents hallucinated numbers (judging item 6) | more schema code |
| Concurrent specialists | latency ↓, shows AF depth | N model calls per run |

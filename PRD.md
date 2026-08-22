# PRD — {App Name}

> Product Requirements Document. Judges' AI agents read this file as the
> primary source for scoring. Root of the repo, next to `TRD.md`.
> Fill every `{...}` after the idea is locked in `IDEATION.md`.

## 1. Overview

- **Product**: {one-line description}
- **Target user**: {specific persona, e.g., "team leads who run 3+ meetings/day"}
- **Productivity problem**: {concrete, real problem — time/effort wasted today}
- **Value proposition**: {before → after; quantify: "30 min of manual work → 30 seconds"}

## 2. Why agentic (not just a form + one LLM call)

{Explain why multiple specialized agents + tools solve this better:
parallel specialist analysis, judged synthesis, tool-verified facts, streaming progress.}

## 3. Core user flow (judge demo path)

1. Open the deployed URL — no login, core feature reachable in one click.
2. Click "예시 데이터로 시작" (1-click sample input) OR paste own input.
3. Watch agents work: live phase indicators + streamed partial results.
4. Receive final synthesized output: {cards/report/downloadables}.
5. Copy/download results: {e.g., markdown, .ics}.

## 4. Features

### P0 — must ship (MVP)

| # | Feature | Acceptance criteria |
|---|---------|---------------------|
| 1 | {input UI} | User pastes text / clicks sample; validation + error states shown |
| 2 | Multi-agent analysis | 3 specialist agents run concurrently via Agent Framework; each produces structured output |
| 3 | Judge synthesis | Judge agent merges results into a final report without altering specialist scores/facts |
| 4 | Live progress | UI streams phases (analyzing → judging → done) via SSE; graceful error state |
| 5 | Result output | {final artifacts}; AI-generated content is visibly labeled |

### P1 — if time remains

| # | Feature |
|---|---------|
| 1 | {e.g., result history in browser localStorage} |
| 2 | {e.g., export/share} |

### Non-goals

- No authentication, no user accounts (hackathon rule).
- No data persistence server-side (unless trivially needed).
- No multi-language UI; Korean only.

## 5. Screens

| Screen | Purpose | Key elements |
|--------|---------|--------------|
| Home | input + sample button | textarea, sample chip, run button |
| Progress/Result | show agent work + final output | phase stepper, streaming panel, result cards, copy/download |

Responsive: single column on mobile, two columns ≥ 1024px.

## 6. Success criteria (mapped to judging)

- Copilot SDK connects the model; Agent Framework orchestrates ≥ 3 agents + judge with MCP tool calls and streaming (25%).
- A first-time visitor completes the core flow in < 60s and sees a concrete productivity gain (18% + 12%).
- Deployed on Azure via repeatable `aspire deploy`; URL stays up (18%).
- End-to-end flow works with error handling; responsive UI (16%).
- AI outputs labeled; no secrets in repo; hallucination guard: agents must not invent data not present in input/tools (6%).

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Model latency > 30s | Concurrent agent execution; streaming keeps user informed |
| Judge AI can't find the feature | Sample-data button on home; zero-friction path |
| Deployment failure late in the day | First deploy by 15:00, iterate after |

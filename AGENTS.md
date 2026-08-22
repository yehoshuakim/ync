# AGENTS.md — Coding Agent Instructions

> Copy this file to the team repo root. Update whenever the agent misbehaves.

## Project

Matdathon 2026 entry: a personal-productivity agentic web app.
Hard deadline today 16:30 KST. Ship a working MVP over perfect code.

## Scope & boundaries

- Work ONLY inside this repository. Never touch files outside it.
- Follow `PRD.md` (product) and `TRD.md` (tech) as the single sources of truth.
  If a request conflicts with them, stop and ask.
- Do NOT add authentication/login of any kind. Judges are AI agents; any
  auth gate results in the lowest score. Public guest access only.
- Do NOT add services, packages, or abstractions beyond what TRD.md lists.
  Prefer the simplest working implementation. After generating a feature,
  simplify the code before moving on.
- Never hardcode secrets. Use environment variables / Aspire parameters.
- Never run `git push --force`, destructive cloud commands, or
  `aspire destroy` without explicit human approval.

## Required tech (grading depends on it)

- **Microsoft Agent Framework**: agent design, multi-agent orchestration
  (concurrent specialists + judge fan-in), tool calls, streaming.
- **GitHub Copilot SDK**: model connection layer for the agents.
- **MCP server**: expose domain tools over Streamable HTTP; agents call
  tools only through MCP.
- **Aspire (TypeScript AppHost)**: orchestrates all services locally and
  deploys to Azure Container Apps via `aspire deploy`.

## Workflow

1. Implement one plan step at a time; run/test it before the next step.
2. Keep the app runnable at all times: `aspire run` must succeed.
3. When a work topic changes, tell the human to start a fresh session.
4. UI must show agent progress transparently (phases, streaming output),
   handle loading/error states, label AI-generated content as such, and be
   responsive (mobile + desktop).

## Commands

- Local run (all services): `aspire run`
- Deploy: `az login` then `aspire deploy`
- Tests: (fill in per TRD.md once the stack is scaffolded)

## Language

- Code, comments, commit messages: English (Conventional Commits).
- User-facing UI copy: Korean.

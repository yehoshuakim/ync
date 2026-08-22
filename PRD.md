# PRD — Standin (스탠드인)

> Product Requirements Document. Judges' AI agents read this file as the primary
> source for scoring. Lives at repo root next to `TRD.md`. Ideation history:
> `IDEATION.md`, `talk.md`.

## 1. Overview

- **Product**: Standin — a *meeting preflight* service. Each teammate creates an
  **avatar card** from their workplace persona (English name, role, priorities,
  hard constraints). For coordination-type agenda items, the avatars evaluate
  candidate proposals independently; only proposals that pass **every**
  avatar's constraints become a consensus draft, and only conflicted items are
  escalated to a human meeting.
- **Target user**: 3–10 person startup teams that run frequent coordination
  meetings (sprint priorities, schedules, task allocation) where most of the
  meeting is a mechanical exchange of each member's priorities and limits.
- **Productivity problem**: a 30-minute coordination meeting costs
  30 min × attendees in person-hours, plus context-switching. The mechanical
  part (checking every proposal against everyone's constraints) does not need
  humans in a room.
- **Value proposition**: before → after: "3 people × 30 min (90 person-minutes)
  of coordination" → "avatars evaluate in under a minute; humans only meet on
  genuinely contested items." Shown honestly in-app as a *potential-savings
  estimate*: expected person-minutes (user input) vs. measured run time,
  labeled "review cost not included."

### Vision (roadmap, not in this MVP)

A 24/7 team board accumulates each member's thinking and becomes the avatar's
persona source; reclaimed time returns to deep work and team meaning — a
"team OS" trajectory. MVP implements only the avatar preflight slice.

## 2. Why agentic (not just a form + one LLM call)

1. **Isolated perspectives**: each avatar runs as a separate Agent Framework
   agent with its own persona card injected into instructions. Avatars cannot
   see each other's outputs, so one model cannot blend three roles into a
   mushy average — a real property of multi-agent isolation, not roleplay.
2. **Immutable outputs + deterministic verdict**: avatar outputs are preserved
   unmodified. The RESOLVED/CONTESTED verdict is computed by application code
   (unanimous ACCEPT rule), and hard constraints are re-checked by a
   deterministic MCP tool (`check_redlines`) — the LLM cannot invent a
   compromise or override a veto.
3. **Tool-verified facts**: hard constraints re-checked by `check_redlines`;
   human-meeting invites generated via `make_ics`. Facilitator agent only
   synthesizes a briefing, quoting avatar evidence; it may not alter verdicts.
4. **Streaming transparency**: users watch each avatar's evaluation arrive
   live (SSE), then see the verdict matrix — the judge path shows agent work,
   not a spinner.

## 3. Core user flow (judge demo path)

1. Open the deployed URL — no login; core feature reachable in one click.
2. Click **[샘플로 시작]** (1-click sample preset) — or edit any field first.
3. Watch the preflight run: phase stepper (접수 → 아바타 평가 중 → 판정 →
   브리핑 → 완료) + each avatar's evaluation card streaming in.
4. Result: consensus draft, verdict matrix (candidate × avatar × constraint),
   contested items with reasons, human-meeting `.ics`, time receipt.
5. Click **[초안 승인]** (human confirmation) → download decision record
   (markdown) + `.ics`.

## 4. Sample preset (P0 — exact content, Korean UI)

**안건**: "9월 스프린트: 다음 2주 동안 무엇을 먼저 만들까?"
(예상 회의: 참석 3명 × 30분)

**후보안** — fixed columns; users may edit **values only** (no adding/removing
columns or candidates):

| ID | 후보안 | dev_days | revenue_impact (1–5) | ux_impact (1–5) | tech_debt (1–5, lower=better) |
|----|--------|---------:|---------------------:|----------------:|------------------------------:|
| A | 간편 온보딩 개선 | 6 | 3 | 5 | 2 |
| B | 결제 연동 (토스페이먼츠) | 9 | 5 | 2 | 3 |
| C | 관리자 대시보드 | 12 | 2 | 2 | 4 |

**아바타 카드** — fixed 3 avatars; editable: name, role, priority field
selection, constraint **values** (constraint format is fixed
`field <op> number`, chosen from the columns above):

| 아바타 | 역할 | Top priority (soft) | Hard constraints (typed) |
|--------|------|---------------------|--------------------------|
| **Yehoshua** | COO | revenue_impact | `dev_days <= 10` |
| **Caleb** | Lead Developer | tech_debt (low) | `dev_days <= 10`, `tech_debt <= 3` |
| **Samuel** | Product Designer | ux_impact | `ux_impact >= 2` |

**Avatar verdict rules (mechanical — goes into each avatar's instructions):**

1. If a candidate violates any of YOUR hard constraints → `REJECT`,
   citing the constraint.
2. If all your hard constraints pass → you MUST return `ACCEPT`.
   Never reject for soft-priority reasons.
3. When accepting, if the candidate scores ≤ 2 on your top-priority field →
   return `ACCEPT_WITH_CONCERNS` and state the concern in evidence.
4. Evidence may only quote fields present in the input. No invented facts.

**Verdict computation (app code, authoritative — not the LLM):**

- Any hard-constraint violation (re-checked deterministically via
  `check_redlines`) → **REJECTED** (폐기, shown with the failing constraint;
  never sent to a human meeting).
- All three avatars plain `ACCEPT` → **RESOLVED** (consensus draft).
- Hard constraints pass but ≥ 1 `ACCEPT_WITH_CONCERNS` → **CONTESTED**
  (human-meeting agenda + `.ics`).
- If an avatar's verdict contradicts the deterministic check, the code wins
  and the item is tagged "확인 필요".

**Expected sample outcome** (guaranteed by the rules above):
- A: all hard pass, no field ≤ 2 on anyone's top priority → **RESOLVED**.
- B: hard passes (Samuel's `ux_impact >= 2` barely holds), but
  `ux_impact = 2` triggers Samuel's concern → **CONTESTED**
  (사유: 매출 최고안이지만 UX 저하 우려 — 트레이드오프는 사람 판단)
  → human-meeting `.ics` (next day 10:00, fixed).
- C: `dev_days 12 > 10` violates Yehoshua & Caleb → **REJECTED**.
- Time receipt: "예상 90 person-minutes → 실측 실행 {measured}초.
  잠재 절감 추정치이며 검토 비용은 포함하지 않습니다."

## 5. Features

### P0 — must ship (MVP)

| # | Feature | Acceptance criteria |
|---|---------|---------------------|
| 1 | Sample preset + value editing | 1 click loads the full preset above; agenda text, candidate field values, avatar names/roles/priority-field/constraint values editable — columns, candidate count (3), avatar count (3), and constraint format are FIXED; validation with inline errors (empty, over-length, non-numeric value) |
| 2 | Avatar concurrent evaluation | 3 avatar agents run concurrently via Agent Framework; each follows the mechanical verdict rules (Section 4) and returns a schema-validated result per candidate: ACCEPT / ACCEPT_WITH_CONCERNS / REJECT + evidence quoting input fields only; outputs immutable |
| 3 | Deterministic verdict + redline check | App code computes RESOLVED / CONTESTED / REJECTED per Section 4; `check_redlines` MCP tool re-validates typed constraints; code is authoritative over LLM verdicts ("확인 필요" tag on mismatch); verdict matrix rendered (candidate × avatar × constraint pass/fail) |
| 4 | Facilitator briefing | Facilitator agent writes Korean briefing quoting avatar evidence; may not change verdicts or invent compromises |
| 5 | Live progress | SSE streams phases + per-avatar cards as they complete; graceful error state + retry button |
| 6 | Decision package | Consensus draft + contested list with reasons + rejected list with failing constraints + `.ics` for the human meeting (via `make_ics`; meeting time fixed to next day 10:00 KST — no date math) + decision record markdown download; **[초안 승인]** button gates downloads; all AI output labeled "AI 생성 — 검토 후 사용" |
| 7 | Time receipt | Expected person-minutes (from input) vs measured run seconds, with honesty label |

### P1 — only if time remains

| # | Feature |
|---|---------|
| 1 | Result copy-to-clipboard variants (Slack-style summary) |

### Non-goals (explicitly cut)

- No authentication/accounts (hackathon rule; guest path is the product).
- No second sample preset, no result editing, no history/persistence,
  no multi-round negotiation, no avatar add/remove (fixed 3 in MVP),
  no 24/7 board (roadmap only).
- No multi-language UI; Korean only.

## 6. Screens

| Screen | Purpose | Key elements |
|--------|---------|--------------|
| Home | input + run | hero: "당신의 아바타가 먼저 회의합니다" + one-line explainer; [샘플로 시작] primary button; agenda field; candidate cards with typed field chips; 3 avatar cards (editable); [프리플라이트 실행] button |
| Run/Result | watch + outcome | phase stepper; 3 avatar evaluation cards streaming; verdict matrix; consensus draft card; contested items card (with 사유); time receipt; [초안 승인] → download `.md` + `.ics`; error banner + retry |

Responsive: single column on mobile, two columns ≥ 1024px. Accessibility:
aria labels on stepper/cards/buttons, focus states, sufficient contrast.

## 7. Success criteria (mapped to judging)

- **SDK+AF (25%)**: Copilot SDK is the only model connection (team Copilot Max
  account auth), injected as the chat client that Agent Framework agents use;
  Agent Framework runs 3 concurrent avatar agents + facilitator fan-in; agents
  call MCP tools (`check_redlines`, `make_ics`) over Streamable HTTP; persona
  cards dynamically injected into instructions; structured outputs; SSE
  streaming end-to-end.
- **Productivity (18%)**: quantified person-minute savings shown honestly;
  target persona + before/after in this PRD.
- **Azure (18%)**: web/agent/mcp on Azure Container Apps via repeatable
  `aspire deploy`; `/health` on all services; no extraneous services.
- **Completeness (16%)**: judge path works E2E in < 60 s with error handling
  and responsive UI.
- **UX (12%)**: transparent streaming, verdict matrix, human approval gate.
- **Responsible AI (6%)**: "limited role-delegation card" framing (not a person
  clone); AI-generated labels; no fabrication (evidence must quote input);
  injection guard — every user-provided string (agenda, candidate names) is
  wrapped in `<user_input>` XML tags when passed to agents and treated as data,
  never as instructions; deterministic constraint re-check; abuse guard
  (input length + rate limit).
- **Innovation (5%)**: category shift — notetakers record meetings; Standin
  pre-resolves them; the app proves its own effect via the time receipt.

## 8. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Copilot SDK non-interactive auth fails on Azure | Verify SDK auth + one real model call FIRST (before UI); TRD locks the auth method; fallback = keep demo on local-verified deploy path |
| Model latency > 30 s | Concurrent avatars; SSE keeps progress visible; per-agent timeout + retry |
| Judge AI can't find the feature | [샘플로 시작] on the hero; zero-friction path; no login |
| LLM invents facts/compromises | Unanimous-ACCEPT rule in code; `check_redlines` deterministic re-check; facilitator quote-only rule; "확인 필요" tag for unsupported claims |
| Public endpoint abuse (no login) | Input length caps, per-IP rate limit, single concurrent run per session |
| Late deployment failure | First deploy by 15:00, iterate after; deploy commands recorded in TRD |

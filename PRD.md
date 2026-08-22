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

## 6. Screens — build spec (exact copy & states; Korean UI)

Single page (`/`), two zones. No routing, no modal except the approval confirm.
**No login, no onboarding, no cookie banner** — the page is usable in 0 clicks.

### 6.0 Design system

- Palette: bg `#0B0F17`, surface `#141A24`, border `#243044`, text `#E6EDF7`,
  muted `#8FA3BF`, accent `#4F8CFF`; status: RESOLVED `#2FBF71`,
  CONTESTED `#F2B441`, REJECTED `#E5484D`.
- Type: system sans; h1 32/40 bold, h2 20/28 semibold, body 15/24, mono for numbers.
- Radius 12, spacing scale 4/8/12/16/24/32, 1px borders. Dark theme only.
- Responsive: `<768px` single column, cards stack, matrix becomes horizontally
  scrollable (`overflow-x:auto`, sticky first column); `≥1024px` two columns
  (left input 5fr / right result 7fr). Touch targets ≥ 44px.
- Accessibility: every interactive element has an accessible name;
  phase stepper is `role="status" aria-live="polite"`; verdict matrix is a real
  `<table>` with `<th scope>`; status conveyed by **text + icon**, never color
  alone; visible focus ring (2px accent); `prefers-reduced-motion` disables
  the pulse animation.

### 6.1 Header

- Left: wordmark **Standin** + tagline `아바타가 먼저 회의합니다`.
- Right: badge `AI 생성 결과 — 검토 후 사용하세요` (always visible, criterion 6).

### 6.2 Zone A — 입력 (left)

1. **Hero** — h1 `당신의 아바타가 먼저 회의합니다`,
   sub `조율형 안건을 아바타 3인이 각자 평가하고, 전원 통과한 안만 합의 초안이 됩니다. 충돌한 안건만 사람이 만납니다.`
2. **Primary CTA** — `[샘플로 시작]` (accent, full-width). Click = load the
   §4 preset into all fields **and immediately run** the preflight.
   Secondary text button `직접 입력하기` just focuses the agenda field.
   > The sample preset is **pre-filled on first paint** so a judge agent can hit
   > `[프리플라이트 실행]` with zero typing. `[샘플로 시작]` merely re-loads + runs.
3. **안건** — textarea, label `안건`, placeholder
   `예) 9월 스프린트: 다음 2주 동안 무엇을 먼저 만들까?`, max 500자, counter.
   Row: `예상 회의 시간(분)` number (default 30, 5–240) ·
   `참석 인원` number (default 3, 1–20).
4. **후보안 3장** — card each: title input (max 60자) + 4 numeric fields as
   labeled steppers: `개발일수(dev_days)` 0–60 · `매출 임팩트 1–5` ·
   `UX 임팩트 1–5` · `기술부채 1–5 (낮을수록 좋음)`. Column set is FIXED.
5. **아바타 카드 3장** — each: `이름`(영문 사내 이름, max 20자) ·
   `역할`(max 30자) · `우선 관심(top priority)` select of the 4 fields ·
   `레드라인` rows `필드 select` + `연산자 select (≤ / ≥ / =)` + `값 number`
   (0–60), max 2 rows per avatar, `+ 레드라인 추가` / `삭제`.
   Helper: `레드라인은 절대 조건입니다. 하나라도 위반하면 그 후보안은 폐기됩니다.`
6. **`[프리플라이트 실행]`** — accent, full-width, sticky at bottom on mobile.
   Disabled while running (label → `평가 중…`).

**Validation (inline, below field, red text, `aria-invalid`, blocks submit):**
`안건을 입력해 주세요.` / `안건은 500자 이내로 입력해 주세요.` /
`후보안 이름을 입력해 주세요.` / `숫자만 입력할 수 있습니다.` /
`{n}~{m} 사이의 값을 입력해 주세요.` / `아바타 이름을 입력해 주세요.` /
`레드라인 값을 입력해 주세요.`

### 6.3 Zone B — 실행 & 결과 (right)

**Empty state (before any run)** — dashed border card, muted:
`아직 실행하지 않았습니다. [샘플로 시작]을 누르면 30초 안에 결과가 나옵니다.`

**Running state**

- **Phase stepper** (5 steps, `aria-live="polite"`, current step pulses):
  `접수` → `아바타 평가 중` → `판정` → `브리핑` → `완료`.
  Sub-label shows elapsed seconds (`12초 경과`).
- **아바타 평가 카드 3장** — skeleton until that avatar's `avatar_result`
  arrives, then flips to the result. Header = 이름 · 역할 ·
  `우선 관심: UX 임팩트`. Body = per-candidate row:
  candidate name + status chip (`통과` / `조건부 통과` / `거부`) + evidence text.
  Footer if fallback: `⚠ 모델 응답 지연으로 규칙 기반 평가로 대체됨`.

**Result state**

1. **판정 요약** — 3 chips: `합의 1건` `사람 회의 1건` `폐기 1건`.
2. **합의 초안 (RESOLVED)** — green-bordered card: candidate name, one-line
   reason, `전원 통과` badge, avatar names as pills.
3. **사람 회의 필요 (CONTESTED)** — amber card: candidate name, `사유:` line,
   who raised the concern, and `제안 일정: 내일 10:00 (30분)`.
4. **폐기 (REJECTED)** — red card, collapsed by default, shows the failing
   redline as text: `Yehoshua의 레드라인 위반: 개발일수 12 > 10`.
5. **판정 매트릭스** — `<table>`: rows = candidates, columns = 3 avatars +
   `최종 판정`. Cells: `통과`/`조건부`/`거부` chip + tooltip with the constraint.
   Horizontally scrollable on mobile.
6. **브리핑** — facilitator's Korean markdown, in a card labeled
   `AI 생성 브리핑 — 사실은 입력값 인용만 합니다`.
7. **시간 영수증** — `예상 90 인·분 → 실측 {n}초`, and below in muted 13px:
   `잠재 절감 추정치이며 검토 비용은 포함하지 않습니다.`
8. **승인 게이트** — `[초안 승인]` (primary). Opens a confirm dialog:
   title `초안을 승인할까요?`, body
   `승인하면 결정 기록과 회의 초대(.ics) 파일을 내려받습니다. AI가 만든 초안이므로 내용을 확인한 뒤 사용하세요.`,
   buttons `승인하고 내려받기` / `취소`. On confirm: download
   `standin-decision.md` + `standin-meeting.ics`, and the button becomes
   `승인됨 ✓ 다시 내려받기`. Downloads are **disabled before approval**
   (criterion 6: confirmation before a consequential action).

**Error state** — red banner replacing Zone B content:
`평가에 실패했습니다. 잠시 후 다시 시도해 주세요.` + `[다시 시도]` +
collapsible `자세히` with the error code. Rate-limited (HTTP 429):
`잠시 후 다시 시도해 주세요. (1분에 한 번만 실행할 수 있습니다)`.
Partial-failure never blanks the screen — a failed avatar renders with the
rule-based fallback notice and the run completes.

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

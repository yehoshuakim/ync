from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from datetime import date, timedelta

from .models import Avatar, AvatarEval, AvatarVerdict, Candidate, CandidateOutcome, CandidateStatus


def compare(actual: float, op: str, value: float) -> bool:
    if op == "<=":
        return actual <= value
    if op == ">=":
        return actual >= value
    if op == "=":
        return abs(actual - value) < 1e-9
    raise ValueError(f"Unsupported operator: {op}")


def mechanical_eval(avatar: Avatar, candidate: Candidate, *, llm_fallback: bool) -> AvatarEval:
    for c in avatar.hard_constraints:
        actual = float(getattr(candidate.fields, c.field))
        if not compare(actual, c.op.value, c.value):
            return AvatarEval(
                avatar=avatar.name,
                candidate_id=candidate.id,
                verdict=AvatarVerdict.REJECT,
                evidence=f"{c.field}={actual} 이(가) 레드라인 {c.field} {c.op.value} {c.value} 위반",
                cited_constraint=f"{c.field} {c.op.value} {c.value}",
                llm_fallback=llm_fallback,
            )

    top_value = float(getattr(candidate.fields, avatar.top_priority))
    concern = top_value <= 2
    if avatar.top_priority == "tech_debt":
        concern = top_value >= 4
    if concern:
        return AvatarEval(
            avatar=avatar.name,
            candidate_id=candidate.id,
            verdict=AvatarVerdict.ACCEPT_WITH_CONCERNS,
            evidence=f"통과하지만 {avatar.top_priority}={top_value}로 우려가 있습니다.",
            llm_fallback=llm_fallback,
        )

    return AvatarEval(
        avatar=avatar.name,
        candidate_id=candidate.id,
        verdict=AvatarVerdict.ACCEPT,
        evidence="레드라인을 모두 충족합니다.",
        llm_fallback=llm_fallback,
    )


def deterministic_redline(candidates: list[Candidate], avatars: list[Avatar]) -> dict:
    results: list[dict] = []
    for candidate in candidates:
        for avatar in avatars:
            for c in avatar.hard_constraints:
                actual = float(getattr(candidate.fields, c.field))
                results.append(
                    {
                        "candidate_id": candidate.id,
                        "avatar": avatar.name,
                        "field": c.field,
                        "op": c.op.value,
                        "value": c.value,
                        "actual": actual,
                        "pass": compare(actual, c.op.value, c.value),
                    }
                )
    return {"results": results}


def compute_outcomes(
    candidates: list[Candidate],
    avatars: list[Avatar],
    evals: list[AvatarEval],
    redline_results: dict,
) -> list[CandidateOutcome]:
    eval_map: dict[str, dict[str, AvatarEval]] = defaultdict(dict)
    for e in evals:
        eval_map[e.candidate_id][e.avatar] = e

    outcomes: list[CandidateOutcome] = []
    for candidate in candidates:
        rows = [r for r in redline_results["results"] if r["candidate_id"] == candidate.id]
        has_redline_fail = any(not r["pass"] for r in rows)
        reasons: list[str] = []
        needs_review = False

        if has_redline_fail:
            status = CandidateStatus.REJECTED
            for row in rows:
                if not row["pass"]:
                    reasons.append(
                        f"{row['avatar']}의 레드라인 위반: {row['field']} {row['actual']} {row['op']} {row['value']}"
                    )
        else:
            verdicts = [eval_map[candidate.id].get(avatar.name) for avatar in avatars]
            if any(v is None for v in verdicts):
                status = CandidateStatus.CONTESTED
                reasons.append("아바타 평가 누락으로 사람 검토 필요")
                needs_review = True
            elif all(v.verdict == AvatarVerdict.ACCEPT for v in verdicts):
                status = CandidateStatus.RESOLVED
                reasons.append("전원 통과")
            else:
                status = CandidateStatus.CONTESTED
                concerns = [v for v in verdicts if v and v.verdict == AvatarVerdict.ACCEPT_WITH_CONCERNS]
                reasons.extend([f"{v.avatar}: {v.evidence}" for v in concerns])

        # code authority check
        for avatar in avatars:
            ev = eval_map[candidate.id].get(avatar.name)
            if not ev:
                continue
            avatar_had_fail = any((r["avatar"] == avatar.name and not r["pass"]) for r in rows)
            if avatar_had_fail and ev.verdict != AvatarVerdict.REJECT:
                needs_review = True
            if (not avatar_had_fail) and ev.verdict == AvatarVerdict.REJECT:
                needs_review = True

        outcomes.append(
            CandidateOutcome(
                candidate_id=candidate.id,
                status=status,
                reasons=reasons,
                matrix=[
                    {
                        "avatar": r["avatar"],
                        "constraint": f"{r['field']} {r['op']} {r['value']}",
                        "pass": r["pass"],
                    }
                    for r in rows
                ],
                needs_review=needs_review,
            )
        )

    return outcomes


def build_decision_record(agenda: str, outcomes: list[CandidateOutcome], briefing_md: str) -> str:
    lines = [
        "# Standin Decision Record",
        "",
        f"- Agenda: {agenda}",
        "",
        "## Outcomes",
    ]
    for o in outcomes:
        lines.append(f"- {o.candidate_id}: {o.status.value} ({'; '.join(o.reasons)})")
    lines.extend(["", "## Briefing", briefing_md])
    return "\n".join(lines)


def next_day_iso() -> str:
    return (date.today() + timedelta(days=1)).isoformat()


class InMemoryRateLimit:
    def __init__(self) -> None:
        self.runs: dict[str, deque[float]] = defaultdict(deque)
        self.active: set[str] = set()

    def acquire(self, ip: str) -> tuple[bool, int | None]:
        now = time.time()
        q = self.runs[ip]
        while q and now - q[0] > 3600:
            q.popleft()
        if ip in self.active:
            return False, 429
        if len(q) >= 10:
            return False, 429
        q.append(now)
        self.active.add(ip)
        return True, None

    def release(self, ip: str) -> None:
        self.active.discard(ip)


def parse_json_block(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])

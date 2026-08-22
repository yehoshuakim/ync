"""Deterministic verdict engine.

Application code - not the LLM - is the final authority on RESOLVED / CONTESTED /
REJECTED. The LLM only produces per-avatar evaluations and a briefing; whenever an
LLM verdict contradicts the deterministic check, the code wins and the outcome is
flagged `needs_review`.
"""

from __future__ import annotations

from .models import (
    HIGHER_IS_BETTER,
    FIELD_LABELS_KO,
    Avatar,
    AvatarEval,
    AvatarVerdict,
    Candidate,
    CandidateOutcome,
    Constraint,
    MatrixCell,
    _num,
)

RedlineKey = tuple[str, str, str]  # (candidate_id, avatar_name, constraint.key())


def compare(actual: float, op: str, value: float) -> bool:
    if op == "<=":
        return actual <= value
    if op == ">=":
        return actual >= value
    if op == "=":
        return actual == value
    raise ValueError(f"unsupported operator: {op}")


def local_redlines(candidates: list[Candidate], avatars: list[Avatar]) -> dict[RedlineKey, bool]:
    """Local equivalent of the MCP `check_redlines` tool, used to cross-check it
    and as the fallback if the MCP service is unreachable."""
    table: dict[RedlineKey, bool] = {}
    for candidate in candidates:
        values = candidate.fields.model_dump()
        for avatar in avatars:
            for constraint in avatar.hard_constraints:
                actual = values[constraint.field]
                table[(candidate.id, avatar.name, constraint.key())] = compare(
                    actual, constraint.op, constraint.value
                )
    return table


def violated_constraints(
    candidate: Candidate, avatar: Avatar, redlines: dict[RedlineKey, bool]
) -> list[Constraint]:
    return [
        constraint
        for constraint in avatar.hard_constraints
        if not redlines.get((candidate.id, avatar.name, constraint.key()), True)
    ]


def has_concern(candidate: Candidate, avatar: Avatar) -> bool:
    """PRD section 4 rule 3: a concern is raised only when the avatar's own top-priority
    field is weak in that field's own direction."""
    value = candidate.fields.model_dump()[avatar.top_priority]
    if avatar.top_priority in HIGHER_IS_BETTER:
        return value <= 2
    return value >= 4


def expected_verdict(
    candidate: Candidate, avatar: Avatar, redlines: dict[RedlineKey, bool]
) -> AvatarVerdict:
    if violated_constraints(candidate, avatar, redlines):
        return "REJECT"
    return "ACCEPT_WITH_CONCERNS" if has_concern(candidate, avatar) else "ACCEPT"


def rule_based_eval(
    candidate: Candidate, avatar: Avatar, redlines: dict[RedlineKey, bool], *, fallback: bool
) -> AvatarEval:
    """Mechanical evaluation used when the model fails, times out, or returns
    unparseable output. Evidence quotes input values only."""
    values = candidate.fields.model_dump()
    violations = violated_constraints(candidate, avatar, redlines)
    priority_label = FIELD_LABELS_KO[avatar.top_priority]
    priority_value = _num(values[avatar.top_priority])

    if violations:
        first = violations[0]
        evidence = (
            f"'{candidate.name}'의 {FIELD_LABELS_KO[first.field]}"
            f"({_num(values[first.field])})가 레드라인 {first.label_ko()}을(를) 위반합니다."
        )
        return AvatarEval(
            avatar=avatar.name,
            candidate_id=candidate.id,
            verdict="REJECT",
            evidence=evidence,
            cited_constraint=first.label_ko(),
            llm_fallback=fallback,
        )

    if has_concern(candidate, avatar):
        evidence = (
            f"레드라인은 모두 통과하지만, 우선 관심인 {priority_label}이(가) "
            f"{priority_value}로 약합니다. 트레이드오프는 사람 판단이 필요합니다."
        )
        return AvatarEval(
            avatar=avatar.name,
            candidate_id=candidate.id,
            verdict="ACCEPT_WITH_CONCERNS",
            evidence=evidence,
            cited_constraint=None,
            llm_fallback=fallback,
        )

    evidence = (
        f"레드라인을 모두 통과했고, 우선 관심인 {priority_label}이(가) "
        f"{priority_value}로 수용 가능합니다."
    )
    return AvatarEval(
        avatar=avatar.name,
        candidate_id=candidate.id,
        verdict="ACCEPT",
        evidence=evidence,
        cited_constraint=None,
        llm_fallback=fallback,
    )


def build_matrix(
    candidate: Candidate, avatars: list[Avatar], redlines: dict[RedlineKey, bool]
) -> list[MatrixCell]:
    cells: list[MatrixCell] = []
    for avatar in avatars:
        for constraint in avatar.hard_constraints:
            cells.append(
                MatrixCell(
                    avatar=avatar.name,
                    constraint=constraint.label_ko(),
                    pass_=redlines.get((candidate.id, avatar.name, constraint.key()), True),
                )
            )
    return cells


def compute_outcome(
    candidate: Candidate,
    avatars: list[Avatar],
    redlines: dict[RedlineKey, bool],
    evals: list[AvatarEval],
) -> CandidateOutcome:
    """Authoritative verdict. Redline violations dominate; otherwise unanimous plain
    ACCEPT is required for consensus."""
    values = candidate.fields.model_dump()
    by_avatar = {item.avatar: item for item in evals if item.candidate_id == candidate.id}
    matrix = build_matrix(candidate, avatars, redlines)
    reasons: list[str] = []
    needs_review = False

    for avatar in avatars:
        code_verdict = expected_verdict(candidate, avatar, redlines)
        llm_eval = by_avatar.get(avatar.name)
        if llm_eval is not None and llm_eval.verdict != code_verdict:
            needs_review = True

    rejecting = [
        (avatar, violated_constraints(candidate, avatar, redlines))
        for avatar in avatars
        if violated_constraints(candidate, avatar, redlines)
    ]
    if rejecting:
        for avatar, violations in rejecting:
            for constraint in violations:
                reasons.append(
                    f"{avatar.name}의 레드라인 위반: "
                    f"{FIELD_LABELS_KO[constraint.field]} {_num(values[constraint.field])} "
                    f"{'>' if constraint.op == '<=' else '<' if constraint.op == '>=' else '≠'} "
                    f"{_num(constraint.value)}"
                )
        return CandidateOutcome(
            candidate_id=candidate.id,
            name=candidate.name,
            status="REJECTED",
            reasons=reasons,
            matrix=matrix,
            needs_review=needs_review,
        )

    concerned = [avatar for avatar in avatars if has_concern(candidate, avatar)]
    if concerned:
        for avatar in concerned:
            label = FIELD_LABELS_KO[avatar.top_priority]
            reasons.append(
                f"{avatar.name}({avatar.role}) 우려: {label} "
                f"{_num(values[avatar.top_priority])} — 트레이드오프는 사람 판단"
            )
        return CandidateOutcome(
            candidate_id=candidate.id,
            name=candidate.name,
            status="CONTESTED",
            reasons=reasons,
            matrix=matrix,
            needs_review=needs_review,
        )

    reasons.append(f"아바타 {len(avatars)}인 전원이 레드라인 통과 및 수용 — 합의 초안")
    return CandidateOutcome(
        candidate_id=candidate.id,
        name=candidate.name,
        status="RESOLVED",
        reasons=reasons,
        matrix=matrix,
        needs_review=needs_review,
    )

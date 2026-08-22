from app.logic import compute_outcomes, deterministic_redline, mechanical_eval
from app.models import Avatar, Candidate, Constraint, Fields


def _candidate(cid: str, dev: int, rev: int, ux: int, debt: int) -> Candidate:
    return Candidate(id=cid, name=cid, fields=Fields(dev_days=dev, revenue_impact=rev, ux_impact=ux, tech_debt=debt))


def test_mechanical_fallback_concern() -> None:
    avatar = Avatar(
        name="Samuel",
        role="Designer",
        top_priority="ux_impact",
        hard_constraints=[Constraint(field="ux_impact", op=">=", value=2)],
    )
    c = _candidate("B", 9, 5, 2, 3)
    out = mechanical_eval(avatar, c, llm_fallback=True)
    assert out.verdict.value == "ACCEPT_WITH_CONCERNS"
    assert out.llm_fallback is True


def test_truth_table_sample() -> None:
    candidates = [
        _candidate("A", 6, 3, 5, 2),
        _candidate("B", 9, 5, 2, 3),
        _candidate("C", 12, 2, 2, 4),
    ]
    avatars = [
        Avatar(name="Yehoshua", role="COO", top_priority="revenue_impact", hard_constraints=[Constraint(field="dev_days", op="<=", value=10)]),
        Avatar(
            name="Caleb",
            role="Lead Developer",
            top_priority="tech_debt",
            hard_constraints=[Constraint(field="dev_days", op="<=", value=10), Constraint(field="tech_debt", op="<=", value=3)],
        ),
        Avatar(name="Samuel", role="Designer", top_priority="ux_impact", hard_constraints=[Constraint(field="ux_impact", op=">=", value=2)]),
    ]
    evals = [mechanical_eval(a, c, llm_fallback=True) for a in avatars for c in candidates]
    redline = deterministic_redline(candidates, avatars)
    out = compute_outcomes(candidates, avatars, evals, redline)
    by_id = {o.candidate_id: o.status.value for o in out}
    assert by_id == {"A": "RESOLVED", "B": "CONTESTED", "C": "REJECTED"}

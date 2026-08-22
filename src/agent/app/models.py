"""Single source of truth for Standin data models (mirrored in src/web/src/types.ts)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

FieldKey = Literal["dev_days", "revenue_impact", "ux_impact", "tech_debt"]
Op = Literal["<=", ">=", "="]
AvatarVerdict = Literal["ACCEPT", "ACCEPT_WITH_CONCERNS", "REJECT"]
OutcomeStatus = Literal["RESOLVED", "CONTESTED", "REJECTED"]

# Fixed field semantics. Avatars may not reinterpret these.
HIGHER_IS_BETTER: frozenset[str] = frozenset({"revenue_impact", "ux_impact"})
LOWER_IS_BETTER: frozenset[str] = frozenset({"dev_days", "tech_debt"})

FIELD_LABELS_KO: dict[str, str] = {
    "dev_days": "개발일수",
    "revenue_impact": "매출 임팩트",
    "ux_impact": "UX 임팩트",
    "tech_debt": "기술부채",
}

OP_LABELS_KO: dict[str, str] = {"<=": "≤", ">=": "≥", "=": "="}


class Fields(BaseModel):
    dev_days: float = Field(ge=0, le=100)
    revenue_impact: float = Field(ge=0, le=100)
    ux_impact: float = Field(ge=0, le=100)
    tech_debt: float = Field(ge=0, le=100)


class Candidate(BaseModel):
    id: str = Field(min_length=1, max_length=8)
    name: str = Field(min_length=1, max_length=500)
    fields: Fields


class Constraint(BaseModel):
    field: FieldKey
    op: Op
    value: float = Field(ge=0, le=100)

    def label_ko(self) -> str:
        return f"{FIELD_LABELS_KO[self.field]} {OP_LABELS_KO[self.op]} {_num(self.value)}"

    def key(self) -> str:
        return f"{self.field} {self.op} {_num(self.value)}"


class Avatar(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    role: str = Field(min_length=1, max_length=500)
    top_priority: FieldKey
    hard_constraints: list[Constraint] = Field(min_length=0, max_length=4)


class RunRequest(BaseModel):
    agenda: str = Field(min_length=1, max_length=500)
    expected_minutes: int = Field(ge=1, le=240)
    attendees: int = Field(ge=1, le=20)
    candidates: list[Candidate] = Field(min_length=3, max_length=3)
    avatars: list[Avatar] = Field(min_length=3, max_length=3)

    @field_validator("candidates")
    @classmethod
    def unique_candidate_ids(cls, value: list[Candidate]) -> list[Candidate]:
        if len({candidate.id for candidate in value}) != len(value):
            raise ValueError("candidate ids must be unique")
        return value

    @field_validator("avatars")
    @classmethod
    def unique_avatar_names(cls, value: list[Avatar]) -> list[Avatar]:
        if len({avatar.name for avatar in value}) != len(value):
            raise ValueError("avatar names must be unique")
        return value


class AvatarEval(BaseModel):
    avatar: str
    candidate_id: str
    verdict: AvatarVerdict
    evidence: str = Field(max_length=600)
    cited_constraint: str | None = None
    llm_fallback: bool = False


class AvatarResultGroup(BaseModel):
    """One streamed SSE payload per avatar, covering all candidates."""

    avatar: str
    role: str
    top_priority: FieldKey
    llm_fallback: bool
    evals: list[AvatarEval]


class MatrixCell(BaseModel):
    avatar: str
    constraint: str
    pass_: bool = Field(serialization_alias="pass")

    model_config = {"populate_by_name": True}


class CandidateOutcome(BaseModel):
    candidate_id: str
    name: str
    status: OutcomeStatus
    reasons: list[str]
    matrix: list[MatrixCell]
    needs_review: bool = False


class Receipt(BaseModel):
    expected_person_minutes: int
    measured_seconds: float
    candidate_count: int
    perspective_count: int
    contested_count: int
    note: str = "잠재 절감 추정치, 검토 비용 미포함"


class IcsFile(BaseModel):
    filename: str
    content: str


class RunResult(BaseModel):
    outcomes: list[CandidateOutcome]
    briefing_md: str
    decision_record_md: str
    ics: IcsFile | None = None
    receipt: Receipt


# ---- LLM structured output (what each avatar agent must return) ----


class LlmCandidateEval(BaseModel):
    candidate_id: str
    verdict: AvatarVerdict
    evidence: str = Field(max_length=600)
    cited_constraint: str | None = None


class LlmAvatarResponse(BaseModel):
    evaluations: list[LlmCandidateEval]


def _num(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)

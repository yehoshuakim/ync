from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Fields(BaseModel):
    dev_days: float = Field(ge=0, le=100)
    revenue_impact: float = Field(ge=0, le=100)
    ux_impact: float = Field(ge=0, le=100)
    tech_debt: float = Field(ge=0, le=100)


class Candidate(BaseModel):
    id: Literal["A", "B", "C"]
    name: str = Field(min_length=1, max_length=60)
    fields: Fields


class Op(str, Enum):
    lte = "<="
    gte = ">="
    eq = "="


FieldName = Literal["dev_days", "revenue_impact", "ux_impact", "tech_debt"]


class Constraint(BaseModel):
    field: FieldName
    op: Op
    value: float = Field(ge=0, le=100)


class Avatar(BaseModel):
    name: str = Field(min_length=1, max_length=20)
    role: str = Field(min_length=1, max_length=30)
    top_priority: FieldName
    hard_constraints: list[Constraint] = Field(default_factory=list, max_length=2)


class RunRequest(BaseModel):
    agenda: str = Field(min_length=1, max_length=500)
    expected_minutes: int = Field(ge=5, le=240)
    attendees: int = Field(ge=1, le=20)
    candidates: list[Candidate]
    avatars: list[Avatar]

    @model_validator(mode="after")
    def validate_counts(self) -> "RunRequest":
        if len(self.candidates) != 3:
            raise ValueError("candidates must be exactly 3")
        if len(self.avatars) != 3:
            raise ValueError("avatars must be exactly 3")
        return self


class AvatarVerdict(str, Enum):
    ACCEPT = "ACCEPT"
    ACCEPT_WITH_CONCERNS = "ACCEPT_WITH_CONCERNS"
    REJECT = "REJECT"


class AvatarEval(BaseModel):
    avatar: str
    candidate_id: str
    verdict: AvatarVerdict
    evidence: str
    cited_constraint: str | None = None
    llm_fallback: bool = False


class MatrixCell(BaseModel):
    avatar: str
    constraint: str
    pass_: bool = Field(alias="pass")


class CandidateStatus(str, Enum):
    RESOLVED = "RESOLVED"
    CONTESTED = "CONTESTED"
    REJECTED = "REJECTED"


class CandidateOutcome(BaseModel):
    candidate_id: str
    status: CandidateStatus
    reasons: list[str]
    matrix: list[dict]
    needs_review: bool = False


class Receipt(BaseModel):
    expected_person_minutes: int
    measured_seconds: float
    note: str = "잠재 절감 추정치, 검토 비용 미포함"


class RunResult(BaseModel):
    outcomes: list[CandidateOutcome]
    briefing_md: str
    decision_record_md: str
    ics: dict | None = None
    receipt: Receipt

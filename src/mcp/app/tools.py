from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pydantic import BaseModel, Field


class CandidateFields(BaseModel):
    dev_days: float
    revenue_impact: float
    ux_impact: float
    tech_debt: float


class Candidate(BaseModel):
    id: str
    fields: CandidateFields


class Constraint(BaseModel):
    avatar: str
    field: str
    op: str
    value: float


class CheckRedlinesInput(BaseModel):
    candidates: list[Candidate]
    constraints: list[Constraint]


class MakeIcsInput(BaseModel):
    title: str
    description: str
    date: str
    time_start: str = "10:00"
    duration_min: int = 30
    attendees: list[str] = Field(default_factory=list)


def _compare(actual: float, op: str, target: float) -> bool:
    if op == "<=":
        return actual <= target
    if op == ">=":
        return actual >= target
    if op == "=":
        return actual == target
    raise ValueError(f"Unsupported operator: {op}")


def check_redlines(payload: dict) -> dict:
    req = CheckRedlinesInput.model_validate(payload)
    results: list[dict] = []

    for candidate in req.candidates:
        for redline in req.constraints:
            actual = float(getattr(candidate.fields, redline.field))
            passed = _compare(actual, redline.op, redline.value)
            results.append(
                {
                    "candidate_id": candidate.id,
                    "avatar": redline.avatar,
                    "field": redline.field,
                    "op": redline.op,
                    "value": redline.value,
                    "actual": actual,
                    "pass": passed,
                }
            )

    return {"results": results}


def make_ics(payload: dict) -> dict:
    req = MakeIcsInput.model_validate(payload)
    dt_start = datetime.fromisoformat(f"{req.date}T{req.time_start}:00")
    dt_end = dt_start + timedelta(minutes=req.duration_min)

    attendees = [f"ATTENDEE:mailto:{email}" for email in req.attendees]

    lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Standin//EN",
            "CALSCALE:GREGORIAN",
            "BEGIN:VEVENT",
            f"UID:{uuid4()}@standin",
            f"DTSTAMP:{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}",
            f"DTSTART:{dt_start.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{dt_end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{req.title}",
            f"DESCRIPTION:{req.description}",
            *attendees,
            "END:VEVENT",
            "END:VCALENDAR",
            "",
    ]

    ics = "\r\n".join(lines)
    return {"ics": ics, "filename": "standin-meeting.ics"}

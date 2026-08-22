"""Standin MCP server: deterministic domain tools exposed over Streamable HTTP.

Contains no LLM calls. These tools are the authoritative re-check of hard
constraints (`check_redlines`) and the calendar artifact generator (`make_ics`).
"""

from __future__ import annotations

import os
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse
from starlette.routing import Route

FieldKey = Literal["dev_days", "revenue_impact", "ux_impact", "tech_debt"]
Op = Literal["<=", ">=", "="]

# The service is internal-only in Azure Container Apps, and its ingress hostname
# is not known at build time, so the default DNS-rebinding host allowlist would
# reject every in-cluster call with 421 Misdirected Request.
mcp = FastMCP(
    "standin-mcp",
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
        allowed_hosts=["*"],
        allowed_origins=["*"],
    ),
)


class CandidateIn(BaseModel):
    id: str
    fields: dict[str, float]


class ConstraintIn(BaseModel):
    avatar: str
    field: FieldKey
    op: Op
    value: float


class RedlineResult(BaseModel):
    candidate_id: str
    avatar: str
    field: str
    op: str
    value: float
    actual: float | None
    passed: bool = Field(serialization_alias="pass")

    model_config = {"populate_by_name": True}


def _compare(actual: float, op: str, value: float) -> bool:
    if op == "<=":
        return actual <= value
    if op == ">=":
        return actual >= value
    if op == "=":
        return actual == value
    raise ValueError(f"unsupported operator: {op}")


@mcp.tool()
def check_redlines(
    candidates: list[dict[str, Any]],
    constraints: list[dict[str, Any]],
) -> dict[str, Any]:
    """Re-check every hard constraint against every candidate, deterministically.

    Returns one result row per (candidate, constraint) pair with the actual value
    and a boolean pass flag. This is the authoritative constraint check - the LLM
    verdict never overrides it.
    """
    parsed_candidates = [CandidateIn.model_validate(c) for c in candidates]
    parsed_constraints = [ConstraintIn.model_validate(c) for c in constraints]

    results: list[dict[str, Any]] = []
    for candidate in parsed_candidates:
        for constraint in parsed_constraints:
            actual = candidate.fields.get(constraint.field)
            passed = False if actual is None else _compare(actual, constraint.op, constraint.value)
            results.append(
                {
                    "candidate_id": candidate.id,
                    "avatar": constraint.avatar,
                    "field": constraint.field,
                    "op": constraint.op,
                    "value": constraint.value,
                    "actual": actual,
                    "pass": passed,
                }
            )
    return {"results": results}


def _escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    """Fold a content line to 75 octets per RFC 5545 section 3.1."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    chunks: list[str] = []
    current = bytearray()
    for char in line:
        encoded = char.encode("utf-8")
        limit = 75 if not chunks else 74
        if len(current) + len(encoded) > limit:
            chunks.append(current.decode("utf-8"))
            current = bytearray()
        current += encoded
    if current:
        chunks.append(current.decode("utf-8"))
    return "\r\n ".join(chunks)


@mcp.tool()
def make_ics(
    title: str,
    description: str,
    date: str,
    time_start: str,
    duration_min: int,
    attendees: list[str],
) -> dict[str, Any]:
    """Build an RFC 5545 VEVENT for the human follow-up meeting.

    Date math is done by the caller; this tool only formats. `date` is
    YYYY-MM-DD and `time_start` is HH:MM, both interpreted as Asia/Seoul.
    """
    year, month, day = (int(part) for part in date.split("-"))
    hour, minute = (int(part) for part in time_start.split(":"))

    start_minutes = hour * 60 + minute
    end_minutes = start_minutes + duration_min
    end_hour, end_minute = divmod(end_minutes % (24 * 60), 60)

    dtstart = f"{year:04d}{month:02d}{day:02d}T{hour:02d}{minute:02d}00"
    dtend = f"{year:04d}{month:02d}{day:02d}T{end_hour:02d}{end_minute:02d}00"
    uid = f"standin-{dtstart}@standin.local"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Standin//Meeting Preflight//KO",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{dtstart}Z",
        f"DTSTART;TZID=Asia/Seoul:{dtstart}",
        f"DTEND;TZID=Asia/Seoul:{dtend}",
        _fold(f"SUMMARY:{_escape(title)}"),
        _fold(f"DESCRIPTION:{_escape(description)}"),
    ]
    for attendee in attendees:
        lines.append(_fold(f"ATTENDEE;CN={_escape(attendee)}:mailto:{attendee.lower()}@example.com"))
    lines += ["STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"]

    return {"ics": "\r\n".join(lines) + "\r\n", "filename": "standin-meeting.ics"}


async def health(_request: Any) -> JSONResponse:
    return JSONResponse({"status": "ok"})


app = mcp.streamable_http_app()
app.router.routes.append(Route("/health", health, methods=["GET"]))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8001")))

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import UTC, datetime
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .agent_runner import call_mcp_json, run_avatar, run_facilitator
from .logic import InMemoryRateLimit, build_decision_record, compute_outcomes, deterministic_redline, next_day_iso
from .models import RunRequest, RunResult
from .presets import SAMPLE_REQUEST

app = FastAPI(title="standin-agent")
limiter = InMemoryRateLimit()


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": "ok" if os.getenv("COPILOT_GITHUB_TOKEN") else "fail",
    }


@app.get("/agent/preset")
async def preset() -> dict:
    return SAMPLE_REQUEST


@app.post("/agent/run")
async def run(request: Request) -> StreamingResponse:
    raw = await request.body()
    if len(raw) > 8192:
        raise HTTPException(status_code=413, detail="payload too large")

    ip = request.client.host if request.client else "unknown"
    ok, code = limiter.acquire(ip)
    if not ok:
        raise HTTPException(status_code=code or 429, detail="rate limited")

    try:
        req = RunRequest.model_validate_json(raw)
    except Exception as exc:
        limiter.release(ip)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    start = time.monotonic()

    async def emit(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate() -> AsyncIterator[str]:
        token_present = bool(os.getenv("COPILOT_GITHUB_TOKEN"))
        mcp_url = os.getenv("MCP_URL", "http://127.0.0.1:8001/mcp")

        try:
            yield await emit("phase", {"phase": "received"})
            yield await emit("phase", {"phase": "evaluating"})

            tasks = {
                asyncio.create_task(run_avatar(req, avatar, mcp_url, token_present)): avatar
                for avatar in req.avatars
            }
            evals = []
            while tasks:
                done, _ = await asyncio.wait(tasks.keys(), timeout=10, return_when=asyncio.FIRST_COMPLETED)
                if not done:
                    yield await emit("heartbeat", {})
                    continue
                for t in done:
                    tasks.pop(t, None)
                    try:
                        rows = t.result()
                    except Exception:
                        rows = []
                    for row in rows:
                        evals.append(row)
                        yield await emit("avatar_result", row.model_dump(mode="json"))

            yield await emit("phase", {"phase": "verdict"})
            try:
                redline = await call_mcp_json(
                    mcp_url,
                    "check_redlines",
                    {
                        "candidates": [
                            {"id": c.id, "fields": c.fields.model_dump(mode="json")}
                            for c in req.candidates
                        ],
                        "constraints": [
                            {
                                "avatar": a.name,
                                "field": h.field,
                                "op": h.op.value,
                                "value": h.value,
                            }
                            for a in req.avatars
                            for h in a.hard_constraints
                        ],
                    },
                )
            except Exception:
                redline = deterministic_redline(req.candidates, req.avatars)

            outcomes = compute_outcomes(req.candidates, req.avatars, evals, redline)

            yield await emit("phase", {"phase": "briefing"})
            briefing = await run_facilitator(
                req,
                [o.model_dump(mode="json") for o in outcomes],
                [e.model_dump(mode="json") for e in evals],
                token_present,
            )

            ics = None
            if any(o.status.value == "CONTESTED" for o in outcomes):
                try:
                    ics = await call_mcp_json(
                        mcp_url,
                        "make_ics",
                        {
                            "title": "Standin 사람 회의",
                            "description": "CONTESTED 안건 검토",
                            "date": next_day_iso(),
                            "time_start": "10:00",
                            "duration_min": 30,
                            "attendees": [],
                        },
                    )
                except Exception:
                    ics = {
                        "filename": "standin-meeting.ics",
                        "ics": "\r\n".join(
                            [
                                "BEGIN:VCALENDAR",
                                "VERSION:2.0",
                                "PRODID:-//Standin//EN",
                                "BEGIN:VEVENT",
                                f"DTSTAMP:{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}",
                                "SUMMARY:Standin 사람 회의",
                                f"DTSTART:{next_day_iso().replace('-', '')}T100000",
                                "DURATION:PT30M",
                                "END:VEVENT",
                                "END:VCALENDAR",
                                "",
                            ]
                        ),
                    }

            decision_record = build_decision_record(req.agenda, outcomes, briefing)
            measured = round(time.monotonic() - start, 2)
            result = RunResult(
                outcomes=outcomes,
                briefing_md=briefing,
                decision_record_md=decision_record,
                ics=(
                    {
                        "filename": ics.get("filename", "standin-meeting.ics"),
                        "content": ics.get("ics", ""),
                    }
                    if ics
                    else None
                ),
                receipt={
                    "expected_person_minutes": req.expected_minutes * req.attendees,
                    "measured_seconds": measured,
                },
            )
            yield await emit("phase", {"phase": "done"})
            yield await emit("final", result.model_dump(mode="json"))
        except Exception as exc:
            yield await emit("phase", {"phase": "error"})
            yield await emit("error", {"code": "RUN_FAILED", "detail": "internal error"})
        finally:
            limiter.release(ip)

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

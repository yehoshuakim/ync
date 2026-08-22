"""Standin agent service: FastAPI + SSE, backed by Agent Framework / Copilot SDK."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError

from .models import RunRequest
from .orchestrator import run_preflight

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("standin.agent")

MAX_BODY_BYTES = 8 * 1024
MAX_RUNS_PER_HOUR = 60
HEARTBEAT_INTERVAL_S = 10.0
RETRY_AFTER_S = 30
GLOBAL_CONCURRENCY = 12
SEMAPHORE_ACQUIRE_TIMEOUT_S = 1e-6

_history: dict[str, deque[float]] = defaultdict(deque)
_slots = asyncio.Semaphore(GLOBAL_CONCURRENCY)
_guard = asyncio.Lock()
_model_status = {"model": "unknown"}


def mcp_url() -> str | None:
    raw = os.getenv("MCP_URL") or os.getenv("services__mcp__http__0")
    if not raw:
        return None
    raw = raw.rstrip("/")
    return raw if raw.endswith("/mcp") else f"{raw}/mcp"


async def probe_model() -> str:
    """Gate 0 at startup: one real Copilot SDK call, surfaced on /health."""
    token = (
        os.getenv("COPILOT_GITHUB_TOKEN")
        or os.getenv("GH_TOKEN")
        or os.getenv("GITHUB_TOKEN")
    )
    if not token:
        return "fail"
    os.environ.setdefault("COPILOT_GITHUB_TOKEN", token)
    try:
        from agent_framework.github import GitHubCopilotAgent

        agent = GitHubCopilotAgent(name="healthcheck", instructions="Reply with one word.")
        result = await asyncio.wait_for(agent.run("Reply with exactly: OK"), timeout=60)
        return "ok" if str(result).strip() else "fail"
    except Exception:  # noqa: BLE001
        logger.warning("startup model probe failed", exc_info=True)
        return "fail"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    async def probe() -> None:
        _model_status["model"] = await probe_model()
        logger.info("model probe: %s", _model_status["model"])

    task = asyncio.create_task(probe())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="Standin Agent", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": _model_status["model"]}


@app.get("/agent/health")
async def agent_health() -> dict[str, str]:
    return await health()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def acquire_slot(ip: str) -> str | None:
    """Abuse guard for a login-free public endpoint. Generous enough that a judge
    never hits it."""
    now = time.time()
    async with _guard:
        bucket = _history[ip]
        while bucket and now - bucket[0] > 3600:
            bucket.popleft()
        if len(bucket) >= MAX_RUNS_PER_HOUR:
            return "rate_limited"
        try:
            await asyncio.wait_for(_slots.acquire(), timeout=SEMAPHORE_ACQUIRE_TIMEOUT_S)
        except TimeoutError:
            return "concurrent_limit"
        bucket.append(now)
    return None


async def release_slot() -> None:
    _slots.release()


def sse(event: str, payload: Any) -> bytes:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@app.post("/agent/run")
async def agent_run(request: Request) -> Any:
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        return JSONResponse({"code": "payload_too_large", "message": "요청이 너무 큽니다."}, status_code=413)

    try:
        parsed = RunRequest.model_validate_json(raw)
    except ValidationError as exc:
        return JSONResponse(
            {"code": "invalid_request", "message": "입력값을 확인해 주세요.", "detail": exc.errors()[:5]},
            status_code=422,
        )

    ip = client_ip(request)
    denied = await acquire_slot(ip)
    if denied:
        return JSONResponse(
            {"code": denied, "message": "요청이 많습니다. 잠시 후 다시 시도해 주세요."},
            status_code=429,
            headers={"Retry-After": str(RETRY_AFTER_S)},
        )

    async def stream() -> AsyncIterator[bytes]:
        queue: asyncio.Queue[tuple[str, Any] | None] = asyncio.Queue()

        async def produce() -> None:
            try:
                async for event, payload in run_preflight(parsed, mcp_url()):
                    await queue.put((event, payload))
            except Exception as exc:  # noqa: BLE001
                logger.exception("preflight failed")
                await queue.put(("error", {"code": "run_failed", "message": str(exc)[:200]}))
            finally:
                await queue.put(None)

        producer = asyncio.create_task(produce())
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL_S)
                except asyncio.TimeoutError:
                    yield sse("heartbeat", {})
                    continue
                if item is None:
                    break
                yield sse(item[0], item[1])
        finally:
            producer.cancel()
            await release_slot()

    return StreamingResponse(stream(), media_type="text/event-stream", headers=SSE_HEADERS)

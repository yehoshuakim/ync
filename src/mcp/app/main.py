from __future__ import annotations

from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP

from .tools import check_redlines as check_redlines_impl
from .tools import make_ics as make_ics_impl

mcp_server = FastMCP(
    name="standin-mcp",
    streamable_http_path="/",
)


@mcp_server.tool(name="check_redlines")
def check_redlines(payload: dict) -> dict:
    return check_redlines_impl(payload)


@mcp_server.tool(name="make_ics")
def make_ics(payload: dict) -> dict:
    return make_ics_impl(payload)


app = FastAPI(title="standin-mcp")
app.mount("/mcp", mcp_server.streamable_http_app())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

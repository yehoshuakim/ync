"""Thin async client for the Standin MCP service over Streamable HTTP.

Uses Agent Framework's MCPStreamableHTTPTool as the transport so that the same
tool object can also be handed to agents as a callable tool.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from agent_framework import MCPStreamableHTTPTool

logger = logging.getLogger(__name__)


def build_tool(url: str, request_timeout: int = 20) -> MCPStreamableHTTPTool:
    return MCPStreamableHTTPTool(
        "standin-mcp",
        url,
        load_prompts=False,
        approval_mode="never_require",
        request_timeout=request_timeout,
    )


def _extract_payload(raw: Any) -> dict[str, Any]:
    """Normalise an MCP tool result (str, Content list, or CallToolResult) into a dict."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        return json.loads(raw)

    structured = getattr(raw, "structuredContent", None) or getattr(raw, "structured_content", None)
    if isinstance(structured, dict):
        return structured.get("result", structured)

    contents = raw if isinstance(raw, list) else getattr(raw, "content", None)
    if contents:
        for item in contents:
            text = item if isinstance(item, str) else getattr(item, "text", None)
            if text:
                return json.loads(text)

    raise ValueError(f"unrecognised MCP tool result: {type(raw)!r}")


async def call_tool(url: str, name: str, arguments: dict[str, Any], timeout: int = 20) -> dict[str, Any]:
    tool = build_tool(url, request_timeout=timeout)
    await tool.connect()
    try:
        raw = await tool.call_tool(name, **arguments)
        return _extract_payload(raw)
    finally:
        try:
            await tool.close()
        except Exception:  # noqa: BLE001 - closing must never mask the real result
            logger.debug("mcp tool close failed", exc_info=True)

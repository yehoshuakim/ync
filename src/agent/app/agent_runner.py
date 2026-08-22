from __future__ import annotations

import asyncio
import json
from pathlib import Path

from agent_framework import MCPStreamableHTTPTool
from agent_framework.github import GitHubCopilotAgent

from .logic import mechanical_eval, parse_json_block
from .models import Avatar, AvatarEval, AvatarVerdict, RunRequest

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_instruction(name: str) -> str:
    return (BASE_DIR / "instructions" / name).read_text(encoding="utf-8")


def _user_xml(payload: str) -> str:
    return f"<user_input>\n{payload}\n</user_input>"


def _render_avatar_prompt(req: RunRequest, avatar: Avatar) -> str:
    content = {
        "agenda": req.agenda,
        "avatar": avatar.model_dump(mode="json"),
        "candidates": [c.model_dump(mode="json") for c in req.candidates],
    }
    return _user_xml(json.dumps(content, ensure_ascii=False, indent=2))


def _render_avatar_instruction(avatar: Avatar) -> str:
    tmpl = _load_instruction("avatar.md")
    return tmpl.format(name=avatar.name, role=avatar.role, top_priority=avatar.top_priority)


def _render_facilitator_prompt(req: RunRequest, outcomes: list[dict], evals: list[dict]) -> str:
    content = {
        "agenda": req.agenda,
        "outcomes": outcomes,
        "evaluations": evals,
    }
    return _user_xml(json.dumps(content, ensure_ascii=False, indent=2))


def _mcp_client(mcp_url: str) -> MCPStreamableHTTPTool:
    return MCPStreamableHTTPTool(
        "standin-mcp",
        mcp_url,
        allowed_tools=["check_redlines", "make_ics"],
        approval_mode="never_require",
        load_prompts=False,
    )


async def call_mcp_json(mcp_url: str, tool_name: str, payload: dict) -> dict:
    tool = _mcp_client(mcp_url)
    result = await tool.call_tool(tool_name, payload=payload)

    if isinstance(result, str):
        return parse_json_block(result)

    chunks: list[str] = []
    for item in result:
        text = getattr(item, "text", None)
        if text:
            chunks.append(text)
    if chunks:
        return parse_json_block("\n".join(chunks))

    raise ValueError("MCP response is empty")


async def run_avatar(
    req: RunRequest,
    avatar: Avatar,
    mcp_url: str,
    token_present: bool,
) -> list[AvatarEval]:
    fallback = [mechanical_eval(avatar, c, llm_fallback=True) for c in req.candidates]
    if not token_present:
        return fallback

    agent = GitHubCopilotAgent(
        name=f"avatar-{avatar.name}",
        instructions=_render_avatar_instruction(avatar),
        tools=[_mcp_client(mcp_url)],
    )
    prompt = _render_avatar_prompt(req, avatar)

    for _ in range(3):
        try:
            text = await asyncio.wait_for(agent.run(prompt), timeout=90)
            data = parse_json_block(str(text))
            items = data.get("evaluations", [])
            parsed: list[AvatarEval] = []
            by_id = {c.id: c for c in req.candidates}
            for item in items:
                cid = item["candidate_id"]
                if cid not in by_id:
                    continue
                parsed.append(
                    AvatarEval(
                        avatar=avatar.name,
                        candidate_id=cid,
                        verdict=AvatarVerdict(item["verdict"]),
                        evidence=item["evidence"],
                        cited_constraint=item.get("cited_constraint"),
                        llm_fallback=False,
                    )
                )
            if len(parsed) == len(req.candidates):
                return parsed
        except Exception:
            continue

    return fallback


async def run_facilitator(
    req: RunRequest,
    outcomes: list[dict],
    evals: list[dict],
    token_present: bool,
) -> str:
    if not token_present:
        return "- AI 생성 — 검토 후 사용\n- 결정적 판정 결과를 바탕으로 사람 회의 필요 항목만 검토하세요."

    agent = GitHubCopilotAgent(
        name="facilitator",
        instructions=_load_instruction("facilitator.md"),
    )
    try:
        return str(await asyncio.wait_for(agent.run(_render_facilitator_prompt(req, outcomes, evals)), timeout=90)).strip()
    except Exception:
        return "- AI 생성 — 검토 후 사용\n- 브리핑 생성에 실패하여 요약 템플릿을 사용했습니다."

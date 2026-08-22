"""Gate 0 smoke test: verify GitHubCopilotAgent returns text via Copilot SDK.

Run: uv run python tests/smoke_model.py
Exit 0 = model path is healthy. Any other exit = stop and fix auth before building UI.
"""

import asyncio
import os
import sys
import time

from agent_framework.github import GitHubCopilotAgent


async def main() -> int:
    token = os.getenv("COPILOT_GITHUB_TOKEN") or os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN")
    if not token:
        print("FAIL: no COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN in environment")
        return 2
    os.environ.setdefault("COPILOT_GITHUB_TOKEN", token)

    agent = GitHubCopilotAgent(
        name="smoke",
        instructions="You are a terse test probe. Reply with exactly one word.",
    )
    started = time.perf_counter()
    result = await agent.run("Reply with exactly one word: PONG")
    elapsed = time.perf_counter() - started

    text = str(result).strip()
    print(f"elapsed={elapsed:.1f}s")
    print(f"text={text[:200]!r}")
    if not text:
        print("FAIL: empty response")
        return 1
    print("GATE0 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

"""Gate 0 smoke test for GitHub Copilot SDK path.

Run:
  python -m tests.smoke_model
"""

from __future__ import annotations

import asyncio
import os
import sys

from agent_framework.github import GitHubCopilotAgent


async def main() -> int:
    token = os.getenv("COPILOT_GITHUB_TOKEN")
    if not token:
        print("GATE0_SKIP: COPILOT_GITHUB_TOKEN not set; SDK import path verified.")
        return 0

    agent = GitHubCopilotAgent(
        name="gate0-smoke",
        instructions="Return exactly one short Korean sentence.",
    )
    response = await agent.run("Say hello in Korean.")
    text = str(response).strip()
    if not text:
        print("GATE0_FAIL: empty response")
        return 1

    print("GATE0_OK:", text)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

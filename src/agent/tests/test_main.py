from __future__ import annotations

import unittest
from time import time

from fastapi.testclient import TestClient

from app import main


def sample_payload() -> dict:
    return {
        "agenda": "9월 스프린트: 다음 2주 동안 무엇을 먼저 만들까?",
        "expected_minutes": 30,
        "attendees": 3,
        "candidates": [
            {
                "id": "A",
                "name": "간편 온보딩 개선",
                "fields": {"dev_days": 6, "revenue_impact": 3, "ux_impact": 5, "tech_debt": 2},
            },
            {
                "id": "B",
                "name": "결제 연동",
                "fields": {"dev_days": 9, "revenue_impact": 5, "ux_impact": 2, "tech_debt": 3},
            },
            {
                "id": "C",
                "name": "관리자 대시보드",
                "fields": {"dev_days": 12, "revenue_impact": 2, "ux_impact": 2, "tech_debt": 4},
            },
        ],
        "avatars": [
            {
                "name": "Yehoshua",
                "role": "COO",
                "top_priority": "revenue_impact",
                "hard_constraints": [{"field": "dev_days", "op": "<=", "value": 10}],
            },
            {
                "name": "Caleb",
                "role": "Lead Developer",
                "top_priority": "tech_debt",
                "hard_constraints": [
                    {"field": "dev_days", "op": "<=", "value": 10},
                    {"field": "tech_debt", "op": "<=", "value": 3},
                ],
            },
            {
                "name": "Samuel",
                "role": "Product Designer",
                "top_priority": "ux_impact",
                "hard_constraints": [{"field": "ux_impact", "op": ">=", "value": 2}],
            },
        ],
    }


class AgentMainTests(unittest.TestCase):
    def setUp(self) -> None:
        main._history.clear()
        main._slots = main.asyncio.Semaphore(main.GLOBAL_CONCURRENCY)
        self.client = TestClient(main.app)
        self.original_run_preflight = main.run_preflight

    def tearDown(self) -> None:
        main.run_preflight = self.original_run_preflight

    def test_rate_limit_returns_retry_after_header(self) -> None:
        ip = "203.0.113.10"
        main._history[ip].extend([time()] * main.MAX_RUNS_PER_HOUR)

        response = self.client.post(
            "/agent/run",
            json=sample_payload(),
            headers={"x-forwarded-for": ip},
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], str(main.RETRY_AFTER_S))
        self.assertEqual(response.json()["code"], "rate_limited")

    def test_global_concurrency_limit_returns_retry_after_header(self) -> None:
        main._slots = main.asyncio.Semaphore(0)

        response = self.client.post(
            "/agent/run",
            json=sample_payload(),
            headers={"x-forwarded-for": "198.51.100.20"},
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], str(main.RETRY_AFTER_S))
        self.assertEqual(response.json()["code"], "concurrent_limit")

    def test_stream_release_returns_global_slot(self) -> None:
        async def fake_run_preflight(_parsed, _mcp_url):
            yield "phase", {"phase": "received"}
            yield "done", {"ok": True}

        main.run_preflight = fake_run_preflight

        with self.client.stream(
            "POST",
            "/agent/run",
            json=sample_payload(),
            headers={"x-forwarded-for": "192.0.2.40"},
        ) as response:
            body = "".join(response.iter_text())

        async def acquire_all_slots() -> int:
            acquired = 0
            for _ in range(main.GLOBAL_CONCURRENCY):
                await main.asyncio.wait_for(main._slots.acquire(), timeout=0.01)
                acquired += 1
            return acquired

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: phase", body)
        loop = main.asyncio.new_event_loop()
        try:
            acquired = loop.run_until_complete(acquire_all_slots())
        finally:
            loop.close()
        self.assertEqual(acquired, main.GLOBAL_CONCURRENCY)
        for _ in range(acquired):
            main._slots.release()


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from app.models import RunRequest
from app.verdict import compute_outcome, local_redlines, rule_based_eval


class VerdictContractTests(unittest.TestCase):
    def test_sample_contract_statuses(self) -> None:
        request = RunRequest.model_validate(
            {
                "agenda": "9월 스프린트: 다음 2주 동안 무엇을 먼저 만들까?",
                "expected_minutes": 30,
                "attendees": 3,
                "candidates": [
                    {
                        "id": "A",
                        "name": "간편 온보딩 개선",
                        "fields": {
                            "dev_days": 6,
                            "revenue_impact": 3,
                            "ux_impact": 5,
                            "tech_debt": 2,
                        },
                    },
                    {
                        "id": "B",
                        "name": "결제 연동 (토스페이먼츠)",
                        "fields": {
                            "dev_days": 9,
                            "revenue_impact": 5,
                            "ux_impact": 2,
                            "tech_debt": 3,
                        },
                    },
                    {
                        "id": "C",
                        "name": "관리자 대시보드",
                        "fields": {
                            "dev_days": 12,
                            "revenue_impact": 2,
                            "ux_impact": 2,
                            "tech_debt": 4,
                        },
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
        )

        redlines = local_redlines(request.candidates, request.avatars)
        outcomes = {}
        for candidate in request.candidates:
            evals = [
                rule_based_eval(candidate, avatar, redlines, fallback=True)
                for avatar in request.avatars
            ]
            outcome = compute_outcome(candidate, request.avatars, redlines, evals)
            outcomes[outcome.candidate_id] = outcome.status

        self.assertEqual(
            outcomes,
            {"A": "RESOLVED", "B": "CONTESTED", "C": "REJECTED"},
        )


if __name__ == "__main__":
    unittest.main()

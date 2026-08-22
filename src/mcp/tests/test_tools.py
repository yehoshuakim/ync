from app.tools import check_redlines, make_ics


def test_check_redlines_operators() -> None:
    out = check_redlines(
        {
            "candidates": [
                {"id": "A", "fields": {"dev_days": 6, "revenue_impact": 3, "ux_impact": 5, "tech_debt": 2}}
            ],
            "constraints": [
                {"avatar": "Y", "field": "dev_days", "op": "<=", "value": 10},
                {"avatar": "C", "field": "ux_impact", "op": ">=", "value": 5},
                {"avatar": "D", "field": "tech_debt", "op": "=", "value": 2},
            ],
        }
    )
    assert [r["pass"] for r in out["results"]] == [True, True, True]


def test_make_ics_content() -> None:
    out = make_ics(
        {
            "title": "Standin contested review",
            "description": "Review candidate B",
            "date": "2026-08-23",
            "time_start": "10:00",
            "duration_min": 30,
            "attendees": ["a@example.com"],
        }
    )
    assert out["filename"] == "standin-meeting.ics"
    assert "BEGIN:VCALENDAR" in out["ics"]
    assert "SUMMARY:Standin contested review" in out["ics"]

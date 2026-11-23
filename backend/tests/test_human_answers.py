"""Fixture guard for the normal-student answer calibration sample."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HUMAN = ROOT / "tests" / "data" / "human_answers.json"


def test_human_answers_fixture_shape():
    payload = json.loads(HUMAN.read_text(encoding="utf-8"))
    answers = payload["answers"]

    assert len(answers) == 30
    assert payload["APPEND_NEW_ANSWERS_HERE"] == []
    assert all(set(item) == {"bank_index", "expected_band", "answer"} for item in answers)
    assert all(1 <= item["bank_index"] <= 10 for item in answers)
    for band in ("good", "half-right", "wrong"):
        assert sum(item["expected_band"] == band for item in answers) == 10
        assert band in payload["bands"]

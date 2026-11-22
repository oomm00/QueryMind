"""The two-repo demo must never silently fall back to a mocked API domain."""

import re
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "start-demo.ps1"


def test_start_demo_disables_every_mock_domain() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert re.search(r"^\$env:VITE_USE_MOCKS = 'false'$", text, re.MULTILINE)

    for domain in (
        "AUTH",
        "QUESTIONS",
        "ATTEMPTS",
        "DOCUMENTS",
        "PROFILE_GOAL",
        "NEXT_PARAMS",
        "PROFILE",
        "HISTORY",
        "CATALOG",
        "CONTENT",
    ):
        assert re.search(
            rf"^\$env:VITE_MOCK_{domain} = 'false'$", text, re.MULTILINE
        ), f"VITE_MOCK_{domain} is not pinned to false"

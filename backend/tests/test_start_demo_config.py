"""The two-repo demo must never silently mock learner data APIs."""

import re
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "start-demo.ps1"

REAL_DOMAINS = (
    "AUTH",
    "QUESTIONS",
    "ATTEMPTS",
    "DOCUMENTS",
    "PROFILE_GOAL",
    "NEXT_PARAMS",
    "PROFILE",
    "HISTORY",
)

# The backend has no catalog/content routers; these are static UI fixtures.
LOCAL_DOMAINS = ("CATALOG", "CONTENT")


def _value(domain: str) -> str:
    text = SCRIPT.read_text(encoding="utf-8")
    match = re.search(rf"^\$env:VITE_MOCK_{domain} = '(true|false)'$", text, re.MULTILINE)
    assert match, f"VITE_MOCK_{domain} is not pinned"
    return match.group(1)


def test_start_demo_uses_real_apis_for_learner_data() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    assert re.search(r"^\$env:VITE_USE_MOCKS = 'false'$", text, re.MULTILINE)

    for domain in REAL_DOMAINS:
        assert _value(domain) == "false", f"VITE_MOCK_{domain} must call the backend"

    for domain in LOCAL_DOMAINS:
        assert _value(domain) == "true", f"VITE_MOCK_{domain} must stay a static fixture"

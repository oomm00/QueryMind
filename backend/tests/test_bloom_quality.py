"""
Tests — Bloom Quality Pipeline (per-level spec, stem check, alignment gate)
===========================================================================
Step 3f coverage for the Bloom prompt/validation fixes:

1. ``check_stem`` passes for a correctly-phrased question at every level and
   fails when the opening uses a forbidden lower-level verb or no allowed stem.
2. ``BLOOM_FORBIDDEN_VERBS``: lower-level verbs are forbidden at higher levels,
   own-level verbs never are.
3. Alignment tolerance logic: the ``settings.bloom_alignment_tolerance`` map
   plus the LLM-judge gate (within tolerance passes, beyond tolerance fails,
   judge failure/absence skips the gate).
4. Regeneration feedback path: the route feeds the specific stem violation back
   via ``extra_instruction``; a persistent Bloom mismatch surfaces as the
   distinct ``BLOOM_ALIGNMENT_MISMATCH`` 422 code.
5. Backward compatibility of the ``GeneratedQuestion`` schema (new optional
   ``context_warning`` field) plus the thin-context Apply+ guard and the
   structured per-level generation prompt.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional
from unittest.mock import MagicMock

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import questions as questions_module
from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base
from app.models.models import User
from app.schemas.schemas import GeneratedQuestion
from app.services import llm_utils, validation_service
from app.services.generation_service import (
    BLOOM_FORBIDDEN_VERBS,
    THIN_CONTEXT_MIN_CHARS,
    _build_prompt,
    check_stem,
    generate_question,
)
from app.services.validation_service import (
    check_cognitive_alignment,
    check_stem_alignment,
    validate_question,
)

import app.models.models  # noqa: F401 — register models on Base.metadata


@pytest.fixture(autouse=True)
def _deterministic_llm_paths(monkeypatch):
    """Single-model chain + zero backoff: judge/generation calls stay instant."""
    monkeypatch.setattr(settings, "llm_fallback_models", [])
    monkeypatch.setattr(llm_utils, "LLM_BACKOFF_BASE_SECONDS", 0.0)


# ── 1. Deterministic stem check (per level) ──────────────────────────────────

_COMPLIANT = [
    ("remember", "State the three ACID properties of a transaction."),
    ("understand", "Explain how two-phase locking guarantees serializability."),
    ("apply", "Solve the resource-allocation case for the given schedule."),
    ("analyze", "Differentiate strict 2PL from rigorous 2PL in the scenario above."),
    ("evaluate", "Critique the proposed isolation design against the anomaly risks."),
    ("create", "Design a deadlock-recovery policy for the allocation graph above."),
]


@pytest.mark.parametrize("level,text", _COMPLIANT)
def test_stem_passes_for_compliant_question_per_level(level, text):
    result = check_stem(text, level)
    assert result["is_compliant"] is True
    assert result["allowed_hit"] is not None
    assert result["forbidden_hit"] is None


@pytest.mark.parametrize(
    "level,text,forbidden",
    [
        ("apply", "Define the ACID properties of a transaction.", "define"),
        ("analyze", "List the lock modes used in 2PL.", "list"),
        ("analyze", "Explain how 2PL works in the scenario above.", "explain"),
        ("evaluate", "Describe what READ COMMITTED isolation does.", "describe"),
        ("create", "Summarize the deadlock-handling techniques.", "summarize"),
    ],
)
def test_stem_rejects_forbidden_lower_level_opening(level, text, forbidden):
    result = check_stem(text, level)
    assert result["is_compliant"] is False
    assert result["forbidden_hit"] == forbidden


def test_stem_rejects_question_word_opening():
    result = check_stem("What is two-phase locking?", "apply")
    assert result["is_compliant"] is False
    assert result["allowed_hit"] is None
    assert result["forbidden_hit"] is None


def test_stem_matches_verb_inflections():
    # "listed" must match the forbidden verb "list" at analyze.
    result = check_stem(
        "Listed the steps you would follow to detect a deadlock.", "analyze"
    )
    assert result["is_compliant"] is False
    assert result["forbidden_hit"] == "list"


def test_stem_allows_connector_opening_with_valid_verb():
    # "Using ..." is a legitimate Apply opening: the forbidden zone is the stem
    # (first 3 words), so the lower-level verb "use" appearing as a connector
    # later in the opening does not fail the check.
    result = check_stem(
        "Using the transaction schedule, calculate the final balances.", "apply"
    )
    assert result["is_compliant"] is True
    assert result["allowed_hit"] == "use"


def test_stem_unconstrained_for_unknown_level():
    assert check_stem("What is anything?", "")["is_compliant"] is True
    assert check_stem_alignment("What is anything?", "bogus")["is_compliant"] is True


def test_forbidden_verbs_exclude_own_level_verbs():
    assert "outline" not in BLOOM_FORBIDDEN_VERBS["understand"]  # own verb too
    assert BLOOM_FORBIDDEN_VERBS["remember"] == []  # nothing below remember
    assert "define" in BLOOM_FORBIDDEN_VERBS["apply"]
    assert "explain" in BLOOM_FORBIDDEN_VERBS["analyze"]
    assert "critique" in BLOOM_FORBIDDEN_VERBS["create"]


def test_stem_alignment_shapes_violations():
    result = check_stem_alignment("Define ACID.", "apply")
    assert result["is_compliant"] is False
    assert any("forbidden lower-level verb 'define'" in v for v in result["violations"])


# ── 3. Alignment tolerance logic ─────────────────────────────────────────────

def test_default_alignment_tolerance_map():
    assert settings.tolerance_for("remember") == 1
    assert settings.tolerance_for("understand") == 1
    for level in ("apply", "analyze", "evaluate", "create"):
        assert settings.tolerance_for(level) == 0


def test_alignment_tolerance_parses_overrides(monkeypatch):
    monkeypatch.setattr(
        settings, "bloom_alignment_tolerance", "remember=2, apply=1, default=0, bogus=x"
    )
    assert settings.tolerance_for("remember") == 2
    assert settings.tolerance_for("apply") == 1
    assert settings.tolerance_for("create") == 0  # falls back to default


def test_alignment_tolerance_unknown_level_uses_default(monkeypatch):
    monkeypatch.setattr(settings, "bloom_alignment_tolerance", "default=1")
    assert settings.tolerance_for("nonsense") == 1


class _Resp:
    def __init__(self, text: str) -> None:
        self.text = text


class _Judge:
    """Minimal judge client: replies with ``{"actual_level": ...}`` (or raises)."""

    def __init__(self, reply: Any) -> None:
        self._reply = reply
        self.prompts: list[str] = []

    def generate_content(self, prompt: str, model: Optional[str] = None) -> _Resp:
        self.prompts.append(prompt)
        if isinstance(self._reply, Exception):
            raise self._reply
        return _Resp(json.dumps({"actual_level": self._reply}))


def test_alignment_gate_exact_match_passes():
    result = check_cognitive_alignment("Design a policy.", "create", llm_client=_Judge("create"))
    assert result["evaluated"] is True
    assert result["is_aligned"] is True
    assert result["distance"] == 0


def test_alignment_gate_within_tolerance_passes():
    result = check_cognitive_alignment("Explain it.", "remember", llm_client=_Judge("understand"))
    assert result["evaluated"] is True
    assert result["is_aligned"] is True
    assert result["detected_level"] == "understand"
    assert result["distance"] == 1


def test_alignment_gate_beyond_tolerance_fails():
    result = check_cognitive_alignment("Explain it.", "remember", llm_client=_Judge("apply"))
    assert result["is_aligned"] is False
    assert result["distance"] == 2  # tolerance for remember is 1


def test_alignment_gate_zero_tolerance_for_apply():
    result = check_cognitive_alignment("Solve it.", "apply", llm_client=_Judge("analyze"))
    assert result["is_aligned"] is False
    assert result["distance"] == 1
    assert result["tolerance"] == 0


def test_alignment_gate_skips_without_judge():
    result = check_cognitive_alignment("Solve it.", "apply", llm_client=None)
    assert result["is_aligned"] is True
    assert result["evaluated"] is False


def test_alignment_gate_skips_on_judge_failure():
    result = check_cognitive_alignment(
        "Solve it.", "apply", llm_client=_Judge(RuntimeError("judge down"))
    )
    assert result["is_aligned"] is True
    assert result["evaluated"] is False
    assert "failed" in result["reason"]


def test_alignment_gate_skips_on_invalid_verdict():
    result = check_cognitive_alignment("Solve it.", "apply", llm_client=_Judge("banana"))
    assert result["is_aligned"] is True
    assert result["evaluated"] is False


def test_alignment_gate_unconstrained_without_level():
    result = check_cognitive_alignment("Solve it.", "", llm_client=_Judge("apply"))
    assert result["is_aligned"] is True
    assert result["evaluated"] is False


# ── Stem check wired into validate_question ─────────────────────────────────

def _payload(question: str, bloom: str) -> dict:
    return {
        "question": question,
        "correct_answer": "Two-phase locking has growing and shrinking phases.",
        "explanation": "Grounded in the transactions lecture.",
        "bloom_level": bloom,
        "difficulty": "medium",
    }


def _fake_embeddings(monkeypatch):
    # Identical vectors -> answerability similarity 1.0 (passes); no stored
    # history -> duplicate check short-circuits without embedding anything.
    monkeypatch.setattr(
        validation_service, "embed_texts", lambda texts: np.ones((len(texts), 2))
    )
    monkeypatch.setattr(validation_service, "_query_existing", lambda db, s, t: [])


def test_validate_question_flags_stem_violation(monkeypatch):
    _fake_embeddings(monkeypatch)
    result = validate_question(
        _payload("What is two-phase locking?", "apply"),
        "DBMS", "Transactions", ["A grounded chunk."], MagicMock(),
    )
    assert result["passed"] is False
    assert result["reason_code"] == "stem"
    assert result["stem_check"]["is_compliant"] is False


def test_validate_question_passes_stem_compliant_question(monkeypatch):
    _fake_embeddings(monkeypatch)
    result = validate_question(
        _payload("Solve the lock-escalation case for the given schedule.", "apply"),
        "DBMS", "Transactions", ["A grounded chunk."], MagicMock(),
    )
    assert result["passed"] is True
    assert result["reason"] is None
    assert result["stem_check"]["is_compliant"] is True


# ── 4. Regeneration feedback path (route level) ─────────────────────────────

@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def authed_client(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"bloom_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app), user


def _generated() -> GeneratedQuestion:
    return GeneratedQuestion(
        question="Explain how Two-Phase Locking prevents dirty reads.",
        correct_answer="Exclusive locks are held until commit.",
        explanation="Grounded in the transactions lecture.",
        bloom_level="analyze",
        difficulty="hard",
        source_chunks=["transactions.pdf"],
    )


_PASS = {
    "passed": True,
    "duplicate_check": {"is_duplicate": False, "similarity": 0.1},
    "answerability_check": {"is_answerable": True, "best_match_score": 0.8},
    "stem_check": {"is_compliant": True, "violations": []},
    "cognitive_alignment_check": {
        "is_aligned": True, "evaluated": True, "detected_level": "analyze",
        "requested_level": "analyze", "distance": 0, "tolerance": 0,
        "reason": "aligned",
    },
    "reason": None,
    "reason_code": None,
}

_STEM_FAIL = {
    **_PASS,
    "passed": False,
    "stem_check": {
        "is_compliant": False,
        "violations": ["opening uses forbidden lower-level verb 'explain'"],
        "reason": "opening uses forbidden lower-level verb 'explain'",
    },
    "reason": "Bloom stem violation for level 'analyze': opening uses forbidden lower-level verb 'explain'.",
    "reason_code": "stem",
}

_COGNITIVE_FAIL = {
    **_PASS,
    "passed": False,
    "cognitive_alignment_check": {
        "is_aligned": False, "evaluated": True, "detected_level": "understand",
        "requested_level": "analyze", "distance": 2, "tolerance": 0,
        "reason": "question classified as 'understand'",
    },
    "reason": "Cognitive level mismatch: question reads as 'understand' but 'analyze' was requested (distance 2 > tolerance 0).",
    "reason_code": "cognitive",
}

_PAYLOAD = {
    "topic": "Transactions",
    "subject": "DBMS",
    "bloom_level": "analyze",
    "difficulty": "hard",
    "question_type": "open",
}


def _patch_pipeline(monkeypatch, validations):
    monkeypatch.setattr(
        questions_module, "retrieve_context",
        MagicMock(return_value=[{"text": "2PL has growing and shrinking phases.", "source_doc": "t.pdf"}]),
    )
    gen = MagicMock(side_effect=lambda **kwargs: _generated())
    monkeypatch.setattr(questions_module, "generate_question", gen)
    validate = MagicMock(side_effect=validations)
    monkeypatch.setattr(questions_module, "validate_question", validate)
    judge = MagicMock()
    monkeypatch.setattr(questions_module, "_configure_genai", MagicMock(return_value=judge))
    return gen, validate, judge


def test_route_feeds_stem_violation_back_into_regeneration(authed_client, monkeypatch):
    client, _ = authed_client
    gen, validate, _judge = _patch_pipeline(monkeypatch, [_STEM_FAIL, _PASS])

    response = client.post("/questions/generate", json=_PAYLOAD)
    assert response.status_code == 200

    # The corrective note names the specific stem violation.
    assert gen.call_count == 2
    note = gen.call_args_list[1].kwargs["extra_instruction"]
    assert "OPENING STEM" in note
    assert "forbidden lower-level verb 'explain'" in note

    # Both validations ran with the requested level + judge client wired in.
    assert validate.call_count == 2
    for call in validate.call_args_list:
        assert call.kwargs["requested_bloom"] == "analyze"
        assert call.kwargs["llm_client"] is _judge


def test_route_alignment_mismatch_returns_distinct_422(authed_client, monkeypatch):
    client, _ = authed_client
    _gen, _validate, _judge = _patch_pipeline(monkeypatch, [_COGNITIVE_FAIL, _COGNITIVE_FAIL])

    response = client.post("/questions/generate", json=_PAYLOAD)
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "BLOOM_ALIGNMENT_MISMATCH"
    assert "'understand'" in body["detail"]
    # One corrective regeneration, then the clean 422.
    assert questions_module.generate_question.call_count == 2


def test_route_alignment_judge_uses_evaluation_thinking(authed_client, monkeypatch):
    client, _ = authed_client
    _patch_pipeline(monkeypatch, [_PASS])
    response = client.post("/questions/generate", json=_PAYLOAD)
    assert response.status_code == 200
    configure = questions_module._configure_genai  # the MagicMock patch
    assert configure.call_args.kwargs["thinking_level"] == settings.llm_thinking_level


# ── 5. Schema backward compatibility + thin-context guard ───────────────────

_OLD_PAYLOAD = {
    "question": "What is 2PL?",
    "correct_answer": "Two-phase locking.",
    "explanation": "It has growing and shrinking phases.",
    "bloom_level": "understand",
    "difficulty": "medium",
}


def test_generated_question_backward_compat_without_context_warning():
    model = GeneratedQuestion(**_OLD_PAYLOAD)
    assert model.context_warning is None
    dumped = model.model_dump()
    assert dumped["context_warning"] is None
    # The pre-existing required shape is untouched.
    for key in ("question", "correct_answer", "explanation", "bloom_level", "difficulty"):
        assert key in dumped


def test_generated_question_context_warning_round_trip():
    model = GeneratedQuestion(**{**_OLD_PAYLOAD, "context_warning": "thin context"})
    assert GeneratedQuestion(**model.model_dump()).context_warning == "thin context"


def _thin_client() -> MagicMock:
    client = MagicMock()
    client.generate_content.return_value = _Resp(
        json.dumps(
            {
                "question": "Solve the given schedule.",
                "correct_answer": "Conflict-serializable.",
                "explanation": "Precedence graph is acyclic.",
                "bloom_level": "apply",
                "difficulty": "medium",
            }
        )
    )
    return client


def test_thin_context_warning_for_apply_plus(monkeypatch):
    generated = generate_question(
        topic="Transactions", subject="DBMS", bloom_level="apply", difficulty="medium",
        llm_client=_thin_client(),
        context_chunks=[{"text": "tiny", "source_doc": "x.pdf"}],
    )
    assert generated.context_warning is not None
    assert "thin" in generated.context_warning


def test_no_thin_context_warning_with_sufficient_context():
    generated = generate_question(
        topic="Transactions", subject="DBMS", bloom_level="apply", difficulty="medium",
        llm_client=_thin_client(),
        context_chunks=[{"text": "x" * (THIN_CONTEXT_MIN_CHARS + 50), "source_doc": "x.pdf"}],
    )
    assert generated.context_warning is None


def test_no_thin_context_warning_at_remember():
    client = _thin_client()
    generated = generate_question(
        topic="Transactions", subject="DBMS", bloom_level="remember", difficulty="easy",
        llm_client=client,
        context_chunks=[{"text": "tiny", "source_doc": "x.pdf"}],
    )
    assert generated.context_warning is None


# ── Structured per-level generation prompt ──────────────────────────────────

def _prompt_for(level: str) -> str:
    return _build_prompt(
        "Transactions", "DBMS", level, "medium", "open",
        [{"text": "2PL has growing and shrinking phases.", "source_doc": "t.pdf"}],
    )


def test_prompt_contains_structured_level_spec():
    prompt = _prompt_for("apply")
    assert "REQUIRED OPENING" in prompt
    assert "FORBIDDEN OPENING" in prompt
    assert "define" in prompt          # a forbidden apply-level stem is listed
    assert "CONCRETE SCENARIO RULE" in prompt
    assert "Good example" in prompt
    assert "Bad example" in prompt


def test_prompt_omits_concrete_rule_at_remember():
    prompt = _prompt_for("remember")
    assert "CONCRETE SCENARIO RULE" not in prompt
    assert "(none at this level)" in prompt


def test_prompt_lists_forbidden_verbs_for_create():
    prompt = _prompt_for("create")
    for verb in ("critique", "justify", "evaluate")[:2]:
        assert verb in prompt
    assert "CONCRETE SCENARIO RULE" in prompt

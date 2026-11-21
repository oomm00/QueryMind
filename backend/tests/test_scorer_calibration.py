"""Demo scorer calibration: references pass, junk fails (item 4)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import numpy as np

from app.models.models import Question
from app.services import validation_service
from app.services.evaluation_service import evaluate_answer_provisional

BANK = Path(__file__).resolve().parents[1] / "app" / "data" / "demo_question_bank.json"
JUNK = {"asdf": "asdf", "empty": "", "off-topic": "The sky is blue and cows produce milk on Mars."}


def test_provisional_scorer_separates_references_from_junk(monkeypatch):
    rows = json.loads(BANK.read_text(encoding="utf-8"))
    texts = list(dict.fromkeys([row["correct_answer"] for row in rows] + list(JUNK.values())))
    matrix = validation_service.embed_texts(texts)
    vectors = {text: matrix[i] for i, text in enumerate(texts)}
    monkeypatch.setattr(
        validation_service,
        "embed_texts",
        lambda batch: np.vstack([vectors[text] for text in batch]),
    )

    def question_for(row):
        return Question(
            id=uuid.uuid4(),
            topic=row["topic"],
            subject=row["subject"],
            bloom_level=row["bloom_level"],
            difficulty=row["difficulty"],
            question_type=row.get("question_type", "open"),
            question_text=row["question"],
            reference_answer=row["correct_answer"],
        )

    ref_scores = [
        evaluate_answer_provisional(question_for(row), row["correct_answer"])["overall_score"] / 100
        for row in rows
    ]
    junk_scores = [
        evaluate_answer_provisional(question_for(row), answer)["overall_score"] / 100
        for row in rows
        for answer in JUNK.values()
    ]

    assert sum(score >= 0.75 for score in ref_scores) / len(ref_scores) >= 0.95
    assert all(score < 0.40 for score in junk_scores)

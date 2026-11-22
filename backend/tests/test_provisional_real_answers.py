"""Real-answer separation test for the offline provisional evaluator.

Reference-vs-itself scoring is not evidence: this corpus contains three
paraphrased correct answers and three plausible-but-wrong answers for every one
of the 144 demo-bank questions.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.models.models import Question
from app.services.evaluation_service import evaluate_answer_provisional

CORPUS = Path(__file__).parent / "data" / "provisional_answer_sets.json"


def test_provisional_evaluator_separates_paraphrases_from_wrong_claims():
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    assert len(corpus) == 144

    paraphrase_scores: list[float] = []
    wrong_scores: list[float] = []

    for item in corpus:
        question = Question(
            question_text=item["question"],
            reference_answer=item["reference"],
            topic=item["topic"],
        )
        assert len(item["paraphrased_correct"]) == 3
        assert len(item["plausible_wrong"]) == 3
        for answer in item["paraphrased_correct"]:
            paraphrase_scores.append(
                float(evaluate_answer_provisional(question, answer)["overall_score"])
            )
        for answer in item["plausible_wrong"]:
            wrong_scores.append(
                float(evaluate_answer_provisional(question, answer)["overall_score"])
            )

    assert len(paraphrase_scores) == len(wrong_scores) == 432
    passed = sum(score >= 75.0 for score in paraphrase_scores)
    failed = sum(score < 40.0 for score in wrong_scores)
    assert passed / len(paraphrase_scores) >= 0.90
    assert failed / len(wrong_scores) >= 0.90

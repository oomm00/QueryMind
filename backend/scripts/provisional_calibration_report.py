"""Score the committed real-answer corpus with the actual provisional evaluator."""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models.models import Question  # noqa: E402
from app.services.evaluation_service import evaluate_answer_provisional  # noqa: E402

CORPUS = ROOT / "tests" / "data" / "provisional_answer_sets.json"
PASS_CORRECT = 75.0
FAIL_WRONG = 40.0


def describe(name: str, rows: list[dict], *, lower_is_worse: bool) -> None:
    scores = [row["score"] for row in rows]
    ordered = sorted(rows, key=lambda row: row["score"], reverse=not lower_is_worse)
    print(f"{name}: {len(scores)} answers")
    print(
        f"  min={min(scores):.2f} median={statistics.median(scores):.2f} "
        f"max={max(scores):.2f}"
    )
    print("  worst 10:")
    for row in ordered[:10]:
        answer = row["answer"].replace("\n", " ")
        if len(answer) > 92:
            answer = answer[:89] + "..."
        print(
            f"    {row['score']:6.2f} | {row['topic']}/{row['concept']} | {answer}"
        )


def main() -> None:
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    correct: list[dict] = []
    wrong: list[dict] = []

    for item in corpus:
        question = Question(
            question_text=item["question"],
            reference_answer=item["reference"],
            topic=item["topic"],
        )
        for answer in item["paraphrased_correct"]:
            score = float(evaluate_answer_provisional(question, answer)["overall_score"])
            correct.append(
                {
                    "score": score,
                    "answer": answer,
                    "topic": item["topic"],
                    "concept": item["concept"],
                    "question": item["question"],
                }
            )
        for answer in item["plausible_wrong"]:
            score = float(evaluate_answer_provisional(question, answer)["overall_score"])
            wrong.append(
                {
                    "score": score,
                    "answer": answer,
                    "topic": item["topic"],
                    "concept": item["concept"],
                    "question": item["question"],
                }
            )

    passed_correct = sum(row["score"] >= PASS_CORRECT for row in correct)
    failed_wrong = sum(row["score"] < FAIL_WRONG for row in wrong)

    print(f"bank questions: {len(corpus)}")
    print(
        f"paraphrases >= {PASS_CORRECT:.0f}: "
        f"{passed_correct}/{len(correct)} ({100 * passed_correct / len(correct):.1f}%)"
    )
    print(
        f"wrong answers < {FAIL_WRONG:.0f}: "
        f"{failed_wrong}/{len(wrong)} ({100 * failed_wrong / len(wrong):.1f}%)"
    )
    describe("paraphrased correct", correct, lower_is_worse=True)
    describe("plausible wrong", wrong, lower_is_worse=False)


if __name__ == "__main__":
    main()

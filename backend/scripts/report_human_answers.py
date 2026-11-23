"""Report provisional-scorer scores for tests/data/human_answers.json.

Run from D:/querymind/backend:
    venv\\Scripts\\python.exe scripts\\report_human_answers.py

Uses the same all-MiniLM embeddings as the live provisional evaluator.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models.models import Question
from app.services.evaluation_service import evaluate_answer_provisional

BANK = ROOT / "app" / "data" / "demo_question_bank.json"
ANSWERS = ROOT / "tests" / "data" / "human_answers.json"


def _band(fraction: float) -> str:
    score = fraction * 100.0
    if score >= 75:
        return "good"
    if score >= 40:
        return "half-right"
    return "wrong"


def main() -> int:
    rows = json.loads(BANK.read_text(encoding="utf-8"))
    payload = json.loads(ANSWERS.read_text(encoding="utf-8"))

    report = []
    for item in payload["answers"]:
        row = rows[item["bank_index"] - 1]
        question = Question(
            id=uuid.uuid4(),
            topic=row["topic"],
            subject=row["subject"],
            bloom_level=row["bloom_level"],
            difficulty=row["difficulty"],
            question_type=row.get("question_type", "open"),
            question_text=row["question"],
            reference_answer=row["correct_answer"],
        )
        result = evaluate_answer_provisional(question, item["answer"])
        score = result["overall_score"] / 100.0
        actual = _band(score)
        report.append({
            "q": item["bank_index"],
            "expected": item["expected_band"],
            "score": round(score, 4),
            "actual": actual,
            "ok": actual == item["expected_band"],
            "answer": item["answer"],
        })

    widths = [3, 11, 7, 11, 5]
    header = "| " + " | ".join(
        value.ljust(widths[index]) for index, value in enumerate(
            ["q", "expected", "score", "actual", "ok"]
        )
    ) + " |"
    print(header)
    print("|" + "|".join("-" * (width + 2) for width in widths) + "|")
    for entry in report:
        print("| " + " | ".join([
            str(entry["q"]).ljust(widths[0]),
            entry["expected"].ljust(widths[1]),
            f"{entry['score']:.4f}".ljust(widths[2]),
            entry["actual"].ljust(widths[3]),
            ("yes" if entry["ok"] else "NO").ljust(widths[4]),
        ]) + " |")

    mis = [entry for entry in report if not entry["ok"]]
    print(f"\nrows: {len(report)}")
    for band in ("good", "half-right", "wrong"):
        scores = [entry["score"] for entry in report if entry["expected"] == band]
        print(f"{band}: count={len(scores)} min={min(scores):.4f} max={max(scores):.4f}")
    print(f"misclassifications: {len(mis)}")
    for entry in mis:
        print(f"  q{entry['q']} expected {entry['expected']} got {entry['actual']} "
              f"score={entry['score']:.4f}: {entry['answer']}")
    return 0 if not mis else 1


if __name__ == "__main__":
    raise SystemExit(main())

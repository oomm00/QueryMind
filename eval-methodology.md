# QueryMind Evaluation Methodology: Rubric-Based LLM-as-a-Judge

Please refer to the full document at [docs/eval-methodology.md](docs/eval-methodology.md).

### Quick Summary
- **Rubric**: Conceptual Correctness (35%), Completeness (25%), Technical Depth (20%), Example/Application (10%), Clarity (10%).
- **Scoring**: Integers 0-10 per criterion, overall weighted score computed in Python (0-100).
- **Storage**: Flexible JSONB column `criteria_scores` on the `attempts` table.
- **Adaptive Engine**: Automatically calls `update_mastery_profile` on every submission.

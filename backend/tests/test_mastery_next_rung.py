"""Table-driven tests for the pure next-rung decision under Task 4 pacing."""

from __future__ import annotations

import math
import pytest

from app.services.mastery_service import (
    RUNG_LADDER,
    _clean_scores,
    clamp_rung,
    labels_from_rung,
    next_rung,
    rung_from_labels,
    MIN_QUESTIONS_BEFORE_PROMOTION,
    PROMOTION_AVG_THRESHOLD,
    PROMOTION_MIN_INDIVIDUAL_SCORE,
    MIN_QUESTIONS_BEFORE_DEMOTION,
    DEMOTION_AVG_THRESHOLD,
)

MAX_RUNG = len(RUNG_LADDER) - 1


def _assert_safe(current: int, new_rung: int, reason: str) -> None:
    assert 0 <= new_rung <= MAX_RUNG
    assert abs(new_rung - current) <= 1
    assert isinstance(reason, str) and reason


def test_four_good_answers_promotes_exactly_one_rung() -> None:
    """4 answers averaging >= 0.70 with none < 0.40 moves up one rung."""
    scores = [0.80, 0.85, 0.75, 0.80]
    target, reason = next_rung(2, scores)
    _assert_safe(2, target, reason)
    assert target == 3
    assert "moving up to Analyze/Medium" in reason
    assert "80%" in reason


def test_fewer_than_four_answers_stays_at_level() -> None:
    """Must answer at least 4 questions before moving up."""
    for count in range(1, 4):
        scores = [0.95] * count
        target, reason = next_rung(1, scores)
        assert target == 1
        assert f"{count}/4 questions answered" in reason


def test_four_answers_with_one_below_threshold_does_not_promote() -> None:
    """Even if average >= 0.70, if any individual score is < 0.40, stay."""
    scores = [1.0, 1.0, 0.9, 0.35]
    assert sum(scores) / 4.0 >= 0.70
    target, reason = next_rung(1, scores)
    assert target == 1
    assert "one score was 35% < 40%" in reason


def test_three_bad_answers_demotes_one_rung() -> None:
    """Last 3 answers averaging < 0.40 moves down one rung."""
    scores = [0.30, 0.35, 0.25]
    target, reason = next_rung(2, scores)
    _assert_safe(2, target, reason)
    assert target == 1
    assert "moving down to Understand/Easy" in reason


def test_bad_answers_never_demote_below_the_floor() -> None:
    """Never demote below level 1 (rung 0)."""
    scores = [0.1, 0.1, 0.1]
    target, reason = next_rung(0, scores)
    assert target == 0
    assert "already at the lowest level" in reason


def test_demotion_requires_fresh_four_answers_before_promotion() -> None:
    """After a demotion, the new level requires 4 fresh answers to promote."""
    # Start at rung 1 (Understand)
    # Demote with 3 bad answers
    demoted, reason = next_rung(1, [0.2, 0.2, 0.2])
    assert demoted == 0
    assert "moving down" in reason

    # At rung 0: fresh history starts at []
    # 1, 2, 3 good answers do not promote
    for count in range(1, 4):
        target, reason = next_rung(0, [0.9] * count)
        assert target == 0
        assert f"{count}/4" in reason

    # 4th good answer promotes
    target, reason = next_rung(0, [0.9, 0.9, 0.9, 0.9])
    assert target == 1
    assert "moving up" in reason


@pytest.mark.parametrize(
    "scores, expected_target, expected_phrase",
    [
        # Promotion boundary: avg exactly 0.70 with all >= 0.40 -> promote
        ([0.70, 0.70, 0.70, 0.70], 2, "moving up"),
        # Stay boundary: avg 0.699 (< 0.70) -> stay
        ([0.70, 0.70, 0.70, 0.69], 1, "staying"),
        # Demotion boundary: 3 answers avg < 0.40 -> demote
        ([0.39, 0.39, 0.39], 0, "moving down"),
        # Demotion boundary: 3 answers avg exactly 0.40 -> stay
        ([0.40, 0.40, 0.40], 1, "staying"),
    ],
)
def test_boundary_scores(scores, expected_target, expected_phrase) -> None:
    target, reason = next_rung(1, scores)
    assert target == expected_target
    assert expected_phrase in reason


def test_first_question_starts_at_lowest_rung() -> None:
    target, reason = next_rung(0, [])
    assert target == 0
    assert "No prior attempts" in reason


@pytest.mark.parametrize(
    "bad_score",
    [None, float("nan"), float("inf"), -0.5, 1.5, "not-a-number", object()],
)
def test_invalid_scores_are_ignored_not_crashes(bad_score) -> None:
    target, reason = next_rung(3, [bad_score])
    _assert_safe(3, target, reason)
    assert target == 3
    assert _clean_scores([bad_score]) == []


def test_mixed_valid_and_invalid_scores_uses_only_valid_ones() -> None:
    # 4 valid scores averaging 85% + some garbage values
    target, reason = next_rung(1, [None, 0.85, float("nan"), 0.90, -1, 0.80, 0.85])
    assert target == 2
    assert "moving up" in reason


@pytest.mark.parametrize("rung", [-99, -1, 0, 5, 6, 999, "x", None, 2.7])
def test_rung_is_always_clamped(rung) -> None:
    assert 0 <= clamp_rung(rung) <= MAX_RUNG
    bloom, difficulty = labels_from_rung(rung)
    assert (bloom, difficulty) in RUNG_LADDER


def test_unknown_labels_map_to_the_easiest_rung() -> None:
    assert rung_from_labels(None, None) == 0
    assert rung_from_labels("telepathy", "impossible") == 0
    assert rung_from_labels("APPLY", "MEDIUM") == 2
    assert rung_from_labels("apply", "nonsense") == 2
    assert rung_from_labels("nonsense", "hard") == 4

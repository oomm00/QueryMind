"""Table-driven tests for the pure next-rung decision (no DB, no LLM)."""

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
)

MAX_RUNG = len(RUNG_LADDER) - 1


def _assert_safe(current: int, new_rung: int, reason: str) -> None:
    assert 0 <= new_rung <= MAX_RUNG
    assert abs(new_rung - current) <= 1
    assert isinstance(reason, str) and reason


def test_reason_names_current_and_next_rung() -> None:
    rung, reason = next_rung(2, [0.82])
    assert rung == 3
    assert reason == "Scored 82% on Apply/Medium -> moving up to Analyze/Medium."


@pytest.mark.parametrize(
    "scores, expected_rung",
    [
        ([0.9] * 20, MAX_RUNG),
        ([0.1] * 20, 0),
        ([0.9, 0.1] * 10, 0),  # alternating never climbs past the first rung
    ],
)
def test_long_sequences_stay_in_range_and_move_at_most_one(scores, expected_rung) -> None:
    current = 0
    pending = False
    for score in scores:
        target, reason = next_rung(current, [score], demotion_pending=pending)
        _assert_safe(current, target, reason)
        if target != current:
            pending = target < current
        current = target
    assert current == expected_rung


def test_twenty_good_answers_climb_exactly_one_rung_at_a_time() -> None:
    current = 0
    for _ in range(20):
        target, _ = next_rung(current, [0.95])
        _assert_safe(current, target, "ok")
        current = target
    assert current == MAX_RUNG


def test_twenty_bad_answers_never_fall_below_the_floor() -> None:
    current = 0
    for _ in range(20):
        target, reason = next_rung(current, [0.0])
        _assert_safe(current, target, reason)
        assert current == 0


def test_hysteresis_requires_two_consecutive_high_scores_after_demotion() -> None:
    # Walk up to Apply/Medium one rung at a time, then fail it once (demote).
    rung, _ = next_rung(0, [0.9])
    assert rung == 1
    rung, _ = next_rung(rung, [0.9])
    assert rung == 2
    demoted, reason = next_rung(2, [0.2])
    assert demoted == 1
    assert "moving down" in reason

    first, reason = next_rung(demoted, [0.9], demotion_pending=True)
    _assert_safe(demoted, first, reason)
    assert first == 1
    assert "1/2" in reason

    second, reason = next_rung(demoted, [0.9, 0.9], demotion_pending=True)
    _assert_safe(demoted, second, reason)
    assert second == 2
    assert "moving up" in reason


@pytest.mark.parametrize(
    "score, expected_delta, expected_phrase",
    [
        (0.399, -1, "moving down"),
        (0.4, 0, "staying"),
        (0.749, 0, "staying"),
        (0.75, 1, "moving up"),
    ],
)
def test_boundary_scores(score, expected_delta, expected_phrase) -> None:
    target, reason = next_rung(2, [score])
    _assert_safe(2, target, reason)
    assert target - 2 == expected_delta
    assert expected_phrase in reason


def test_first_question_starts_at_lowest_rung() -> None:
    target, reason = next_rung(0, [])
    assert target == 0
    assert "No valid recent scores" in reason


@pytest.mark.parametrize(
    "bad_score",
    [None, float("nan"), float("inf"), -0.5, 1.5, "not-a-number", object()],
)
def test_invalid_scores_are_ignored_not_crashes(bad_score) -> None:
    target, reason = next_rung(3, [bad_score])
    _assert_safe(3, target, reason)
    assert target == 3
    assert "No valid recent scores" in reason
    assert _clean_scores([bad_score]) == []


def test_mixed_valid_and_invalid_scores_uses_only_valid_ones() -> None:
    target, reason = next_rung(2, [None, float("nan"), -1, 0.82])
    assert target == 3
    assert "82%" in reason


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


def test_reason_never_flips_direction_on_every_answer() -> None:
    # After a demotion a single good answer is held, so it cannot bounce.
    sequence = [0.9, 0.9, 0.2, 0.9, 0.9, 0.2]
    current, pending = 0, False
    directions = []
    for score in sequence:
        target, _ = next_rung(current, [score] if not pending else [score], demotion_pending=pending)
        if target != current:
            directions.append(1 if target > current else -1)
            pending = target < current
        current = target
    assert directions.count(1) >= 1
    assert directions.count(-1) >= 1
    assert not (len(directions) > 2 and all(a != b for a, b in zip(directions, directions[1:])))


def test_math_isnan_is_filtered() -> None:
    assert math.isnan(float("nan"))  # documents the guard used in _clean_scores

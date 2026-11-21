"""Shared score normalization for attempt and mastery writes.

Attempt scores are contractually 0..1. Out-of-range values are clamped; NaN and
infinity are rejected explicitly so they can never be persisted or silently
swallowed.
"""

from __future__ import annotations

import math
from typing import Any


def normalize_score(value: Any) -> float:
    """Return a finite score clamped into [0, 1]; raise ValueError for NaN/inf."""
    try:
        score = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("score must be a finite number") from exc
    if not math.isfinite(score):
        raise ValueError("score must be finite (NaN and infinity are invalid)")
    return max(0.0, min(1.0, score))

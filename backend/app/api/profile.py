"""
Profile Routes — /profile
=========================
Exposes a learner's aggregated knowledge profile (mastery breakdown, totals).

The profile is owner-only: the path ``user_id`` must match the authenticated
user, mirroring ``GET /attempts/history/{user_id}``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import ForbiddenError
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import ProfileResponse
from app.services.profile_service import build_profile

router = APIRouter()


@router.get(
    "/{user_id}",
    response_model=ProfileResponse,
    summary="Get a user's knowledge profile / mastery data",
)
def get_profile(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    """Return the caller's aggregated mastery profile.

    Aggregates ``mastery_records`` (per-topic / per-Bloom mastery scores) and
    ``attempts`` (counts and overall average) into the fixed ``ProfileResponse``
    shape. A learner may only read their own profile — a mismatched ``user_id``
    returns ``403``.
    """
    if user_id != current_user.id:
        raise ForbiddenError("You can only view your own profile")
    return build_profile(user_id=user_id, db=db)

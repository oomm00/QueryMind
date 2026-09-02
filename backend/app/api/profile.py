"""
Profile Routes — /profile
"""

import uuid

from fastapi import APIRouter

from app.schemas.schemas import ProfileResponse
from app.services.profile_service import get_profile_stub

router = APIRouter()


@router.get(
    "/{user_id}",
    response_model=ProfileResponse,
    summary="Get a user's knowledge profile / mastery data",
)
async def get_profile(user_id: uuid.UUID):
    """
    **Stub** — returns hardcoded mastery breakdown for any user_id.
    Real implementation will aggregate the user's Attempt history
    and compute per-topic Bloom-level mastery scores.
    """
    return get_profile_stub(user_id=user_id)

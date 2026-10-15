"""
Mastery Routes — /mastery
=========================
Exposes the authenticated learner's mastery profile (pipeline Stage 10/11).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import MasteryRecordOut
from app.services.mastery_service import get_mastery, record_to_dict

router = APIRouter()


@router.get(
    "/me",
    response_model=list[MasteryRecordOut],
    summary="Get the current user's mastery records",
)
def get_my_mastery(
    subject: str | None = Query(default=None, description="Filter by subject"),
    topic: str | None = Query(default=None, description="Filter by topic"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MasteryRecordOut]:
    """Return the caller's mastery records (optionally filtered).

    Only the authenticated user's own records are returned — the ``user_id``
    always comes from the JWT, never from the request.
    """
    records = get_mastery(
        user_id=current_user.id, subject=subject, topic=topic, db=db
    )
    return [MasteryRecordOut(**record_to_dict(record)) for record in records]

"""
API Dependencies — QueryMind
==============================
Common FastAPI dependencies, including database session management
and JWT authentication guards for protecting routes.
"""

from __future__ import annotations

import uuid

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AuthenticationError
from app.db.session import get_db
from app.models.models import User
from app.services.auth_service import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Decodes JWT access token and loads current active user from the database.

    Raises AuthenticationError if the token is invalid, expired, or user not found.
    """
    payload = decode_token(token, expected_type="access")
    user_id_str = payload.get("sub")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise AuthenticationError("Invalid user ID in token")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise AuthenticationError("User not found")
    if not user.is_active:
        raise AuthenticationError("User account is inactive")

    return user

"""
Auth Routes — /auth
===================
Endpoints for user registration, authentication, token refresh, and session info.
Protected with rate limiting and backed by real database models and JWT tokens.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import AuthenticationError
from app.core.rate_limit import create_rate_limiter
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
)
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
    register_user,
)

router = APIRouter()

# Rate limiters: 5 registration requests/minute, 10 login requests/minute
rate_limit_register = create_rate_limiter(requests_limit=5, window_seconds=60)
rate_limit_login = create_rate_limiter(requests_limit=10, window_seconds=60)


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_register)],
    summary="Register a new user",
)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Register a new user with hashed credentials and issue JWT tokens."""
    user = register_user(db=db, data=payload)
    access_token = create_access_token(user_id=user.id)
    refresh_token = create_refresh_token(user_id=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit_login)],
    summary="Login and receive JWT tokens",
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate user credentials and issue access + refresh tokens."""
    user = authenticate_user(db=db, email=payload.email, password=payload.password)
    access_token = create_access_token(user_id=user.id)
    refresh_token = create_refresh_token(user_id=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token using a refresh token",
)
def refresh_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Validate refresh token and issue a newly signed access token."""
    token_payload = decode_token(payload.refresh_token, expected_type="refresh")
    user_id_str = token_payload.get("sub")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise AuthenticationError("Invalid user ID in refresh token")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise AuthenticationError("User not found")
    if not user.is_active:
        raise AuthenticationError("User account is inactive")

    new_access_token = create_access_token(user_id=user.id)
    new_refresh_token = create_refresh_token(user_id=user.id)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
    )


@router.get(
    "/me",
    summary="Get current authenticated user profile",
)
def get_me(current_user: User = Depends(get_current_user)) -> dict:
    """Return profile details for the currently authenticated user."""
    return {
        "user_id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "is_active": current_user.is_active,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }

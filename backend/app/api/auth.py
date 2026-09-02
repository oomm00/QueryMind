"""
Auth Routes — /auth
"""

from fastapi import APIRouter

from app.schemas.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.services.auth_service import login_user_stub, register_user_stub

router = APIRouter()


@router.post("/register", status_code=201, summary="Register a new user")
async def register(payload: RegisterRequest):
    """
    **Stub** — accepts registration data and returns a placeholder response.
    Real implementation: validate uniqueness, hash password, insert User row,
    send verification email.
    """
    return register_user_stub(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
    )


@router.post("/login", response_model=TokenResponse, summary="Login and receive a token")
async def login(payload: LoginRequest):
    """
    **Stub** — accepts credentials and returns a fake JWT token.
    Real implementation: verify password hash, issue signed JWT, store refresh token.
    """
    return login_user_stub(email=payload.email, password=payload.password)

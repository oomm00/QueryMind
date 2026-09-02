"""
Auth Service — STUB
====================
Real implementation will: hash passwords with bcrypt, issue JWT tokens,
validate credentials against the DB. For now, returns hardcoded placeholders.
"""

import uuid

from app.schemas.schemas import TokenResponse


STUB_TOKEN = "stub.jwt.token.not.real"


def register_user_stub(email: str, password: str, full_name: str | None) -> dict:
    """Stub: pretend the user was created."""
    return {
        "message": "User registered successfully (stub — not persisted)",
        "user_id": str(uuid.uuid4()),
        "email": email,
    }


def login_user_stub(email: str, password: str) -> TokenResponse:
    """Stub: return a fake JWT token."""
    return TokenResponse(
        access_token=STUB_TOKEN,
        token_type="bearer",
        user_id=uuid.uuid4(),
        email=email,
    )

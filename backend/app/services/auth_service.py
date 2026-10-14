"""
Auth Service — QueryMind
==========================
Business logic for user registration, credential authentication,
and JWT token generation / verification using bcrypt and python-jose.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

import bcrypt
# Passlib 1.7.4 compatibility fix: bcrypt 4.x removed __about__, which passlib's version check depends on
if not hasattr(bcrypt, "__about__"):
    class _About:
        __version__ = bcrypt.__version__
    bcrypt.__about__ = _About()


# Patch hashpw to truncate to 72 bytes so passlib's wrap-bug detector doesn't raise ValueError
_orig_hashpw = bcrypt.hashpw
def _safe_hashpw(password, salt):
    return _orig_hashpw(password[:72], salt)
bcrypt.hashpw = _safe_hashpw

from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ConflictError
from app.models.models import User
from app.schemas.schemas import RegisterRequest

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7


# ── Password Hashing ──────────────────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    """Hashes a plaintext password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT Token Generation & Verification ───────────────────────────────────────

def create_access_token(
    user_id: str | uuid.UUID,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Creates a signed JWT access token for user authentication."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = {
        "sub": str(user_id),
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(
    user_id: str | uuid.UUID,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Creates a signed JWT refresh token for renewing access tokens."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> dict:
    """Decodes and validates a JWT token.

    Raises AuthenticationError if invalid, expired, or of unexpected type.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        token_type = payload.get("type")
        if expected_type and token_type != expected_type:
            raise AuthenticationError(f"Invalid token type: expected '{expected_type}'")
        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationError("Token missing user subject")
        return payload
    except JWTError as e:
        raise AuthenticationError(f"Invalid or expired token: {str(e)}")


# ── User Registration & Authentication ───────────────────────────────────────

def register_user(db: Session, data: RegisterRequest) -> User:
    """Registers a new user in the database.

    Raises ConflictError if the email is already registered.
    """
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise ConflictError(f"User with email '{data.email}' already exists")

    hashed_pw = get_password_hash(data.password)
    user = User(
        email=data.email,
        hashed_password=hashed_pw,
        full_name=data.full_name,
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    """Authenticates a user by email and password.

    Raises AuthenticationError on invalid credentials or inactive status.
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise AuthenticationError("Invalid email or password")
    if not verify_password(password, user.hashed_password):
        raise AuthenticationError("Invalid email or password")
    if not user.is_active:
        raise AuthenticationError("User account is inactive")
    return user

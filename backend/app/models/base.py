"""
Declarative base shared by all ORM models.
Import Base here so Alembic env.py can import a single symbol.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass

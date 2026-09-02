# app/models/__init__.py
# Re-export models so Alembic can discover them via `from app.models import base`
from app.models.base import Base  # noqa: F401
from app.models.models import (  # noqa: F401
    Attempt,
    Document,
    KnowledgeProfile,
    Question,
    User,
)

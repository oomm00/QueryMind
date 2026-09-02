"""
SQLAlchemy engine & session factory.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # detect stale connections
    echo=settings.debug,  # log SQL in development
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db():
    """FastAPI dependency — yields a DB session and closes it on teardown."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

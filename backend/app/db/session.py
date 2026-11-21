"""
SQLAlchemy engine & session factory.

Production settings are explicit: bounded connect/statement timeouts,
pre-ping (so a dead pooled connection fails fast instead of hanging), and a
SQL_ECHO flag rather than tying SQL logging to DEBUG. Connections use a cached
IP so a stopped Docker service does not cost 8s of DNS timeouts.
"""

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db import address

is_sqlite = settings.database_url.startswith("sqlite")

connect_args: dict = {}
if is_sqlite:
    connect_args["check_same_thread"] = False
else:
    import psycopg2

    url = make_url(settings.database_url)

    def _connect():
        """psycopg2 creator with a cached host IP and tight timeouts."""
        host = address.current_ip() or url.host
        try:
            return psycopg2.connect(
                host=host,
                port=url.port or 5432,
                dbname=url.database,
                user=url.username,
                password=url.password,
                connect_timeout=int(settings.db_connect_timeout_seconds),
                options=f"-c statement_timeout={settings.db_statement_timeout_seconds * 1000}",
            )
        except Exception:
            address.note_failure()
            raise

    connect_args = {}

engine_kwargs: dict = {
    "connect_args": connect_args,
    "pool_pre_ping": True,
    "pool_recycle": settings.db_pool_recycle_seconds,
    "echo": settings.sql_echo,
}
if is_sqlite:
    engine = create_engine(settings.database_url, **engine_kwargs)
else:
    engine = create_engine("postgresql+psycopg2://", creator=_connect, **engine_kwargs)

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

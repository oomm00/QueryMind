"""
ORM Models — QueryMind
======================
All SQLAlchemy table definitions live here (or in sibling files).
Business logic is NOT implemented yet — these are structural stubs.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


# ── User ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    attempts: Mapped[list["Attempt"]] = relationship("Attempt", back_populates="user")
    knowledge_profile: Mapped["KnowledgeProfile | None"] = relationship(
        "KnowledgeProfile", back_populates="user", uselist=False
    )


# ── Document ──────────────────────────────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str | None] = mapped_column(String(1024))
    chroma_collection: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(50), default="pending"
    )  # pending | processing | ready | failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Question ──────────────────────────────────────────────────────────────────

class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id"))
    topic: Mapped[str] = mapped_column(String(512), nullable=False)
    bloom_level: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # remember | understand | apply | analyze | evaluate | create
    difficulty: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # easy | medium | hard
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    reference_answer: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attempts: Mapped[list["Attempt"]] = relationship("Attempt", back_populates="question")


# ── Attempt ───────────────────────────────────────────────────────────────────

class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), nullable=False)
    user_answer: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float | None] = mapped_column(Float)          # 0.0 – 1.0
    feedback: Mapped[str | None] = mapped_column(Text)
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="attempts")
    question: Mapped["Question"] = relationship("Question", back_populates="attempts")


# ── KnowledgeProfile ─────────────────────────────────────────────────────────

class KnowledgeProfile(Base):
    __tablename__ = "knowledge_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False
    )
    # JSON-serialised mastery map stored as text for now
    # e.g. {"python:remember": 0.8, "python:apply": 0.4}
    mastery_data: Mapped[str | None] = mapped_column(Text)
    total_attempts: Mapped[int] = mapped_column(Integer, default=0)
    average_score: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="knowledge_profile")

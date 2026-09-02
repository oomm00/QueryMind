"""
Pydantic schemas for request/response validation.
Each domain area has its own section.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, EmailStr, Field


# ══════════════════════════════════════════════════════════════
# Auth
# ══════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    email: str


# ══════════════════════════════════════════════════════════════
# Questions
# ══════════════════════════════════════════════════════════════

class GenerateQuestionRequest(BaseModel):
    topic: str = Field(..., examples=["Python decorators"])
    bloom_level: str = Field(
        ...,
        examples=["understand"],
        description="One of: remember | understand | apply | analyze | evaluate | create",
    )
    difficulty: str = Field(..., examples=["medium"], description="easy | medium | hard")
    document_id: Optional[uuid.UUID] = None
    num_questions: int = Field(default=1, ge=1, le=10)


class QuestionOut(BaseModel):
    id: uuid.UUID
    topic: str
    bloom_level: str
    difficulty: str
    question_text: str
    reference_answer: Optional[str] = None


class GenerateQuestionResponse(BaseModel):
    questions: list[QuestionOut]
    stub: bool = True  # Remove when real generation is implemented


# ══════════════════════════════════════════════════════════════
# Attempts
# ══════════════════════════════════════════════════════════════

class SubmitAttemptRequest(BaseModel):
    question_id: uuid.UUID
    user_id: uuid.UUID
    user_answer: str
    time_taken_seconds: Optional[int] = None


class AttemptFeedback(BaseModel):
    attempt_id: uuid.UUID
    score: float = Field(ge=0.0, le=1.0)
    feedback: str
    correct_answer: str
    stub: bool = True  # Remove when real evaluation is implemented


# ══════════════════════════════════════════════════════════════
# Knowledge Profile
# ══════════════════════════════════════════════════════════════

class TopicMastery(BaseModel):
    topic: str
    bloom_level: str
    mastery_score: float = Field(ge=0.0, le=1.0)
    attempts: int


class ProfileResponse(BaseModel):
    user_id: uuid.UUID
    total_attempts: int
    average_score: float
    mastery_breakdown: list[TopicMastery]
    stub: bool = True  # Remove when real profile logic is implemented

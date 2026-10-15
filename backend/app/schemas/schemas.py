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
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user_id: uuid.UUID
    email: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str



# ══════════════════════════════════════════════════════════════
# Questions
# ══════════════════════════════════════════════════════════════

class GenerateQuestionRequest(BaseModel):
    topic: str = Field(..., examples=["Transactions"])
    subject: str = Field(..., examples=["DBMS"])
    bloom_level: str = Field(
        ...,
        examples=["analyze"],
        description="One of: remember | understand | apply | analyze | evaluate | create",
    )
    difficulty: str = Field(..., examples=["medium"], description="easy | medium | hard")
    question_type: str = Field(default="open", description="mcq | open")
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


class GeneratedQuestion(BaseModel):
    """Structured output from the LLM question generator."""
    question: str
    options: Optional[list[str]] = None        # 4 items for MCQ, None for open-ended
    correct_answer: str
    explanation: str
    bloom_level: str
    difficulty: str
    source_chunks: list[str]                   # source_doc values used



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
# Answer Evaluation (POST /questions/{id}/submit-answer)
# ══════════════════════════════════════════════════════════════

MAX_ANSWER_LENGTH = 5000  # characters — generous for a paragraph-style answer


class SubmitAnswerRequest(BaseModel):
    # Length bounds only; blank/whitespace answers are rejected by the service
    # (raising a QueryMindError -> 422) so this model stays serializable when the
    # framework renders validation errors.
    answer: str = Field(
        ..., min_length=1, max_length=MAX_ANSWER_LENGTH,
        examples=["2PL holds exclusive locks until commit, preventing dirty reads."],
    )


class ScoreBreakdown(BaseModel):
    """Per-criterion rubric sub-scores, each 0-10."""
    correctness: int = Field(ge=0, le=10)
    completeness: int = Field(ge=0, le=10)
    depth_of_reasoning: int = Field(ge=0, le=10)
    clarity: int = Field(ge=0, le=10)


class AnswerEvaluationResponse(BaseModel):
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    scores: ScoreBreakdown
    overall_score: float = Field(ge=0.0, le=100.0, description="Weighted 0-100 (computed in code)")
    feedback: str
    missing_points: list[str] = []
    strengths: list[str] = []
    reference_answer: Optional[str] = None


# ══════════════════════════════════════════════════════════════
# Documents (POST /documents/upload)
# ══════════════════════════════════════════════════════════════

class DocumentUploadResponse(BaseModel):
    document: str
    chunks_ingested: int = Field(ge=0)
    subject: str
    topic: str
    source_type: str
    document_id: Optional[uuid.UUID] = None


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

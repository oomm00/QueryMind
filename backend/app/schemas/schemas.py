"""
Pydantic schemas for request/response validation.
Each domain area has its own section.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator
from pydantic_core import PydanticCustomError


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
# Documents
# ══════════════════════════════════════════════════════════════

class DocumentUploadResponse(BaseModel):
    document: Optional[str] = None
    filename: Optional[str] = None
    chunks_ingested: Optional[int] = Field(default=None, ge=0)
    chunks_count: Optional[int] = Field(default=None, ge=0)
    subject: str
    topic: str
    source_type: str
    course: Optional[str] = None
    status: str = "ready"
    document_id: Optional[uuid.UUID] = None

    def model_post_init(self, __context: Any) -> None:
        if self.filename is None and self.document is not None:
            self.filename = self.document
        elif self.document is None and self.filename is not None:
            self.document = self.filename
        if self.chunks_count is None and self.chunks_ingested is not None:
            self.chunks_count = self.chunks_ingested
        elif self.chunks_ingested is None and self.chunks_count is not None:
            self.chunks_ingested = self.chunks_count


class DocumentOut(BaseModel):
    """One uploaded document as GET /documents returns it (newest first)."""

    document_id: uuid.UUID
    filename: str
    subject: str
    topic: str
    source_type: str
    course: Optional[str] = None
    status: str = "ready"
    chunk_count: Optional[int] = Field(default=None, ge=0)
    created_at: datetime


class SubjectTopicsOut(BaseModel):
    """One subject and the distinct topics filed under it (A-Z in both)."""

    subject: str
    topics: list[str]



# ══════════════════════════════════════════════════════════════
# Questions
# ══════════════════════════════════════════════════════════════

class GenerateQuestionRequest(BaseModel):
    topic: Optional[str] = Field(default=None, examples=["Transactions"])
    subject: Optional[str] = Field(default=None, examples=["DBMS"])
    bloom_level: Optional[str] = Field(
        default=None,
        examples=["analyze"],
        description=(
            "One of: remember | understand | apply | analyze | evaluate | create. "
            "Required unless adaptive=true, in which case it is ignored."
        ),
    )
    difficulty: Optional[str] = Field(
        default=None,
        examples=["medium"],
        description="easy | medium | hard. Required unless adaptive=true (then ignored).",
    )
    question_type: str = Field(default="open", description="mcq | open")
    document_id: Optional[uuid.UUID] = None
    num_questions: int = Field(default=1, ge=1, le=10)
    uploaded_only: bool = Field(
        default=False,
        description="When true and no topic is supplied, generate from all uploaded notes.",
    )
    adaptive: bool = Field(
        default=False,
        description=(
            "When true, the learner's mastery profile picks the Bloom level and "
            "difficulty (any supplied values are ignored)."
        ),
    )

    @model_validator(mode="after")
    def _require_bloom_and_difficulty_unless_adaptive(self) -> "GenerateQuestionRequest":
        """Non-adaptive requests must still supply both (behaviour unchanged)."""
        if not self.adaptive:
            if not self.bloom_level:
                raise PydanticCustomError(
                    "missing_bloom_level",
                    "bloom_level is required when adaptive is false",
                )
            if not self.difficulty:
                raise PydanticCustomError(
                    "missing_difficulty",
                    "difficulty is required when adaptive is false",
                )
        return self


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
    question_text: Optional[str] = None
    # Persisted question id. The generator does not produce this; the route fills
    # it in after storing the validated question so the client has a stable id to
    # submit the answer against (frontend contract field: `question_id`).
    question_id: Optional[uuid.UUID] = None
    options: Optional[list[str]] = None        # 4 items for MCQ, None for open-ended
    starter_code: Optional[str] = None        # Starter code template for coding questions
    test_cases: Optional[list[dict]] = None    # Example test cases for coding questions
    correct_answer: str
    explanation: str
    bloom_level: str
    difficulty: str
    topic: Optional[str] = None
    source_chunks: list[str] = []              # source_doc values used
    source_chunk_ids: list[str] = []
    # Adaptive-selection metadata — only meaningful when the request asked for
    # adaptive=true; defaults keep the non-adaptive response shape intact.
    adaptive: bool = False
    adaptive_reason: Optional[str] = None      # why this level was chosen
    # Thin-context guard (Apply+ only): set when the retrieved material is too
    # thin to reliably ground a concrete-scenario question — the caller should
    # surface it instead of trusting a generic question. None everywhere else,
    # so old payloads and response contracts are unchanged.
    context_warning: Optional[str] = None

    def model_post_init(self, __context: Any) -> None:
        if not self.question_text and self.question:
            self.question_text = self.question
        elif not self.question and self.question_text:
            self.question = self.question_text
        if not self.source_chunk_ids and self.source_chunks:
            self.source_chunk_ids = list(self.source_chunks)
        elif not self.source_chunks and self.source_chunk_ids:
            self.source_chunks = list(self.source_chunk_ids)



# ══════════════════════════════════════════════════════════════
# Attempts
# ══════════════════════════════════════════════════════════════

class SubmitAttemptRequest(BaseModel):
    question_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    user_answer: Optional[str] = None
    answer_text: Optional[str] = None
    time_taken_seconds: Optional[int] = None


class AttemptFeedback(BaseModel):
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    score: float = Field(ge=0.0, le=1.0)
    overall_score: float = Field(ge=0.0, le=100.0)
    # Per-criterion sub-scores normalized to 0-1 (the frontend contract renders
    # them as percentages via ``value * 100``). The judge scores each criterion
    # 0-10; the route divides by 10 for the response.
    criteria_scores: dict[str, float]
    feedback: str
    missing_points: list[str] = []
    strengths: list[str] = []
    correct_answer: Optional[str] = None
    stub: bool = False


class AttemptHistoryItem(BaseModel):
    """One row of a learner's attempt history (GET /attempts/history/{user_id})."""
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    topic: str
    bloom_level: Optional[str] = None
    difficulty: Optional[str] = None
    score: Optional[float] = None
    submitted_at: Optional[datetime] = None


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
    conceptual_correctness: Optional[int] = Field(default=None, ge=0, le=10)
    correctness: Optional[int] = Field(default=None, ge=0, le=10)
    completeness: int = Field(ge=0, le=10)
    technical_depth: Optional[int] = Field(default=None, ge=0, le=10)
    depth_of_reasoning: Optional[int] = Field(default=None, ge=0, le=10)
    example_application: Optional[int] = Field(default=None, ge=0, le=10)
    clarity: int = Field(ge=0, le=10)

    def model_post_init(self, __context: Any) -> None:
        if self.correctness is None and self.conceptual_correctness is not None:
            self.correctness = self.conceptual_correctness
        elif self.conceptual_correctness is None and self.correctness is not None:
            self.conceptual_correctness = self.correctness
        if self.depth_of_reasoning is None and self.technical_depth is not None:
            self.depth_of_reasoning = self.technical_depth
        elif self.technical_depth is None and self.depth_of_reasoning is not None:
            self.technical_depth = self.depth_of_reasoning
        if self.example_application is None:
            self.example_application = self.technical_depth or self.clarity


class AnswerEvaluationResponse(BaseModel):
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    scores: ScoreBreakdown
    overall_score: float = Field(ge=0.0, le=100.0, description="Weighted 0-100 (computed in code)")
    feedback: str
    missing_points: list[str] = []
    strengths: list[str] = []
    reference_answer: Optional[str] = None


# NOTE: `DocumentUploadResponse` is defined once, above (section "Documents").
# A duplicate definition used to shadow it here; the two were merged on rebase.


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
    stub: bool = False  # Real profile logic is implemented


# ══════════════════════════════════════════════════════════════
# Mastery (GET /mastery/me)
# ══════════════════════════════════════════════════════════════

class MasteryRecordOut(BaseModel):
    """One mastery record for a (user, subject, topic) triple."""
    subject: str
    topic: str
    mastery_score: float = Field(ge=0.0, le=1.0)
    attempts_count: int
    bloom_breakdown: Dict[str, float] = {}      # {"remember": 0.8, "apply": 0.4}
    last_updated: Optional[datetime] = None

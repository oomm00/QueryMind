from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models.models import Attempt, LearningTopic, MasteryRecord, Question, User
from app.services.generation_fallback import canonical_subject_for_topic, canonical_topic_key
from app.services.mastery_service import RUNG_LADDER, _format_rung

logger = logging.getLogger("querymind.learning")
router = APIRouter(prefix="/learning", tags=["Learning"])

_RESOURCES_PATH = Path(__file__).resolve().parents[1] / "data" / "resources.json"
_RESOURCES_CACHE: Optional[dict[str, Any]] = None


def _load_resources() -> dict[str, Any]:
    global _RESOURCES_CACHE
    if _RESOURCES_CACHE is None:
        if _RESOURCES_PATH.exists():
            try:
                _RESOURCES_CACHE = json.loads(_RESOURCES_PATH.read_text(encoding="utf-8"))
            except Exception as e:
                logger.error("Failed to load resources.json: %s", e)
                _RESOURCES_CACHE = {"topics": {}, "search_templates": []}
        else:
            _RESOURCES_CACHE = {"topics": {}, "search_templates": []}
    return _RESOURCES_CACHE


def _default_outline_for_topic(topic: str, subject: str) -> dict[str, Any]:
    res_data = _load_resources()
    topics = res_data.get("topics", {})
    if topic in topics:
        return topics[topic]
    
    # Synthesize clean 5-part outline for any non-demo topic
    slug = topic.lower().replace(" ", "-")[:12]
    return {
        "topic": topic,
        "subject": subject,
        "overview": f"Comprehensive study path for {topic} in {subject}.",
        "resources": [
            {
                "title": f"Wikipedia: {topic}",
                "url": f"https://en.wikipedia.org/wiki/Special:Search?search={topic.replace(' ', '+')}",
                "type": "documentation",
                "description": f"Wikipedia references and articles for {topic}."
            },
            {
                "title": f"GeeksforGeeks: {topic}",
                "url": f"https://www.google.com/search?q=site%3Ageeksforgeeks.org+{topic.replace(' ', '+')}",
                "type": "tutorial",
                "description": f"Tutorials and code examples for {topic}."
            }
        ],
        "subparts": [
            {
                "id": f"{slug}-01",
                "title": f"Core Principles of {topic}",
                "summary": f"Foundational concepts, primary terminology, and motivation for {topic}.",
                "learning_goals": [f"Define the key terms in {topic}", "Explain core mechanics"]
            },
            {
                "id": f"{slug}-02",
                "title": "Architectural Design & Structure",
                "summary": f"Underlying data structures, state models, and algorithmic workflows in {topic}.",
                "learning_goals": ["Trace operational workflows", "Understand state transitions"]
            },
            {
                "id": f"{slug}-03",
                "title": "Application & Standard Patterns",
                "summary": f"Practical implementations, standard conventions, and problem patterns for {topic}.",
                "learning_goals": ["Apply patterns to practical problems", "Identify common failure points"]
            },
            {
                "id": f"{slug}-04",
                "title": "Trade-offs, Edge Cases & Failure Modes",
                "summary": f"Performance constraints, boundary conditions, and concurrency considerations in {topic}.",
                "learning_goals": ["Evaluate system trade-offs", "Mitigate performance bottlenecks"]
            },
            {
                "id": f"{slug}-05",
                "title": "Evaluation & Advanced Optimization",
                "summary": f"Systemic analysis, benchmarking, and real-world optimizations for {topic}.",
                "learning_goals": ["Optimize algorithms and architectures", "Synthesize end-to-end solutions"]
            }
        ]
    }


class TopicCreatePayload(BaseModel):
    topic: str
    subject: Optional[str] = None


def _calculate_topic_progress(
    user_id: uuid.UUID,
    topic: str,
    db: Session,
    subparts_count: int = 5,
) -> dict[str, Any]:
    # Attempts
    total_attempts = (
        db.query(Attempt)
        .join(Question, Attempt.question_id == Question.id)
        .filter(Attempt.user_id == user_id, Question.topic == topic)
        .count()
    )

    # Mastery
    record = (
        db.query(MasteryRecord)
        .filter(MasteryRecord.user_id == user_id, MasteryRecord.topic == topic)
        .first()
    )

    mastery_score = record.mastery_score if record else 0.0
    mastery_pct = int(round(mastery_score * 100))

    # Map mastery to current rung
    rung_idx = min(len(RUNG_LADDER) - 1, max(0, int(mastery_score * len(RUNG_LADDER))))
    current_rung = _format_rung(rung_idx)

    # Subpart progress: fraction of subparts completed based on mastery
    completed_subparts = min(subparts_count, int(round((mastery_score) * subparts_count)))

    return {
        "mastery_score": mastery_score,
        "mastery_pct": mastery_pct,
        "total_attempts": total_attempts,
        "current_rung": current_rung,
        "rung_index": rung_idx,
        "completed_subparts": completed_subparts,
    }


@router.post("/topics", status_code=status.HTTP_201_CREATED)
def start_or_get_learning_topic(
    payload: TopicCreatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    raw_topic = (payload.topic or "").strip()
    if not raw_topic:
        raise HTTPException(status_code=400, detail="Topic name is required.")

    canonical_topic = canonical_topic_key(raw_topic)
    canonical_subject = (
        payload.subject
        or canonical_subject_for_topic(canonical_topic, db)
        or "Computer Science"
    )

    item = (
        db.query(LearningTopic)
        .filter(
            LearningTopic.user_id == current_user.id,
            LearningTopic.topic == canonical_topic,
        )
        .first()
    )

    if not item:
        outline_data = _default_outline_for_topic(canonical_topic, canonical_subject)
        item = LearningTopic(
            user_id=current_user.id,
            topic=canonical_topic,
            subject=canonical_subject,
            overview=outline_data.get("overview", f"Overview of {canonical_topic}."),
            outline_json=json.dumps(outline_data),
        )
        db.add(item)
        db.commit()
        db.refresh(item)

    outline = json.loads(item.outline_json) if item.outline_json else {}
    subparts = outline.get("subparts", [])
    metrics = _calculate_topic_progress(current_user.id, canonical_topic, db, len(subparts))

    return {
        "id": str(item.id),
        "topic": item.topic,
        "subject": item.subject,
        "overview": item.overview,
        "resources": outline.get("resources", []),
        "subparts": subparts,
        "progress": metrics,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.get("/topics")
def list_learning_topics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    items = (
        db.query(LearningTopic)
        .filter(LearningTopic.user_id == current_user.id)
        .order_by(LearningTopic.updated_at.desc())
        .all()
    )

    result = []
    for item in items:
        outline = json.loads(item.outline_json) if item.outline_json else {}
        subparts = outline.get("subparts", [])
        metrics = _calculate_topic_progress(current_user.id, item.topic, db, len(subparts))

        result.append({
            "id": str(item.id),
            "topic": item.topic,
            "title": item.topic,
            "subject": item.subject,
            "overview": item.overview,
            "subparts_count": len(subparts),
            "progress": metrics,
            "progress_pct": metrics.get("mastery_pct", 0),
            "current_rung": metrics.get("current_rung", "Remember / Easy"),
            "questions_attempted": metrics.get("total_attempts", 0),
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        })
    return result


@router.get("/topics/{topic_id}")
def get_learning_topic(
    topic_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    item = (
        db.query(LearningTopic)
        .filter(LearningTopic.id == topic_id, LearningTopic.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Learning topic not found.")

    outline = json.loads(item.outline_json) if item.outline_json else {}
    subparts = outline.get("subparts", [])
    metrics = _calculate_topic_progress(current_user.id, item.topic, db, len(subparts))

    # Mark subparts statuses
    completed_idx = metrics["completed_subparts"]
    annotated_subparts = []
    for i, sp in enumerate(subparts):
        sp_copy = dict(sp)
        if i < completed_idx:
            sp_copy["status"] = "completed"
        elif i == completed_idx:
            sp_copy["status"] = "current"
        else:
            sp_copy["status"] = "upcoming"
        annotated_subparts.append(sp_copy)

    # Search templates
    res_data = _load_resources()
    search_templates = res_data.get("search_templates", [])

    return {
        "id": str(item.id),
        "topic": item.topic,
        "subject": item.subject,
        "overview": item.overview,
        "resources": outline.get("resources", []),
        "search_templates": search_templates,
        "subparts": annotated_subparts,
        "progress": metrics,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }

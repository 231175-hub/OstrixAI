"""Domain models for full academic diary, learning memory, and linguistic corrections."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

ConceptStatus = Literal["PENDING", "EXPLAINED", "TESTED", "MASTERED", "REINFORCING"]
ExplanationSource = Literal["ON_DEVICE", "IN_CLOUD", "CURRICULUM_OFFLINE"]
CollectionType = Literal["DOUBT", "EUREKA"]
CorrectionStatus = Literal["PROPOSED", "VALIDATED", "REJECTED"]


@dataclass(frozen=True, slots=True)
class SessionConcept:
    id: str
    session_id: str
    user_uid: str
    collection_type: CollectionType
    concept_text: str
    order_index: int
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AcademicSession:
    id: str
    user_uid: str
    session_date: date
    grade: int
    course_id: str
    course_name: str
    topic: str
    notes_text: str
    summary_text: str | None
    summary_quechua: str | None
    review_questions: str | None
    review_quechua: str | None
    version: int
    sync_status: str
    created_at: datetime
    updated_at: datetime
    concepts: list[SessionConcept]
    session_details: str


@dataclass(frozen=True, slots=True)
class LearningMemoryItem:
    id: str
    user_uid: str
    session_id: str
    course_name: str
    topic: str
    concept_text: str
    status: ConceptStatus
    explanation_text: str | None
    explanation_source: ExplanationSource | None
    repetitions: int
    streak: int
    interval_days: int
    ease_factor: float
    next_review_date: date
    last_reviewed_date: date | None
    version: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class ReviewResult:
    id: str
    user_uid: str
    concept_id: str
    exercise_id: str | None
    score: int
    is_correct: bool
    review_date: date
    created_at: datetime


@dataclass(frozen=True, slots=True)
class LinguisticCorrection:
    id: str
    user_uid: str
    term_spanish: str
    translated_quechua: str
    suggested_chanka: str
    community_context: str | None
    status: CorrectionStatus
    created_at: datetime

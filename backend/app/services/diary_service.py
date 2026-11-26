"""Business layer for Academic Diary and Real Learning Memory synchronization."""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from typing import Any, Protocol
from uuid import UUID, uuid4, uuid5

from app.models.academic_diary import (
    AcademicSession,
    LearningMemoryItem,
    LinguisticCorrection,
    ReviewResult,
    SessionConcept,
)


class InvalidDiaryPayload(ValueError):
    """Client supplied malformed academic diary data."""


class DiaryRepositoryProtocol(Protocol):
    def sync_batch(self, sessions: list[AcademicSession], memory_items: list[LearningMemoryItem],
                   results: list[ReviewResult], base_hashes: dict) -> dict: ...
    def save_linguistic_correction(self, correction: LinguisticCorrection) -> None: ...
    def get_user_sessions(self, user_uid: str, limit: int = 50) -> list[dict]: ...


class DiaryService:
    MAX_BATCH_SIZE = 50
    MAX_TEXT_LEN = 25_000
    MAX_FIELD_LEN = 500

    def __init__(self, repository: DiaryRepositoryProtocol) -> None:
        self._repository = repository

    def sync_full_diary(self, user_uid: str, payload: Any) -> dict[str, Any]:
        """Synchronizes academic sessions, learning memory items, and review evaluations.

        Strict tenant security: user_uid is verified by server authentication, never trusted from client payload.
        """
        self._validate_uid(user_uid)
        if not isinstance(payload, dict):
            raise InvalidDiaryPayload("Se requiere un objeto JSON.")

        raw_sessions = payload.get("sessions", [])
        raw_memory = payload.get("memory_items", [])
        raw_results = payload.get("review_results", [])

        if not isinstance(raw_sessions, list) or not isinstance(raw_memory, list) or not isinstance(raw_results, list):
            raise InvalidDiaryPayload("Los campos 'sessions', 'memory_items' y 'review_results' deben ser listas.")

        total_items = len(raw_sessions) + len(raw_memory) + len(raw_results)
        if total_items == 0:
            return {"accepted_sessions": 0, "accepted_memory": 0, "accepted_results": 0}
        if max(len(raw_sessions), len(raw_memory), len(raw_results)) > self.MAX_BATCH_SIZE:
            raise InvalidDiaryPayload("Lote de sincronización excede el límite permitido.")

        # 1. Process Academic Sessions
        sessions: list[AcademicSession] = []
        session_ids: set[str] = set()
        for idx, s in enumerate(raw_sessions):
            session = self._parse_session(user_uid, s, idx)
            if session.id in session_ids:
                raise InvalidDiaryPayload(f"Sesión {idx}: ID duplicado en el lote.")
            session_ids.add(session.id)
            sessions.append(session)

        # 2. Process Learning Memory Items
        memory_items: list[LearningMemoryItem] = []
        memory_ids: set[str] = set()
        for idx, m in enumerate(raw_memory):
            item = self._parse_memory_item(user_uid, m, idx)
            if item.id in memory_ids:
                raise InvalidDiaryPayload(f"Memoria {idx}: ID duplicado en el lote.")
            memory_ids.add(item.id)
            memory_items.append(item)

        # 3. Process Review Results
        review_results: list[ReviewResult] = []
        result_ids: set[str] = set()
        for idx, r in enumerate(raw_results):
            result = self._parse_review_result(user_uid, r, idx)
            if result.id in result_ids:
                raise InvalidDiaryPayload(f"Evaluación {idx}: ID duplicado en el lote.")
            result_ids.add(result.id)
            review_results.append(result)

        # Persist through repository
        base_hashes = payload.get("base_hashes", {})
        if not isinstance(base_hashes, dict) or set(base_hashes) - {"sessions", "memory_items"}:
            raise InvalidDiaryPayload("Formato de revisiones base inválido.")
        for field, ids in (("sessions", session_ids), ("memory_items", memory_ids)):
            expected = base_hashes.get(field, {})
            if not isinstance(expected, dict) or set(expected) - ids:
                raise InvalidDiaryPayload("La revisión base no corresponde al lote.")
            for value in expected.values():
                if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value)):
                    raise InvalidDiaryPayload("Revisión base inválida.")
        hashes = self._repository.sync_batch(sessions, memory_items, review_results, base_hashes)

        return {
            "accepted_sessions": len(sessions),
            "session_ids": [session.id for session in sessions],
            "hashes": hashes,
            "accepted_memory": len(memory_items),
            "accepted_results": len(review_results),
        }

    def submit_linguistic_correction(self, user_uid: str, payload: Any) -> dict[str, Any]:
        self._validate_uid(user_uid)
        if not isinstance(payload, dict):
            raise InvalidDiaryPayload("Se requiere un objeto JSON.")

        term_es = self._validate_string(payload.get("term_spanish"), "term_spanish", 1, 255)
        trans_qu = self._validate_string(payload.get("translated_quechua"), "translated_quechua", 1, 500)
        sugg_qu = self._validate_string(payload.get("suggested_chanka"), "suggested_chanka", 1, 500)
        context = payload.get("community_context")
        if context is not None:
            context = self._validate_string(context, "community_context", 0, 255)

        corr_id = payload.get("id")
        if corr_id:
            corr_id = self._validate_uuid(corr_id, "id")
        else:
            corr_id = str(uuid4())

        correction = LinguisticCorrection(
            id=corr_id,
            user_uid=user_uid,
            term_spanish=term_es,
            translated_quechua=trans_qu,
            suggested_chanka=sugg_qu,
            community_context=context,
            status="PROPOSED",
            created_at=datetime.now(timezone.utc),
        )
        self._repository.save_linguistic_correction(correction)
        return {"status": "accepted", "id": corr_id}

    def get_user_sessions(self, user_uid: str, limit: int = 50) -> list[dict]:
        self._validate_uid(user_uid)
        return self._repository.get_user_sessions(user_uid, max(1, min(limit, 100)))

    # --- Private Parsing and Validation Helpers ---

    def _validate_uid(self, uid: str) -> None:
        if not isinstance(uid, str) or not uid.strip() or len(uid) > 128:
            raise InvalidDiaryPayload("Identidad de usuario no válida.")

    def _validate_uuid(self, val: Any, field_name: str) -> str:
        if not isinstance(val, str):
            raise InvalidDiaryPayload(f"Campo {field_name} debe ser string UUID.")
        try:
            parsed = UUID(val)
            if parsed.version != 4 or str(parsed) != val:
                raise ValueError()
        except (ValueError, AttributeError):
            raise InvalidDiaryPayload(f"Campo {field_name} debe ser UUIDv4 canónico.")
        return val

    def _validate_string(self, val: Any, field_name: str, min_len: int, max_len: int) -> str:
        if not isinstance(val, str):
            raise InvalidDiaryPayload(f"Campo {field_name} debe ser texto.")
        clean = val.strip()
        if len(clean) < min_len or len(clean) > max_len:
            raise InvalidDiaryPayload(f"Campo {field_name} fuera de límites ({min_len}–{max_len} caracteres).")
        return clean

    def _integer(self, value: Any, field: str, lower: int, upper: int = 4294967295) -> int:
        if type(value) is not int or not lower <= value <= upper:
            raise InvalidDiaryPayload(f"Campo {field} debe ser un entero entre {lower} y {upper}.")
        return value

    def _validate_date(self, val: Any, field_name: str) -> date:
        if not isinstance(val, str):
            raise InvalidDiaryPayload(f"Campo {field_name} debe ser fecha ISO (YYYY-MM-DD).")
        try:
            parsed = date.fromisoformat(val)
            if parsed.year < 1000 or parsed.isoformat() != val:
                raise ValueError
            return parsed
        except ValueError:
            raise InvalidDiaryPayload(f"Campo {field_name} formato de fecha inválido.")

    def _validate_datetime(self, val: Any, field_name: str) -> datetime:
        if not isinstance(val, str):
            raise InvalidDiaryPayload(f"Campo {field_name} debe ser timestamp ISO 8601.")
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(timezone.utc)
            if dt.year < 1000:
                raise ValueError
            return dt
        except (ValueError, OverflowError):
            raise InvalidDiaryPayload(f"Campo {field_name} timestamp inválido.")

    def _parse_session(self, user_uid: str, s: Any, idx: int) -> AcademicSession:
        if not isinstance(s, dict):
            raise InvalidDiaryPayload(f"Sesión {idx}: objeto inválido.")

        session_id = self._validate_uuid(s.get("id"), f"sessions[{idx}].id")
        session_date = self._validate_date(s.get("date"), f"sessions[{idx}].date")
        grade = self._integer(s.get("grade", 1), "grade", 1, 5)
        course_name = self._validate_string(s.get("course"), f"sessions[{idx}].course", 2, 128)
        course_id = self._validate_string(s.get("course_id", course_name[:32]), f"sessions[{idx}].course_id", 1, 32)
        topic = self._validate_string(s.get("topic"), f"sessions[{idx}].topic", 2, 255)
        notes = self._validate_string(s.get("notes", ""), f"sessions[{idx}].notes", 0, self.MAX_TEXT_LEN)

        summary = s.get("summary")
        if summary is not None:
            summary = self._validate_string(summary, f"sessions[{idx}].summary", 0, self.MAX_TEXT_LEN)
        summary_qu = s.get("summaryQuechua")
        if summary_qu is not None:
            summary_qu = self._validate_string(summary_qu, f"sessions[{idx}].summaryQuechua", 0, self.MAX_TEXT_LEN)
        review = s.get("review")
        if review is not None:
            review = self._validate_string(review, f"sessions[{idx}].review", 0, self.MAX_TEXT_LEN)
        review_qu = s.get("reviewQuechua")
        if review_qu is not None:
            review_qu = self._validate_string(review_qu, f"sessions[{idx}].reviewQuechua", 0, self.MAX_TEXT_LEN)

        version = self._integer(s.get("version", 1), "version", 1)
        created_at = self._validate_datetime(s.get("createdAt", session_date.isoformat()), "createdAt")
        updated_at = self._validate_datetime(s.get("updatedAt", created_at.isoformat()), "updatedAt")
        concepts: list[SessionConcept] = []
        for field, kind in (("doubts", "DOUBT"), ("eureka", "EUREKA")):
            entries = s.get(field, [])
            if not isinstance(entries, list) or len(entries) > 500:
                raise InvalidDiaryPayload(f"Campo {field} debe ser una lista de hasta 500 textos.")
            for index, entry in enumerate(entries):
                text = self._validate_string(entry, field, 1, 500)
                concepts.append(SessionConcept(
                    id=str(uuid5(UUID(session_id), f"{user_uid}/{kind}/{index}")),
                    session_id=session_id, user_uid=user_uid, collection_type=kind,
                    concept_text=text, order_index=index, created_at=updated_at,
                ))
        # Preserve the versioned Angular topic/enrichment structures through round trips.
        details = {}
        for key in ("topics", "enrichedDoubts", "enrichedEureka"):
            if key in s:
                items = s[key]
                if not isinstance(items, list) or len(items) > 500 or not all(isinstance(v, dict) for v in items):
                    raise InvalidDiaryPayload(f"Campo {key} debe ser una lista de objetos.")
                details[key] = items
        if "coverId" in s:
            details["coverId"] = self._validate_string(s["coverId"], "coverId", 0, 128)
        try:
            session_details = json.dumps(details, ensure_ascii=False, sort_keys=True, allow_nan=False)
        except (ValueError, RecursionError) as exc:
            raise InvalidDiaryPayload("Estructura de temas inválida.") from exc
        if len(session_details.encode()) > 1024 * 1024:
            raise InvalidDiaryPayload("La sesión excede el tamaño permitido.")

        return AcademicSession(
            id=session_id,
            user_uid=user_uid,
            session_date=session_date,
            grade=grade,
            course_id=course_id,
            course_name=course_name,
            topic=topic,
            notes_text=notes,
            summary_text=summary,
            summary_quechua=summary_qu,
            review_questions=review,
            review_quechua=review_qu,
            version=version,
            sync_status="SYNCED",
            created_at=created_at,
            updated_at=updated_at,
            concepts=concepts,
            session_details=session_details,
        )

    def _parse_memory_item(self, user_uid: str, m: Any, idx: int) -> LearningMemoryItem:
        if not isinstance(m, dict):
            raise InvalidDiaryPayload(f"Memoria {idx}: objeto inválido.")

        mem_id = self._validate_uuid(m.get("id"), f"memory[{idx}].id")
        session_id = self._validate_uuid(m.get("sessionId"), f"memory[{idx}].sessionId")
        course = self._validate_string(m.get("course"), f"memory[{idx}].course", 2, 128)
        topic = self._validate_string(m.get("topic"), f"memory[{idx}].topic", 2, 255)
        text = self._validate_string(m.get("conceptText"), f"memory[{idx}].conceptText", 1, 500)

        status = m.get("status", "PENDING")
        if status not in ("PENDING", "EXPLAINED", "TESTED", "MASTERED", "REINFORCING"):
            raise InvalidDiaryPayload("Estado de memoria inválido.")

        explanation = m.get("explanation")
        if explanation is not None:
            explanation = self._validate_string(explanation, f"memory[{idx}].explanation", 0, self.MAX_TEXT_LEN)

        source = m.get("explanationSource")
        if source not in (None, "ON_DEVICE", "IN_CLOUD", "CURRICULUM_OFFLINE"):
            raise InvalidDiaryPayload("Origen de explicación inválido.")

        repetitions = self._integer(m.get("repetitions", 0), "repetitions", 0)
        streak = self._integer(m.get("streak", 0), "streak", 0)
        interval_days = self._integer(m.get("intervalDays", 1), "intervalDays", 1)
        ease_factor = m.get("easeFactor", 2.5)
        if type(ease_factor) not in (int, float) or not 1.0 <= ease_factor <= 99.99:
            raise InvalidDiaryPayload("Factor SM-2 fuera de rango.")
        ease_factor = round(float(ease_factor), 2)
        next_review = self._validate_date(m.get("nextReviewDate", date.today().isoformat()), f"memory[{idx}].nextReviewDate")

        last_reviewed = m.get("lastReviewedDate")
        if last_reviewed:
            last_reviewed_date = self._validate_date(last_reviewed, f"memory[{idx}].lastReviewedDate")
        else:
            last_reviewed_date = None

        version = self._integer(m.get("version", 1), "version", 1)
        created_at = self._validate_datetime(m.get("createdAt", next_review.isoformat()), f"memory[{idx}].createdAt")
        updated_at = self._validate_datetime(m.get("updatedAt", created_at.isoformat()), f"memory[{idx}].updatedAt")

        return LearningMemoryItem(
            id=mem_id,
            user_uid=user_uid,
            session_id=session_id,
            course_name=course,
            topic=topic,
            concept_text=text,
            status=status,  # type: ignore[arg-type]
            explanation_text=explanation,
            explanation_source=source,  # type: ignore[arg-type]
            repetitions=repetitions,
            streak=streak,
            interval_days=interval_days,
            ease_factor=ease_factor,
            next_review_date=next_review,
            last_reviewed_date=last_reviewed_date,
            version=version,
            created_at=created_at,
            updated_at=updated_at,
        )

    def _parse_review_result(self, user_uid: str, r: Any, idx: int) -> ReviewResult:
        if not isinstance(r, dict):
            raise InvalidDiaryPayload(f"Evaluación {idx}: objeto inválido.")

        res_id = self._validate_uuid(r.get("id"), f"review[{idx}].id")
        concept_id = self._validate_uuid(r.get("conceptId"), f"review[{idx}].conceptId")
        ex_id = r.get("exerciseId")
        if ex_id is not None:
            ex_id = self._validate_string(ex_id, "exerciseId", 1, 64)
        score = self._integer(r.get("score"), "score", 0, 5)
        is_correct = r.get("isCorrect")
        if type(is_correct) is not bool:
            raise InvalidDiaryPayload("isCorrect debe ser booleano.")
        rev_date = self._validate_date(r.get("date", date.today().isoformat()), f"review[{idx}].date")

        return ReviewResult(
            id=res_id,
            user_uid=user_uid,
            concept_id=concept_id,
            exercise_id=ex_id,
            score=score,
            is_correct=is_correct,
            review_date=rev_date,
            created_at=datetime.now(timezone.utc),
        )

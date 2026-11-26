"""Unit tests for DiaryService: validation, schema, owner isolation, idempotency."""
import unittest
from datetime import date, datetime, timezone
from uuid import uuid4

from app.models.academic_diary import AcademicSession, LearningMemoryItem, LinguisticCorrection, ReviewResult
from app.services.diary_service import DiaryService, InvalidDiaryPayload


class MockDiaryRepository:
    def __init__(self) -> None:
        self.saved_sessions: list[AcademicSession] = []
        self.saved_memory: list[LearningMemoryItem] = []
        self.saved_results: list[ReviewResult] = []
        self.saved_corrections: list[LinguisticCorrection] = []

    def sync_batch(self, sessions, memory_items, results, base_hashes):
        self.saved_sessions.extend(sessions)
        self.saved_memory.extend(memory_items)
        self.saved_results.extend(results)
        return {}

    def save_linguistic_correction(self, correction: LinguisticCorrection) -> None:
        self.saved_corrections.append(correction)

    def get_user_sessions(self, user_uid: str, limit: int = 50) -> list[dict]:
        return [
            {"id": s.id, "user_uid": s.user_uid, "topic": s.topic}
            for s in self.saved_sessions if s.user_uid == user_uid
        ]


class DiaryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = MockDiaryRepository()
        self.service = DiaryService(self.repo)
        self.student_uid = "verified-student-uid-100"

    def test_sync_valid_full_diary(self) -> None:
        s_id = str(uuid4())
        m_id = str(uuid4())
        r_id = str(uuid4())

        payload = {
            "sessions": [
                {
                    "id": s_id,
                    "date": "2026-11-16",
                    "grade": 3,
                    "course": "Ciencia y Tecnología",
                    "topic": "La célula y fotosíntesis",
                    "notes": "Las plantas capturan luz solar mediante la clorofila.",
                    "summary": "Resumen sobre fotosíntesis y producción de glucosa.",
                    "doubts": ["¿Dónde ocurre la fase oscura?"],
                    "eureka": ["¡La clorofila da el color verde!"],
                    "version": 1,
                    "createdAt": "2026-11-16T15:00:00Z",
                    "updatedAt": "2026-11-16T15:30:00Z",
                }
            ],
            "memory_items": [
                {
                    "id": m_id,
                    "sessionId": s_id,
                    "course": "Ciencia y Tecnología",
                    "topic": "La célula y fotosíntesis",
                    "conceptText": "¿Dónde ocurre la fase oscura?",
                    "status": "EXPLAINED",
                    "explanation": "Ocurre en el estroma del cloroplasto.",
                    "explanationSource": "ON_DEVICE",
                    "repetitions": 1,
                    "streak": 1,
                    "intervalDays": 1,
                    "easeFactor": 2.5,
                    "nextReviewDate": "2026-11-17",
                    "version": 1,
                }
            ],
            "review_results": [
                {
                    "id": r_id,
                    "conceptId": m_id,
                    "exerciseId": "cyt-sec2-002",
                    "score": 5,
                    "isCorrect": True,
                    "date": "2026-11-16",
                }
            ]
        }

        result = self.service.sync_full_diary(self.student_uid, payload)
        self.assertEqual(result["accepted_sessions"], 1)
        self.assertEqual(result["accepted_memory"], 1)
        self.assertEqual(result["accepted_results"], 1)

        # Verificar autorización por propietario (owner isolation)
        self.assertEqual(self.repo.saved_sessions[0].user_uid, self.student_uid)
        self.assertEqual(self.repo.saved_sessions[0].concepts[0].user_uid, self.student_uid)
        self.assertEqual(self.repo.saved_memory[0].user_uid, self.student_uid)
        self.assertEqual(self.repo.saved_results[0].user_uid, self.student_uid)

    def test_rejects_spoofed_or_empty_uid(self) -> None:
        with self.assertRaises(InvalidDiaryPayload):
            self.service.sync_full_diary("", {"sessions": []})

    def test_rejects_non_uuid(self) -> None:
        payload = {
            "sessions": [
                {
                    "id": "not-a-valid-uuid",
                    "date": "2026-11-16",
                    "course": "Matemática",
                    "topic": "Fracciones",
                    "notes": "1/2 + 1/4 = 3/4",
                }
            ]
        }
        with self.assertRaises(InvalidDiaryPayload) as ctx:
            self.service.sync_full_diary(self.student_uid, payload)
        self.assertIn("UUIDv4", str(ctx.exception))

    def test_rejects_duplicate_ids_in_batch(self) -> None:
        duplicate_id = str(uuid4())
        payload = {
            "sessions": [
                {"id": duplicate_id, "date": "2026-11-16", "course": "Matemática", "topic": "T1", "notes": "N1"},
                {"id": duplicate_id, "date": "2026-11-16", "course": "Matemática", "topic": "T2", "notes": "N2"},
            ]
        }
        with self.assertRaises(InvalidDiaryPayload) as ctx:
            self.service.sync_full_diary(self.student_uid, payload)
        self.assertIn("duplicado", str(ctx.exception))

    def test_linguistic_correction_submission(self) -> None:
        payload = {
            "term_spanish": "fracción",
            "translated_quechua": "rakiy",
            "suggested_chanka": "patma / rakiy yupay",
            "community_context": "Usado comúnmente en comunidades de Huanta y Andahuaylas",
        }
        res = self.service.submit_linguistic_correction(self.student_uid, payload)
        self.assertEqual(res["status"], "accepted")
        self.assertEqual(len(self.repo.saved_corrections), 1)
        c = self.repo.saved_corrections[0]
        self.assertEqual(c.user_uid, self.student_uid)
        self.assertEqual(c.term_spanish, "fracción")
        self.assertEqual(c.suggested_chanka, "patma / rakiy yupay")
        self.assertEqual(c.status, "PROPOSED")

    def test_horizontal_authorization_isolation(self) -> None:
        student_a = "verified-student-A"
        student_b = "verified-student-B"
        session_a_id = str(uuid4())

        # Even if client tries to spoof another user_uid inside payload, server binds strictly to authenticated uid
        payload_a = {
            "sessions": [
                {
                    "id": session_a_id,
                    "user_uid": student_b,
                    "date": "2026-11-18",
                    "course": "Matemática",
                    "topic": "Ecuaciones lineales",
                    "notes": "Apunte privado del estudiante A.",
                }
            ]
        }
        self.service.sync_full_diary(student_a, payload_a)

        sessions_a = self.service.get_user_sessions(student_a)
        sessions_b = self.service.get_user_sessions(student_b)
        self.assertEqual(len(sessions_a), 1)
        self.assertEqual(sessions_a[0]["user_uid"], student_a)
        self.assertEqual(len(sessions_b), 0)

    def test_idempotent_resync_same_session_id(self) -> None:
        session_id = str(uuid4())
        payload = {
            "sessions": [
                {
                    "id": session_id,
                    "date": "2026-11-18",
                    "course": "Comunicación",
                    "topic": "Texto argumentativo",
                    "notes": "Versión 1",
                }
            ]
        }
        res1 = self.service.sync_full_diary(self.student_uid, payload)
        res2 = self.service.sync_full_diary(self.student_uid, payload)
        self.assertEqual(res1["accepted_sessions"], 1)
        self.assertEqual(res2["accepted_sessions"], 1)


if __name__ == "__main__":
    unittest.main()

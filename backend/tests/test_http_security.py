"""HTTP boundary tests. Firebase verdicts are synthetic except for missing-header checks."""
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from flask import Flask
from app.controllers.diary_controller import diary_bp
from app.controllers.sync_controller import sync_bp
from app.controllers.translation_controller import translate_bp
from app.repositories.diary_repository import DiaryConflict
from app.services.diary_service import DiaryRepositoryProtocol, DiaryService
from app.services.sync_service import SyncService
from app.services.translation_service import TranslationService


class FlaskBoundaryTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.config["MAX_CONTENT_LENGTH"] = 4096
        for bp in (sync_bp, diary_bp, translate_bp):
            app.register_blueprint(bp)
        app.extensions["ostrix_diary_service"] = DiaryService(None)
        app.extensions["ostrix_translation"] = TranslationService(None)
        self.client = app.test_client()

    def test_private_routes_reject_missing_headers(self):
        for method, path in (("post", "sync"), ("post", "diary/sync"), ("get", "diary/sessions"),
                             ("post", "translate"), ("post", "linguistic-corrections")):
            for headers in ({}, {"Authorization": "Bearer fixture"}, {"X-Firebase-AppCheck": "fixture"}):
                with self.subTest(path=path, headers=list(headers)):
                    response = getattr(self.client, method)("/api/v1/" + path, headers=headers)
                    self.assertEqual(response.status_code, 401)

    def test_app_check_and_revocation_and_anonymous_guard(self):
        headers = {"Authorization": "Bearer fixture", "X-Firebase-AppCheck": "fixture"}
        with patch("app.controllers.sync_controller.app_check.verify_token") as check, \
             patch("app.controllers.sync_controller.auth.verify_id_token") as auth:
            check.side_effect = ValueError()
            self.assertEqual(self.client.get("/api/v1/diary/sessions", headers=headers).status_code, 401)
            auth.assert_not_called()
            check.side_effect = None
            auth.side_effect = ValueError()
            response = self.client.get("/api/v1/diary/sessions", query_string={"user_uid": "student-b"},
                                       headers={**headers, "X-User-Uid": "student-b"})
            self.assertEqual(response.status_code, 401)
            auth.assert_called_with("fixture", check_revoked=True)
            auth.side_effect = None
            auth.return_value = {"uid":"A", "firebase":{"sign_in_provider":"anonymous"}}
            self.assertEqual(self.client.post("/api/v1/diary/sync", json={}, headers=headers).status_code, 401)

    def test_individual_requires_verified_email_even_with_valid_tokens(self):
        """A Google sign-in is not sufficient if the address was not verified."""
        from app.controllers.sync_controller import _authenticated_uid
        from flask import request
        headers = {"Authorization": "Bearer verified-id-token", "X-Firebase-AppCheck": "valid-attestation"}
        with patch("app.controllers.sync_controller.app_check.verify_token"), \
             patch("app.controllers.sync_controller.auth.verify_id_token") as verify:
            for email_verified in (None, False, "true", 1):
                with self.subTest(email_verified=email_verified):
                    verify.return_value = {
                        "uid": "student-a", "email_verified": email_verified,
                        "firebase": {"sign_in_provider": "google.com"},
                    }
                    response = self.client.get("/api/v1/diary/sessions", headers=headers)
                    self.assertEqual(response.status_code, 401)
            verify.return_value = {
                "uid": "student-a", "email_verified": True,
                "firebase": {"sign_in_provider": "google.com"},
            }
            # The test is scoped to the credential boundary, not database availability.
            with self.client.application.test_request_context("/api/v1/diary/sessions", headers=headers):
                self.assertEqual(_authenticated_uid(), "student-a")

    def test_authenticated_user_id_never_comes_from_untrusted_headers(self):
        """Different synthetic Firebase tokens must remain distinct tenants."""
        from app.controllers.sync_controller import _authenticated_uid
        headers = {"X-Firebase-AppCheck": "attestation", "X-User-Uid": "student-b"}
        with patch("app.controllers.sync_controller.app_check.verify_token"), \
             patch("app.controllers.sync_controller.auth.verify_id_token") as verify:
            verify.side_effect = lambda token, **kw: {
                "uid": "student-a" if token == "token-a" else "student-b",
                "email_verified": True,
                "firebase": {"sign_in_provider": "google.com"},
            }
            for token, expected in (("token-a", "student-a"), ("token-b", "student-b")):
                with self.client.application.test_request_context(
                    "/api/v1/diary/sessions", headers={**headers, "Authorization": f"Bearer {token}"}
                ):
                    self.assertEqual(_authenticated_uid(), expected)
            self.assertEqual(verify.call_count, 2)

    def test_translation_cannot_dispatch_without_explicit_consent(self):
        with patch("app.controllers.translation_controller._authenticated_uid", return_value="fixture"):
            for consent in ({}, {"cloudConsent":False}, {"cloudConsent":"true"}):
                res = self.client.post("/api/v1/translate", json={"text":"fixture", "source":"es", "target":"qu", **consent})
                self.assertEqual(res.status_code, 400)

    def test_diary_uses_verified_owner_for_every_record_and_listing(self):
        repo = Mock(spec=DiaryRepositoryProtocol)
        repo.sync_batch.return_value = {}
        repo.get_user_sessions.return_value = []
        self.client.application.extensions["ostrix_diary_service"] = DiaryService(repo)
        session_id, memory_id, review_id = (str(uuid4()) for _ in range(3))
        with patch("app.controllers.sync_controller.app_check.verify_token"), \
             patch("app.controllers.sync_controller.auth.verify_id_token") as verify:
            for owner, other in (("student-a", "student-b"), ("student-b", "student-a")):
                with self.subTest(owner=owner):
                    verify.return_value = {
                        "uid": owner, "email_verified": True, "firebase": {"sign_in_provider": "google.com"},
                    }
                    headers = {
                        "Authorization": "Bearer fixture", "X-Firebase-AppCheck": "fixture", "X-User-Uid": other,
                    }
                    payload = {
                        "user_uid": other,
                        "sessions": [{"id": session_id, "date": "2026-01-01", "course": "Arte",
                                      "topic": "Color", "doubts": ["Pregunta"], "user_uid": other}],
                        "memory_items": [{"id": memory_id, "sessionId": session_id, "course": "Arte",
                                          "topic": "Color", "conceptText": "Pregunta", "user_uid": other}],
                        "review_results": [{"id": review_id, "conceptId": memory_id, "score": 3,
                                            "isCorrect": True, "user_uid": other}],
                    }
                    reply = self.client.post("/api/v1/diary/sync", json=payload, headers=headers)
                    self.assertEqual(reply.status_code, 200)
                    sessions, memory, reviews, _ = repo.sync_batch.call_args.args
                    self.assertEqual(sessions[0].id, session_id)
                    for record in (sessions[0], sessions[0].concepts[0], memory[0], reviews[0]):
                        self.assertEqual(record.user_uid, owner)
                    reply = self.client.post("/api/v1/linguistic-corrections", headers=headers, json={
                        "term_spanish": "agua", "translated_quechua": "yaku", "suggested_chanka": "yaku",
                        "user_uid": other,
                    })
                    self.assertEqual(reply.status_code, 200)
                    self.assertEqual(repo.save_linguistic_correction.call_args.args[0].user_uid, owner)
                    reply = self.client.get("/api/v1/diary/sessions", query_string={"user_uid": other}, headers=headers)
                    self.assertEqual(reply.status_code, 200)
                    repo.get_user_sessions.assert_called_with(owner, 50)

    def test_unrepresentable_verified_owner_cannot_access_persistent_routes(self):
        headers = {"Authorization": "Bearer fixture", "X-Firebase-AppCheck": "fixture"}
        service = Mock(spec=DiaryService)
        service.get_user_sessions.return_value = []
        service.sync_full_diary.return_value = {}
        service.submit_linguistic_correction.return_value = {}
        sync_service = Mock(spec=SyncService)
        sync_service.sync.return_value = {}
        self.client.application.extensions["ostrix_diary_service"] = service
        self.client.application.extensions["ostrix_sync_service"] = sync_service
        with patch("app.controllers.sync_controller.app_check.verify_token"), \
             patch("app.controllers.sync_controller.auth.verify_id_token") as verify:
            for uid in ("student-a ", "estudiante-ñ"):
                verify.return_value = {
                    "uid": uid, "email_verified": True, "firebase": {"sign_in_provider": "google.com"},
                }
                for path in ("diary/sessions", "diary/sync", "linguistic-corrections", "sync"):
                    with self.subTest(uid=uid, path=path):
                        method = "GET" if path == "diary/sessions" else "POST"
                        reply = self.client.open("/api/v1/" + path, method=method, json={}, headers=headers)
                        self.assertEqual(reply.status_code, 401)
        self.assertEqual(service.mock_calls, [])
        self.assertEqual(sync_service.mock_calls, [])

    def test_correction_storage_conflict_keeps_owner_details_private(self):
        repo = Mock(spec=DiaryRepositoryProtocol)
        repo.save_linguistic_correction.side_effect = DiaryConflict("fixture-owner-detail")
        self.client.application.extensions["ostrix_diary_service"] = DiaryService(repo)
        with patch("app.controllers.diary_controller._authenticated_uid", return_value="student-a"):
            reply = self.client.post("/api/v1/linguistic-corrections", json={
                "term_spanish": "agua", "translated_quechua": "yaku", "suggested_chanka": "yaku",
            })
        self.assertEqual(reply.status_code, 409)
        self.assertNotIn("fixture-owner-detail", reply.get_data(as_text=True))

    def test_oversized_json_uses_413_for_each_write_endpoint(self):
        for name, path in (("diary","diary/sync"), ("diary","linguistic-corrections"), ("sync","sync"),
                           ("translation","translate")):
            with patch(f"app.controllers.{name}_controller._authenticated_uid", return_value="fixture"):
                response = self.client.post("/api/v1/"+path, data=" "*4097, content_type="application/json")
                self.assertEqual(response.status_code, 413, path)

    def test_schema_errors_are_400_without_writes(self):
        mem = {"id":str(uuid4()), "sessionId":str(uuid4()), "course":"ABC", "topic":"DEF", "conceptText":"XYZ"}
        with patch("app.controllers.diary_controller._authenticated_uid", return_value="fixture"):
            for field, bad in (("repetitions", {}), ("streak", None), ("easeFactor", True), ("version", -1),
                               ("status", 3), ("intervalDays", 2**32), ("easeFactor", float("nan"))):
                res = self.client.post("/api/v1/diary/sync", json={"memory_items":[{**mem, field:bad}]})
                self.assertEqual(res.status_code, 400, field)
            res = self.client.post("/api/v1/diary/sync", data="{}", content_type="text/plain")
            self.assertEqual(res.status_code, 415)

"""HTTP Controller for Academic Diary and Real Learning Memory endpoints."""
from __future__ import annotations

import logging
from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge

from app.controllers.sync_controller import _authenticated_uid
from app.repositories.diary_repository import DiaryConflict, DiaryPersistenceError
from app.services.diary_service import DiaryService, InvalidDiaryPayload

diary_bp = Blueprint("diary", __name__)
logger = logging.getLogger(__name__)


@diary_bp.post("/api/v1/diary/sync")
def sync_diary():
    uid = _authenticated_uid()
    if uid is None:
        return jsonify({"error": "No autorizado."}), 401
    if not request.is_json:
        return jsonify({"error": "Content-Type debe ser application/json."}), 415
    try:
        payload = request.get_json(silent=False)
        service: DiaryService = current_app.extensions["ostrix_diary_service"]
        result = service.sync_full_diary(uid, payload)
        return jsonify(result), 200
    except RequestEntityTooLarge:
        raise
    except (BadRequest, RecursionError):
        return jsonify({"error": "JSON no válido."}), 400
    except InvalidDiaryPayload as exc:
        return jsonify({"error": str(exc)}), 400
    except DiaryConflict:
        return jsonify({"error": "Conflicto de sincronización. Conserva la copia local y revisa la versión del diario."}), 409
    except DiaryPersistenceError:
        logger.error("Diary storage unavailable")
        return jsonify({"error": "Almacenamiento de diario no disponible."}), 503
    except Exception:
        logger.exception("Unexpected error in diary sync")
        return jsonify({"error": "Error interno del servidor."}), 500


@diary_bp.get("/api/v1/diary/sessions")
def get_sessions():
    uid = _authenticated_uid()
    if uid is None:
        return jsonify({"error": "No autorizado."}), 401
    try:
        limit = request.args.get("limit", 50, type=int)
        service: DiaryService = current_app.extensions["ostrix_diary_service"]
        sessions = service.get_user_sessions(uid, limit)
        return jsonify({"sessions": sessions}), 200
    except DiaryPersistenceError:
        return jsonify({"error": "Almacenamiento de diario no disponible."}), 503
    except Exception:
        logger.exception("Unexpected error fetching sessions")
        return jsonify({"error": "Error al consultar sesiones."}), 500


@diary_bp.post("/api/v1/linguistic-corrections")
def submit_linguistic_correction():
    uid = _authenticated_uid()
    if uid is None:
        return jsonify({"error": "No autorizado."}), 401
    if not request.is_json:
        return jsonify({"error": "Content-Type debe ser application/json."}), 415
    try:
        payload = request.get_json(silent=False)
        service: DiaryService = current_app.extensions["ostrix_diary_service"]
        result = service.submit_linguistic_correction(uid, payload)
        return jsonify(result), 200
    except RequestEntityTooLarge:
        raise
    except (BadRequest, RecursionError, InvalidDiaryPayload) as exc:
        return jsonify({"error": str(exc)}), 400
    except DiaryConflict:
        return jsonify({"error": "Conflicto al guardar la sugerencia lingüística."}), 409
    except DiaryPersistenceError:
        return jsonify({"error": "Almacenamiento de diario no disponible."}), 503
    except Exception:
        logger.exception("Unexpected error submitting linguistic correction")
        return jsonify({"error": "Error al registrar la sugerencia lingüística."}), 500

"""HTTP/controller layer: App Check + Firebase Auth, JSON parsing and error mapping."""
from __future__ import annotations

import logging
from typing import Any

from firebase_admin import app_check, auth
from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge

from app.repositories.sync_repository import EventConflict, PersistenceError
from app.services.sync_service import InvalidSyncPayload, SyncService

logger = logging.getLogger(__name__)
sync_bp = Blueprint("sync", __name__)


def _authenticated_uid(*, individual: bool = True) -> str | None:
    """Verify independent App Check and Firebase Auth credentials.

    SECURITY DIAGNOSTICS: log the failing stage ONLY, never a credential value.
    """
    attestation = request.headers.get("X-Firebase-AppCheck", "")
    authorization = request.headers.get("Authorization", "")
    if not attestation or not authorization.startswith("Bearer "):
        logger.warning("OSTRIX_DIAG HEADERS_MISSING")
        return None
    bearer = authorization.removeprefix("Bearer ").strip()
    if not bearer:
        logger.warning("OSTRIX_DIAG AUTH_HEADER_EMPTY")
        return None
    try:
        app_check.verify_token(attestation)
    except Exception as exc:
        logger.warning("OSTRIX_DIAG APP_CHECK_REJECTED (%s)", type(exc).__name__)
        return None

    try:
        claims: dict[str, Any] = auth.verify_id_token(bearer, check_revoked=True)
    except Exception as exc:
        logger.warning("OSTRIX_DIAG FIREBASE_AUTH_REJECTED (%s)", type(exc).__name__)
        return None

    firebase_claims = claims.get("firebase")
    provider = firebase_claims.get("sign_in_provider") if isinstance(firebase_claims, dict) else None
    if individual:
        if not isinstance(provider, str) or not provider or provider == "anonymous":
            logger.warning("OSTRIX_DIAG PROVIDER_REJECTED")
            return None
        if claims.get("email_verified") is not True:
            logger.warning("OSTRIX_DIAG EMAIL_NOT_VERIFIED")
            return None

    uid = claims.get("uid")
    if not isinstance(uid, str) or not uid.strip() or len(uid) > 128:
        logger.warning("OSTRIX_DIAG UID_REJECTED")
        return None
    # MySQL owner columns use ASCII with a PAD SPACE collation. Preserve exact Firebase identity.
    if individual and (not uid.isascii() or uid.endswith(" ")):
        logger.warning("OSTRIX_DIAG UID_REJECTED")
        return None
    return uid

@sync_bp.post("/api/v1/sync")
def sync_events():  # type: ignore[no-untyped-def]
    uid = _authenticated_uid()
    if uid is None:
        return jsonify({"error": "No autorizado."}), 401
    if not request.is_json:
        return jsonify({"error": "Content-Type debe ser application/json."}), 415
    try:
        payload = request.get_json(silent=False)
        service: SyncService = current_app.extensions["ostrix_sync_service"]
        result = service.sync(uid, payload)
        return jsonify(result), 200
    except RequestEntityTooLarge:
        raise
    except (BadRequest, RecursionError):
        return jsonify({"error": "JSON no válido."}), 400
    except InvalidSyncPayload as exc:
        return jsonify({"error": str(exc)}), 400
    except EventConflict:
        return jsonify({"error": "Un evento ya guardado tiene contenido diferente. Conserva la copia local."}), 409
    except PersistenceError:
        return jsonify({"error": "Almacenamiento temporalmente no disponible."}), 503
    except Exception:
        logger.exception("Unexpected synchronization error")
        return jsonify({"error": "Error interno del servidor."}), 500

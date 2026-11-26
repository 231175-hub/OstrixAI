"""Translation endpoint, protected by Firebase identity and App Check.

Only translate content AFTER explicit user consent from the Angular UI. The server
cannot prove consent; clients must not auto-send or log student notes.
"""
from __future__ import annotations
import logging
from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge
from app.controllers.sync_controller import _authenticated_uid
from app.services.translation_service import InvalidTranslation, TranslationError

translate_bp = Blueprint("translation", __name__)
logger = logging.getLogger(__name__)

@translate_bp.post("/api/v1/translate")
def translate_text():
    if _authenticated_uid(individual=False) is None:
        return jsonify({"error": "No autorizado."}), 401
    if not request.is_json:
        return jsonify({"error": "Content-Type debe ser application/json."}), 415
    try:
        return jsonify(current_app.extensions["ostrix_translation"].translate(request.get_json())), 200
    except RequestEntityTooLarge:
        raise
    except (BadRequest, RecursionError, InvalidTranslation) as exc:
        return jsonify({"error": str(exc)}), 400
    except TranslationError:
        logger.warning("Upstream translation failed")
        return jsonify({"error": "Traductor temporalmente no disponible."}), 502
    except Exception:
        logger.exception("Unexpected translation server error")
        return jsonify({"error": "Error interno."}), 500

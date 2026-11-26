"""Flask application factory with explicit dependency wiring for N-layer architecture."""
from __future__ import annotations

def create_app():
    """Initialize integrations only when launching the HTTP app, not domain unit tests."""
    import firebase_admin
    from flask import Flask, jsonify, request
    from flask_cors import CORS
    from app.config.database import create_pool
    from app.config.settings import Settings
    from app.controllers.sync_controller import sync_bp
    from app.controllers.translation_controller import translate_bp
    from app.controllers.diary_controller import diary_bp
    from app.repositories.sync_repository import SyncRepository
    from app.repositories.diary_repository import DiaryRepository
    from app.services.sync_service import SyncService
    from app.services.diary_service import DiaryService
    from app.services.translation_service import TranslationService
    from app.repositories.translation_gateway import GoogleTranslationGateway

    settings = Settings.from_env()
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024
    app.config["JSON_SORT_KEYS"] = False
    CORS(
        app,
        resources={r"/api/v1/*": {"origins": list(settings.cors_origins)}},
        methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "X-Firebase-AppCheck", "Content-Type"],
    )

    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})

    pool = create_pool(settings)
    app.extensions["ostrix_sync_service"] = SyncService(
        SyncRepository(pool.get_connection),
    )
    app.register_blueprint(sync_bp)

    app.extensions["ostrix_diary_service"] = DiaryService(
        DiaryRepository(pool.get_connection),
    )
    app.register_blueprint(diary_bp)

    # Construct upstream translator lazily on the first request to preserve app startup.
    app.extensions["ostrix_translation"] = TranslationService(
        GoogleTranslationGateway(settings.firebase_project_id),
    )
    app.register_blueprint(translate_bp)

    @app.after_request
    def protect_student_responses(response):
        if request.path.startswith("/api/v1/"):
            response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "ostrix-sync-api", "version": "v0.4.1"})

    @app.errorhandler(413)
    def payload_too_large(_error):
        return jsonify({"error": "Solicitud demasiado grande."}), 413

    return app

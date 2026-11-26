"""External translation provider boundary (Google Cloud Translation v3).

Cloud credentials use ADC in the backend; no key is shipped to Angular.
"""
from __future__ import annotations
from google.cloud import translate_v3

from app.services.translation_service import TranslationError


class GoogleTranslationGateway:
    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        self._client: translate_v3.TranslationServiceClient | None = None

    def translate(self, text: str) -> str:
        try:
            if self._client is None:
                self._client = translate_v3.TranslationServiceClient()
            result = self._client.translate_text(
                request={
                    "parent": f"projects/{self.project_id}/locations/global",
                    "contents": [text],
                    "mime_type": "text/plain",
                    "source_language_code": "es",
                    "target_language_code": "qu",
                },
                timeout=12.0,
            )
            if not result.translations:
                raise TranslationError("Google no devolvió traducción.")
            return result.translations[0].translated_text
        except TranslationError:
            raise
        except Exception as exc:
            raise TranslationError("Servicio de traducción no disponible.") from exc

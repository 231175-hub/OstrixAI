"""Translation business rules. Spanish -> Quechua ('qu') is experimental for Chanka.

The input must be machine-generated study text, NOT private student notes.
"""
from __future__ import annotations
from typing import Protocol


class TranslationError(RuntimeError):
    """Upstream translator failed or returned an unusable result."""


class InvalidTranslation(ValueError):
    """Request is invalid or too large for a single real-time translation."""


class Translator(Protocol):
    def translate(self, text: str) -> str: ...


class TranslationService:
    MAX_TEXT = 4000

    def __init__(self, gateway: Translator) -> None:
        self.gateway = gateway

    def translate(self, payload: object) -> dict[str, str]:
        if not isinstance(payload, dict) or set(payload) != {"text", "source", "target", "cloudConsent"}:
            raise InvalidTranslation("Se requieren text, source, target y consentimiento.")
        if payload["cloudConsent"] is not True:
            raise InvalidTranslation("Falta consentimiento explícito para traducir en la nube.")
        text, source, target = payload["text"], payload["source"], payload["target"]
        if source != "es" or target != "qu":
            raise InvalidTranslation("La demo admite solo traducción es -> qu.")
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= self.MAX_TEXT:
            raise InvalidTranslation("El texto debe tener entre 1 y 4000 caracteres.")
        translated = self.gateway.translate(text.strip())
        if not translated.strip():
            raise TranslationError("Traducción vacía.")
        return {"translated": translated.strip(), "source": "es", "target": "qu", "quality": "machine-unverified"}

"""Business layer: schema and ownership validation, independent of transport/storage."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Protocol
from uuid import UUID

from app.models.sync_event import InferenceSource, SyncEvent


class InvalidSyncPayload(ValueError):
    """Client supplied malformed or out-of-contract synchronization data."""


class SyncWriter(Protocol):
    def insert_batch(self, events: list[SyncEvent]) -> None: ...


class SyncService:
    MAX_BATCH_SIZE = 25
    MAX_TEXT = 25_000

    def __init__(self, repository: SyncWriter) -> None:
        self._repository = repository

    def sync(self, uid: str, payload: Any) -> dict[str, Any]:
        """Validate entire batch BEFORE writing; duplicates are handled by DB idempotency.

        The user UID is read from a verified Firebase Auth token, never from JSON.
        """
        if not isinstance(uid, str) or not uid or len(uid) > 128:
            raise InvalidSyncPayload("Identidad de usuario inválida.")
        if not isinstance(payload, dict) or set(payload.keys()) != {"events"}:
            raise InvalidSyncPayload("Se requiere un objeto JSON con la clave 'events'.")
        raw_events = payload["events"]
        if not isinstance(raw_events, list) or not 1 <= len(raw_events) <= self.MAX_BATCH_SIZE:
            raise InvalidSyncPayload("El lote debe contener entre 1 y 25 eventos.")

        events: list[SyncEvent] = []
        ids: set[str] = set()
        for index, item in enumerate(raw_events):
            if not isinstance(item, dict):
                raise InvalidSyncPayload(f"Evento {index}: objeto inválido.")
            required = {"id", "note", "answer", "inference_source", "is_complex", "occurred_at"}
            if set(item.keys()) != required:
                raise InvalidSyncPayload(f"Evento {index}: faltan o sobran campos.")
            event_id = item["id"]
            if not isinstance(event_id, str):
                raise InvalidSyncPayload(f"Evento {index}: ID inválido.")
            try:
                parsed_uuid = UUID(event_id)
                if parsed_uuid.version != 4 or str(parsed_uuid) != event_id:
                    raise ValueError("UUID must be canonical v4")
            except (ValueError, AttributeError) as exc:
                raise InvalidSyncPayload(f"Evento {index}: ID debe ser UUIDv4.") from exc
            if event_id in ids:
                raise InvalidSyncPayload("No se permiten IDs duplicados en el mismo lote.")
            ids.add(event_id)

            note = self._validated_text(item["note"], index, "note")
            answer = self._validated_text(item["answer"], index, "answer")
            source = item["inference_source"]
            if source not in ("ON_DEVICE", "IN_CLOUD", "OFFLINE_ESSENTIAL") or not isinstance(source, str):
                raise InvalidSyncPayload(f"Evento {index}: inference_source inválido.")
            complex_flag = item["is_complex"]
            if type(complex_flag) is not bool:
                raise InvalidSyncPayload(f"Evento {index}: is_complex debe ser booleano.")
            instant = item["occurred_at"]
            if not isinstance(instant, str):
                raise InvalidSyncPayload(f"Evento {index}: occurred_at inválido.")
            try:
                parsed_time = datetime.fromisoformat(instant.replace("Z", "+00:00"))
            except ValueError as exc:
                raise InvalidSyncPayload(f"Evento {index}: fecha ISO 8601 inválida.") from exc
            if parsed_time.tzinfo is None:
                raise InvalidSyncPayload(f"Evento {index}: fecha requiere zona horaria.")
            try:
                parsed_time = parsed_time.astimezone(timezone.utc)
            except OverflowError as exc:
                raise InvalidSyncPayload(f"Evento {index}: fecha fuera de rango.") from exc
            if not datetime(2000, 1, 1, tzinfo=timezone.utc) <= parsed_time <= datetime.now(timezone.utc) + timedelta(days=1):
                raise InvalidSyncPayload(f"Evento {index}: fecha fuera de rango.")

            events.append(SyncEvent(
                event_id=event_id,
                user_uid=uid,
                note=note,
                answer=answer,
                inference_source=source,  # type: ignore[arg-type]  # narrowed by explicit validation
                is_complex=complex_flag,
                occurred_at=parsed_time,
            ))

        self._repository.insert_batch(events)
        return {"accepted": len(events), "ids": [event.event_id for event in events]}

    def _validated_text(self, value: Any, index: int, key: str) -> str:
        if not isinstance(value, str) or not value.strip() or len(value) > self.MAX_TEXT:
            raise InvalidSyncPayload(f"Evento {index}: {key} debe tener entre 1 y {self.MAX_TEXT} caracteres.")
        return value

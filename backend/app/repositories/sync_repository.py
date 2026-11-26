"""Data-access layer. Transactions and parametrized SQL; no business rules here."""
from __future__ import annotations

import logging
from typing import Callable

import mysql.connector
from mysql.connector.abstracts import MySQLConnectionAbstract

from app.models.sync_event import SyncEvent

logger = logging.getLogger(__name__)


class PersistenceError(RuntimeError):
    """Database write failed; caller should retry later with the same event IDs."""


class EventConflict(RuntimeError):
    """An immutable event ID was replayed with different content."""


class SyncRepository:
    def __init__(self, connection_factory: Callable[[], MySQLConnectionAbstract]) -> None:
        self._connection_factory = connection_factory

    def insert_batch(self, events: list[SyncEvent]) -> None:
        if not events:
            return
        connection: MySQLConnectionAbstract | None = None
        try:
            connection = self._connection_factory()
            with connection.cursor() as cursor:
                # An ACK is valid only for the same immutable event and the same owner.
                ordered = sorted(events, key=lambda e: e.event_id)
                rows = [(e.user_uid, e.event_id, e.note, e.answer, e.inference_source, e.is_complex,
                         e.occurred_at.replace(tzinfo=None)) for e in ordered]
                cursor.executemany("""
                    INSERT INTO sync_events (user_uid, event_id, note_text, answer_text, inference_source,
                                              is_complex, occurred_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE event_id=event_id
                """, rows)
                ids = ", ".join(["%s"] * len(ordered))
                cursor.execute(f"""SELECT user_uid, event_id, note_text, answer_text, inference_source,
                                          is_complex, occurred_at FROM sync_events
                                   WHERE user_uid=CAST(%s AS BINARY) AND event_id IN ({ids}) ORDER BY event_id FOR UPDATE""",
                               (ordered[0].user_uid, *(e.event_id for e in ordered)))
                if cursor.fetchall() != rows:
                    raise EventConflict()
            connection.commit()
        except EventConflict:
            if connection is not None:
                connection.rollback()
            raise
        except mysql.connector.Error as exc:
            if connection is not None:
                try:
                    connection.rollback()
                except mysql.connector.Error:
                    logger.exception("DB rollback failed")
            logger.error("Database write failed; %d events retained on client", len(events))
            raise PersistenceError("No se pudo guardar el historial.") from exc
        finally:
            if connection is not None:
                connection.close()  # Returns pooled connections to the pool.

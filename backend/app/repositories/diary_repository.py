"""Tenant-scoped MySQL persistence for the academic journal."""
from __future__ import annotations

from contextlib import contextmanager
from hashlib import sha256
import json
from typing import Callable

import mysql.connector
from mysql.connector.abstracts import MySQLConnectionAbstract

from app.models.academic_diary import AcademicSession, LearningMemoryItem, LinguisticCorrection, ReviewResult


class DiaryPersistenceError(RuntimeError):
    """Storage is temporarily unavailable."""


class DiaryConflict(RuntimeError):
    """A revision or a reference cannot be applied within this student's journal."""


class DiaryRepository:
    def __init__(self, connection_factory: Callable[[], MySQLConnectionAbstract]) -> None:
        self._connection_factory = connection_factory

    @contextmanager
    def _transaction(self):
        connection = None
        try:
            connection = self._connection_factory()
            with connection.cursor(dictionary=True) as cursor:
                yield cursor
            connection.commit()
        except (mysql.connector.Error, DiaryConflict) as exc:
            if connection:
                connection.rollback()
            if isinstance(exc, DiaryConflict):
                raise
            raise DiaryPersistenceError("Almacenamiento de diario no disponible.") from exc
        finally:
            if connection:
                connection.close()

    def sync_batch(self, sessions: list[AcademicSession], memory_items: list[LearningMemoryItem],
                   results: list[ReviewResult], base_hashes: dict) -> dict:
        hashes = {"sessions": {}, "memory_items": {}}
        # One commit also covers the parent rows used by memory and review results.
        with self._transaction() as cursor:
            for session in sorted(sessions, key=lambda row: row.id):
                hashes["sessions"][session.id] = self._save_session(cursor, session, base_hashes.get("sessions", {}))
            for item in sorted(memory_items, key=lambda row: row.id):
                self._require_owned_row(cursor, "academic_sessions", item.user_uid, item.session_id)
                fields = {
                    "session_id": item.session_id, "course_name": item.course_name, "topic": item.topic,
                    "concept_text": item.concept_text, "status": item.status,
                    "explanation_text": item.explanation_text, "explanation_source": item.explanation_source,
                    "repetitions": item.repetitions, "streak": item.streak, "interval_days": item.interval_days,
                    "ease_factor": item.ease_factor, "next_review_date": item.next_review_date,
                    "last_reviewed_date": item.last_reviewed_date,
                }
                _, digest = self._save_revision(cursor, "learning_memory_items", item, fields, None,
                                                base_hashes.get("memory_items", {}))
                hashes["memory_items"][item.id] = digest
            for result in sorted(results, key=lambda row: row.id):
                self._require_owned_row(cursor, "learning_memory_items", result.user_uid, result.concept_id)
                fields = {"concept_id": result.concept_id, "exercise_id": result.exercise_id,
                          "score": result.score, "is_correct": result.is_correct, "review_date": result.review_date}
                self._insert_once(cursor, "learning_review_results", result.user_uid, result.id, fields)
                cursor.execute("""SELECT concept_id, exercise_id, score, is_correct, review_date
                                  FROM learning_review_results WHERE user_uid=CAST(%s AS BINARY) AND id=%s FOR UPDATE""",
                               (result.user_uid, result.id))
                if cursor.fetchone() != fields:
                    raise DiaryConflict()

        return hashes

    @staticmethod
    def _require_owned_row(cursor, table, owner, row_id):
        cursor.execute(f"SELECT id FROM {table} WHERE user_uid=CAST(%s AS BINARY) AND id=%s FOR SHARE",
                       (owner, row_id))
        if cursor.fetchone() is None:
            raise DiaryConflict()

    @staticmethod
    def _insert_once(cursor, table, owner, row_id, fields):
        # SQL identifiers come exclusively from the hard-coded mappings in this module.
        columns = ("user_uid", "id", *fields)
        placeholders = ", ".join(["%s"] * len(columns))
        cursor.execute(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) "
                       "ON DUPLICATE KEY UPDATE id=id", (owner, row_id, *fields.values()))

    def _save_revision(self, cursor, table, record, fields, children, expected):
        digest = sha256(json.dumps([fields, children], sort_keys=True, ensure_ascii=False,
                                   default=str, separators=(",", ":")).encode()).digest()
        revision = (record.version, record.updated_at.replace(tzinfo=None))
        data = {**fields, "version": revision[0], "updated_at": revision[1], "content_hash": digest}
        self._insert_once(cursor, table, record.user_uid, record.id,
                          {**data, "created_at": record.created_at.replace(tzinfo=None)})
        inserted = cursor.rowcount == 1
        cursor.execute(f"SELECT version, updated_at, content_hash FROM {table} "
                       "WHERE user_uid=CAST(%s AS BINARY) AND id=%s FOR UPDATE", (record.user_uid, record.id))
        stored = cursor.fetchone()
        if stored is None:
            raise DiaryConflict()
        previous = (stored["version"], stored["updated_at"])
        server_hash = stored["content_hash"]
        if server_hash is None:
            # A pre-hash notebook has no safe merge base. Verify its actual contents first.
            cursor.execute(f"SELECT {', '.join(fields)} FROM {table} "
                           "WHERE user_uid=CAST(%s AS BINARY) AND id=%s", (record.user_uid, record.id))
            old_fields = cursor.fetchone()
            comparable = dict(fields)
            if "session_details" in fields:
                for values in (old_fields, comparable):
                    values["session_details"] = json.loads(values["session_details"] or "{}")
                cursor.execute("""SELECT collection_type, order_index, concept_text FROM session_concepts
                                  WHERE user_uid=CAST(%s AS BINARY) AND session_id=%s
                                  ORDER BY collection_type, order_index""", (record.user_uid, record.id))
                if [tuple(row[k] for k in ("collection_type", "order_index", "concept_text"))
                    for row in cursor.fetchall()] != sorted(children):
                    raise DiaryConflict()
            if "ease_factor" in fields:
                old_fields["ease_factor"] = float(old_fields["ease_factor"])
            if old_fields != comparable or revision < previous:
                raise DiaryConflict()
            cursor.execute(f"UPDATE {table} SET content_hash=%s, version=%s, updated_at=%s "
                           "WHERE user_uid=CAST(%s AS BINARY) AND id=%s",
                           (digest, *revision, record.user_uid, record.id))
            return False, digest.hex()
        if record.id in expected and not inserted and server_hash not in (None, digest):
            if expected[record.id] != server_hash.hex():
                raise DiaryConflict()
        if revision < previous:
            raise DiaryConflict()
        if revision == previous and server_hash not in (None, digest):
            # Compatibility with legacy version-1 clients.
            # Require an exact server hash match to prevent stale overwrites.
            if record.version != 1 or expected.get(record.id) != server_hash.hex():
                raise DiaryConflict()
        if revision == previous and stored["content_hash"] == digest:
            return inserted, digest.hex()
        assignments = ", ".join(f"{column}=%s" for column in data)
        cursor.execute(f"UPDATE {table} SET {assignments} WHERE user_uid=CAST(%s AS BINARY) AND id=%s",
                       (*data.values(), record.user_uid, record.id))
        return True, digest.hex()

    def _save_session(self, cursor, session, expected):
        concepts = [(c.collection_type, c.order_index, c.concept_text) for c in session.concepts]
        fields = {
            "session_date": session.session_date, "grade": session.grade, "course_id": session.course_id,
            "course_name": session.course_name, "topic": session.topic, "notes_text": session.notes_text,
            "summary_text": session.summary_text, "summary_quechua": session.summary_quechua,
            "review_questions": session.review_questions, "review_quechua": session.review_quechua,
            "session_details": session.session_details,
        }
        changed, digest = self._save_revision(cursor, "academic_sessions", session, fields, concepts, expected)
        if not changed:
            return digest
        cursor.execute("DELETE FROM session_concepts WHERE user_uid=CAST(%s AS BINARY) AND session_id=%s",
                       (session.user_uid, session.id))
        if session.concepts:
            cursor.executemany("""INSERT INTO session_concepts
                (id,session_id,user_uid,collection_type,concept_text,order_index,created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s)""", [
                    (c.id, c.session_id, c.user_uid, c.collection_type, c.concept_text, c.order_index,
                     c.created_at.replace(tzinfo=None)) for c in session.concepts
                ])

        return digest

    def save_linguistic_correction(self, correction: LinguisticCorrection) -> None:
        fields = {"term_spanish": correction.term_spanish, "translated_quechua": correction.translated_quechua,
                  "suggested_chanka": correction.suggested_chanka, "community_context": correction.community_context}
        with self._transaction() as cursor:
            self._insert_once(cursor, "linguistic_corrections", correction.user_uid, correction.id, fields)
            # ascii_bin keys can collide on trailing spaces in pre-existing UIDs.
            self._require_owned_row(cursor, "linguistic_corrections", correction.user_uid, correction.id)
            cursor.execute("""UPDATE linguistic_corrections SET suggested_chanka=%s, community_context=%s
                              WHERE user_uid=CAST(%s AS BINARY) AND id=%s AND status='PROPOSED'""",
                           (correction.suggested_chanka, correction.community_context,
                            correction.user_uid, correction.id))

    def get_user_sessions(self, user_uid: str, limit: int = 50) -> list[dict]:
        with self._transaction() as cursor:
            cursor.execute("""SELECT id, session_date, grade, course_id, course_name, topic, notes_text,
                         summary_text, summary_quechua, review_questions, review_quechua, version,
                         sync_status, created_at, updated_at, session_details
                         FROM academic_sessions WHERE user_uid=CAST(%s AS BINARY)
                         ORDER BY session_date DESC, updated_at DESC, id LIMIT %s""", (user_uid, limit))
            sessions = cursor.fetchall()
            by_id = {s["id"]: s for s in sessions}
            for session in sessions:
                details = session.pop("session_details")
                if details:
                    session.update(json.loads(details))
                session.update(doubts=[], eureka=[])
            if sessions:
                ids = ", ".join(["%s"] * len(sessions))
                cursor.execute(f"SELECT session_id, collection_type, concept_text FROM session_concepts "
                               f"WHERE user_uid=CAST(%s AS BINARY) AND session_id IN ({ids}) ORDER BY order_index",
                               (user_uid, *by_id))
                for concept in cursor.fetchall():
                    key = "doubts" if concept["collection_type"] == "DOUBT" else "eureka"
                    by_id[concept["session_id"]][key].append(concept["concept_text"])
            return sessions

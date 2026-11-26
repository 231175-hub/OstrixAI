"""Real, disposable MySQL integration. Never connects to the configured school database."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

MYSQL_FIXTURE = os.environ.get("OSTRIX_TEST_MYSQL")
DB = Path(__file__).resolve().parents[1] / "database"


@unittest.skipUnless(MYSQL_FIXTURE in {"1", "schema"}, "set OSTRIX_TEST_MYSQL=schema for isolated MySQL")
class MySQLIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import mysql.connector
        from app.repositories.diary_repository import DiaryRepository
        from app.services.diary_service import DiaryService
        from app.repositories.sync_repository import SyncRepository
        from app.services.sync_service import SyncService
        cls.tmp = tempfile.TemporaryDirectory(prefix="ostrix-mysql-")
        cls.addClassCleanup(cls.tmp.cleanup)
        directory = Path(cls.tmp.name)
        data = directory / "data"
        daemon = shutil.which("mysqld")
        if not daemon:
            raise RuntimeError("mysqld is required in PATH")
        base = [daemon, "--no-defaults", f"--datadir={data}"]
        if os.name == "nt":
            base.append("--no-monitor")
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            base.append("--user=root")
        subprocess.run([*base, "--initialize-insecure"], check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE, timeout=90)
        password = secrets.token_hex(32)
        init = directory / "initialize.sql"
        init.write_text(f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{password}';\n", encoding="ascii")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        proc = subprocess.Popen([*base, "--bind-address=127.0.0.1", f"--port={port}", "--mysqlx=OFF",
                                 f"--init-file={init}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        def stop():
            if proc.poll() is None:
                proc.terminate()
                proc.wait(30)
        cls.addClassCleanup(stop)
        cls.options = dict(host="127.0.0.1", port=port, user="root", password=password, use_pure=True)
        for _ in range(150):
            if proc.poll() is not None:
                raise RuntimeError("Isolated MySQL service exited before accepting connections")
            try:
                connection = mysql.connector.connect(**cls.options, connection_timeout=1)
                break
            except mysql.connector.Error as exc:
                last_errno = exc.errno
                time.sleep(.2)
        else:
            raise RuntimeError(f"Isolated MySQL startup timed out (MySQL errno {last_errno})")
        init.unlink()
        with connection, connection.cursor() as cursor:
            scripts = [DB / "schema.sql"] if MYSQL_FIXTURE == "schema" else sorted((DB / "migrations").glob("*.sql"))
            for script in scripts:
                cursor.execute(script.read_text(encoding="utf-8-sig"))
                while cursor.nextset():
                    pass
            connection.commit()
        cls.connect = staticmethod(lambda: mysql.connector.connect(**cls.options, database="ostrixai"))
        cls.diary = DiaryService(DiaryRepository(cls.connect))
        cls.events = SyncService(SyncRepository(cls.connect))

    def setUp(self):
        self.a, self.b = "a-" + str(uuid4()), "b-" + str(uuid4())
        self.sid, self.mid = str(uuid4()), str(uuid4())
        self.session = {"id":self.sid, "course":"Ciencias", "topic":"Luz", "date":"2026-11-15", "notes":"fixture A",
                        "doubts":["Duda A"], "eureka":["Idea A"], "topics":[{"name":"Tomate", "notes":["Luz"]}],
                        "updatedAt":"2026-11-16T15:00:00Z"}
        self.memory = {"id":self.mid, "sessionId":self.sid, "course":"Ciencias", "topic":"Luz", "conceptText":"Duda A",
                       "nextReviewDate":"2026-11-17", "updatedAt":"2026-11-16T15:00:00Z"}
        self.result = {"id":str(uuid4()), "conceptId":self.mid, "exerciseId":"ej1", "score":4,
                       "isCorrect":True, "date":"2026-11-16"}
        self.payload = {"sessions":[self.session], "memory_items":[self.memory], "review_results":[self.result]}

    def count(self, table, uid):
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE user_uid=%s", (uid,))
            return cursor.fetchone()[0]

    def test_http_sessions_follow_the_verified_identity_through_mysql(self):
        from flask import Flask
        from app.controllers.diary_controller import diary_bp

        app = Flask(__name__)
        app.register_blueprint(diary_bp)
        app.extensions["ostrix_diary_service"] = self.diary
        client = app.test_client()
        owners = {"fixture-a": self.a, "fixture-b": self.b}
        students = (("fixture-a", self.b, "Cuaderno A"), ("fixture-b", self.a, "Cuaderno B"))

        def verified_claims(credential, *, check_revoked):
            self.assertTrue(check_revoked)
            return {"uid": owners[credential], "email_verified": True, "firebase": {"sign_in_provider": "google.com"}}

        def headers(credential):
            return {"Authorization": f"Bearer {credential}", "X-Firebase-AppCheck": "fixture-app"}

        with patch("app.controllers.sync_controller.auth.verify_id_token", side_effect=verified_claims), \
             patch("app.controllers.sync_controller.app_check.verify_token", return_value={"app_id": "fixture"}) as app_check:
            for credential, other, marker in students:
                session = {**self.session, "user_uid": other, "notes": marker, "doubts": [marker]}
                response = client.post("/api/v1/diary/sync", headers=headers(credential),
                                       json={"user_uid": other, "sessions": [session]})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()["session_ids"], [self.sid])

            with self.connect() as connection, connection.cursor() as cursor:
                cursor.execute("SELECT user_uid, notes_text FROM academic_sessions WHERE id=%s", (self.sid,))
                self.assertEqual(dict(cursor.fetchall()), {self.a: "Cuaderno A", self.b: "Cuaderno B"})

            for credential, other, marker in students:
                response = client.get("/api/v1/diary/sessions", headers=headers(credential),
                                      query_string={"user_uid": other})
                self.assertEqual(response.status_code, 200)
                row, = response.get_json()["sessions"]
                self.assertEqual((row["id"], row["notes_text"], row["doubts"]), (self.sid, marker, [marker]))
            self.assertEqual(app_check.call_count, 4)

    @unittest.skipUnless(os.environ.get("OSTRIX_TEST_BROWSER_SYNC") == "1", "opt-in Chrome/Angular integration")
    def test_offline_browser_recovers_against_flask_and_mysql(self):
        from flask import Flask, request
        from werkzeug.serving import make_server
        from app.controllers.diary_controller import diary_bp

        app = Flask(__name__)
        app.register_blueprint(diary_bp)
        app.extensions["ostrix_diary_service"] = self.diary
        owner = "mysql-fixture-google-a"
        commits = []
        statuses = []

        @app.after_request
        def verify_storage(response):
            # Only this loopback, disposable harness supplies synthetic Firebase verification.
            origin = request.headers.get("Origin", "")
            if origin.startswith(("http://localhost:", "http://127.0.0.1:")):
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Firebase-AppCheck"
                response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
            if request.method == "POST":
                statuses.append(response.status_code)
            if request.method == "POST" and response.status_code == 200:
                row, = request.get_json()["sessions"]
                digest = response.get_json()["hashes"]["sessions"][row["id"]]
                with self.connect() as connection, connection.cursor() as cursor:
                    cursor.execute("""SELECT notes_text, updated_at, LOWER(HEX(content_hash)) FROM academic_sessions
                                      WHERE user_uid=CAST(%s AS BINARY) AND id=%s""", (owner, row["id"]))
                    stored = cursor.fetchone()
                timestamp = datetime.fromisoformat(row["updatedAt"].replace("Z", "+00:00")).replace(tzinfo=None)
                if stored != (row["notes"], timestamp, digest):
                    response.status_code = 500
                commits.append((row["id"], digest))
            return response

        def verify_app(token):
            if token != "synthetic-app":
                raise ValueError("Synthetic attestation rejected")
            return {"app_id": "fixture"}

        def verify_user(token, *, check_revoked):
            if token != "synthetic-id" or not check_revoked:
                raise ValueError("Synthetic identity rejected")
            return {"uid": owner, "email_verified": True, "firebase": {"sign_in_provider": "google.com"}}

        with patch("app.controllers.sync_controller.auth.verify_id_token", side_effect=verify_user), \
             patch("app.controllers.sync_controller.app_check.verify_token", side_effect=verify_app):
            server = make_server("127.0.0.1", 0, app)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                web = DB.parents[1] / "frontend" / "ostrixai-web"
                subprocess.run(["node", "node_modules/@angular/cli/bin/ng.js", "test", "--watch=false",
                                "--browsers=ChromeHeadless", "--include=src/app/core/sync-mysql.spec.ts",
                                f"--define=OSTRIX_FIXTURE_PORT={server.server_port}"], cwd=web, check=True, timeout=180)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()
        self.assertEqual(statuses, [200, 401, 200, 200, 200])
        self.assertEqual(len({row_id for row_id, _ in commits}), 1)
        self.assertEqual(len({digest for _, digest in commits}), 3)
        self.assertEqual(commits[1], commits[2])
        self.assertEqual(self.count("academic_sessions", owner), 1)

    def test_replay_concurrent_edits_and_tenant_scoped_ids(self):
        self.b = self.a.upper()  # Distinct Firebase UIDs can differ only in case.
        self.diary.sync_full_diary(self.a, self.payload)
        with ThreadPoolExecutor(max_workers=3) as workers:
            list(workers.map(lambda _: self.diary.sync_full_diary(self.a, self.payload), range(3)))
        self.assertEqual([self.count(t,self.a) for t in ("academic_sessions","session_concepts",
                          "learning_memory_items","learning_review_results")], [1,2,1,1])
        other = deepcopy(self.payload)
        other["sessions"][0].update(notes="fixture B", doubts=["Duda B"])
        other["memory_items"][0]["conceptText"] = "Duda B"
        other["review_results"][0].update(score=0, isCorrect=False)
        self.diary.sync_full_diary(self.b, other)
        first, = self.diary.get_user_sessions(self.a)
        second, = self.diary.get_user_sessions(self.b)
        self.assertEqual((first["notes_text"],first["doubts"],first["topics"]),
                         ("fixture A",["Duda A"],self.session["topics"]))
        self.assertEqual((second["notes_text"],second["doubts"]), ("fixture B",["Duda B"]))
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT user_uid,score FROM learning_review_results WHERE id=%s", (self.result["id"],))
            self.assertEqual(dict(cursor.fetchall()), {self.a:4, self.b:0})
            cursor.execute("SELECT user_uid,concept_text FROM learning_memory_items WHERE id=%s", (self.mid,))
            self.assertEqual(dict(cursor.fetchall()), {self.a:"Duda A", self.b:"Duda B"})
        edited = {**self.session, "notes":"edit A", "doubts":[], "updatedAt":"2026-11-18T01:00:00Z"}
        self.diary.sync_full_diary(self.a, {"sessions":[edited]})
        first, = self.diary.get_user_sessions(self.a)
        self.assertEqual((first["notes_text"], first["doubts"]), ("edit A", []))
        self.assertEqual(self.diary.get_user_sessions(self.b), [second])
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM students")
            self.assertEqual(cursor.fetchone()[0], 0)

    def test_http_retry_after_lost_ack_commits_one_copy_and_returns_the_saved_edit(self):
        from flask import Flask
        from app.controllers.diary_controller import diary_bp
        from app.controllers.sync_controller import sync_bp

        app = Flask(__name__)
        app.register_blueprint(diary_bp)
        app.register_blueprint(sync_bp)
        app.extensions.update(ostrix_diary_service=self.diary, ostrix_sync_service=self.events)
        client = app.test_client()
        event = {"id": str(uuid4()), "note": "Pregunta de prueba", "answer": "Respuesta",
                 "inference_source": "OFFLINE_ESSENTIAL", "is_complex": False,
                 "occurred_at": datetime.now(timezone.utc).isoformat()}
        headers = {"Authorization": "Bearer synthetic-session", "X-Firebase-AppCheck": "synthetic-app"}
        self.session["grade"] = 4
        claims = {"uid": self.a, "firebase": {"sign_in_provider": "google.com"}, "email_verified": True}
        with patch("app.controllers.sync_controller.app_check.verify_token", return_value={"app_id": "fixture"}), \
             patch("app.controllers.sync_controller.auth.verify_id_token", return_value=claims):
            # Repeat the original payload before using any acknowledgement, as after a lost response.
            for path, body in (("/api/v1/sync", {"events": [event]}), ("/api/v1/diary/sync", self.payload)):
                self.assertEqual(client.post(path, headers=headers, json=body).status_code, 200)
                retry = client.post(path, headers=headers, json=body)
                self.assertEqual(retry.status_code, 200)
            for table in ("sync_events", "academic_sessions", "learning_memory_items", "learning_review_results"):
                self.assertEqual(self.count(table, self.a), 1)
            self.assertEqual(self.count("session_concepts", self.a), 2)
            self.assertEqual(retry.get_json()["accepted_results"], 1)
            base = retry.get_json()["hashes"]["sessions"][self.sid]
            edited = {**self.session, "notes": "Apunte offline confirmado", "updatedAt": "2026-11-18T01:00:00Z"}
            update = client.post("/api/v1/diary/sync", headers=headers,
                                 json={"sessions": [edited], "base_hashes": {"sessions": {self.sid: base}}})
            self.assertEqual(update.status_code, 200)
            self.assertNotEqual(update.get_json()["hashes"]["sessions"][self.sid], base)
            response = client.get("/api/v1/diary/sessions", headers=headers)
            self.assertEqual(response.status_code, 200)
            row, = response.get_json()["sessions"]
            self.assertEqual((row["id"], row["notes_text"], row["grade"]), (self.sid, edited["notes"], 4))

    def test_legacy_space_suffix_is_a_separate_owner(self):
        from app.repositories.diary_repository import DiaryConflict
        from app.repositories.sync_repository import EventConflict

        # Simulate records persisted before the HTTP identity guard. The installed
        # ascii_bin primary keys use PAD SPACE. Authorization must use exact bytes.
        legacy_uid = self.a + " "
        event = {"id":str(uuid4()), "note":"private note", "answer":"private answer",
                 "inference_source":"OFFLINE_ESSENTIAL", "is_complex":False,
                 "occurred_at":datetime.now(timezone.utc).isoformat()}
        correction = {"id":str(uuid4()), "term_spanish":"Luz", "translated_quechua":"fixture",
                      "suggested_chanka":"first suggestion"}
        self.diary.sync_full_diary(legacy_uid, self.payload)
        self.events.sync(legacy_uid, {"events":[event]})
        self.diary.submit_linguistic_correction(legacy_uid, correction)

        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute("""SELECT col.COLLATION_NAME, coll.PAD_ATTRIBUTE
                              FROM information_schema.COLUMNS col JOIN information_schema.COLLATIONS coll
                                ON col.COLLATION_NAME = coll.COLLATION_NAME
                              WHERE col.TABLE_SCHEMA=DATABASE() AND col.TABLE_NAME='academic_sessions'
                                AND col.COLUMN_NAME='user_uid'""")
            self.assertEqual(cursor.fetchone(), ("ascii_bin", "PAD SPACE"))
        self.assertEqual(self.diary.get_user_sessions(self.a), [])
        for batch in ({"sessions":[self.session]}, {"memory_items":[self.memory]}, {"review_results":[self.result]}):
            with self.subTest(entity=next(iter(batch))), self.assertRaises(DiaryConflict):
                self.diary.sync_full_diary(self.a, batch)
        with self.assertRaises(EventConflict):
            self.events.sync(self.a, {"events":[event]})
        with self.assertRaises(DiaryConflict):
            self.diary.submit_linguistic_correction(self.a, {**correction, "suggested_chanka":"second suggestion"})
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT user_uid, suggested_chanka FROM linguistic_corrections WHERE id=%s", (correction["id"],))
            self.assertEqual(cursor.fetchall(), [(legacy_uid, "first suggestion")])
        self.assertEqual(self.diary.get_user_sessions(legacy_uid)[0]["notes_text"], "fixture A")

    def test_concept_read_and_replacement_keep_exact_owner(self):
        self.diary.sync_full_diary(self.a, {"sessions":[self.session]})
        other_id = str(uuid4())
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute("""INSERT INTO session_concepts
                (id, session_id, user_uid, collection_type, concept_text, created_at)
                VALUES (%s, %s, %s, 'DOUBT', %s, NOW())""",
                           (other_id, self.sid, self.a + " ", "legacy concept"))
            connection.commit()
        self.assertEqual(self.diary.get_user_sessions(self.a)[0]["doubts"], ["Duda A"])
        self.diary.sync_full_diary(self.a, {"sessions":[
            {**self.session, "doubts":["edited"], "updatedAt":"2026-11-18T01:00:00Z"}
        ]})
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT user_uid, concept_text FROM session_concepts WHERE id=%s", (other_id,))
            self.assertEqual(cursor.fetchall(), [(self.a + " ", "legacy concept")])

    def test_stale_divergent_or_missing_parent_roll_back_the_batch(self):
        from app.repositories.diary_repository import DiaryConflict
        self.diary.sync_full_diary(self.a, self.payload)
        for changes in ({"notes":"conflicting"}, {"notes":"outdated","updatedAt":"2026-11-15T01:00:00Z"}):
            with self.assertRaises(DiaryConflict):
                self.diary.sync_full_diary(self.a, {"sessions":[{**self.session,**changes}]})
        # A missing parent in the authenticated student's journal must roll back the new session too.
        new_session = {**self.session, "id":str(uuid4())}
        with self.assertRaises(DiaryConflict):
            self.diary.sync_full_diary(self.b, {"sessions":[new_session],"memory_items":[self.memory]})
        self.assertEqual(self.count("academic_sessions",self.b), 0)
        with self.assertRaises(DiaryConflict):
            self.diary.sync_full_diary(self.b, {"review_results":[self.result]})
        with self.assertRaises(DiaryConflict):
            self.diary.sync_full_diary(self.a, {"review_results":[{**self.result,"score":1}]})
        self.diary.sync_full_diary(self.a, {"sessions":[{**self.session,"notes":"corrected", "doubts":[],
                                    "updatedAt":"2026-11-17T15:00:00Z"}]})
        row, = self.diary.get_user_sessions(self.a)
        self.assertEqual((row["notes_text"],row["doubts"],row["eureka"]), ("corrected",[],["Idea A"]))
        from flask import Flask
        from app.controllers.diary_controller import diary_bp
        app = Flask(__name__)
        app.register_blueprint(diary_bp)
        app.extensions["ostrix_diary_service"] = self.diary
        with patch("app.controllers.diary_controller._authenticated_uid", return_value=self.a):
            response = app.test_client().post("/api/v1/diary/sync", json=self.payload)
            self.assertEqual(response.status_code, 409)

    def test_two_devices_with_different_clocks_require_the_last_acknowledged_hash(self):
        from app.repositories.diary_repository import DiaryConflict
        first = self.diary.sync_full_diary(self.a, self.payload)
        base = first["hashes"]["sessions"][self.sid]
        changed = {**self.session, "notes":"from first device", "updatedAt":"2026-11-18T01:00:00Z"}
        payload = {"sessions":[changed], "base_hashes":{"sessions":{self.sid:base}}}
        ack = self.diary.sync_full_diary(self.a, payload)
        self.assertNotEqual(base, ack["hashes"]["sessions"][self.sid])
        self.assertEqual(ack, self.diary.sync_full_diary(self.a, payload))
        other = {**changed,"notes":"from second device","updatedAt":"2026-11-19T01:00:00Z"}
        with self.assertRaises(DiaryConflict):
            self.diary.sync_full_diary(self.a, {**payload, "sessions":[other]})
        self.assertEqual(self.diary.get_user_sessions(self.a)[0]["notes_text"], "from first device")

    def test_pre_hash_rows_only_adopt_a_matching_owned_revision(self):
        from app.repositories.diary_repository import DiaryConflict
        first = self.diary.sync_full_diary(self.a, self.payload)
        with self.connect() as connection, connection.cursor() as cursor:
            for table in ("academic_sessions", "learning_memory_items"):
                cursor.execute(f"UPDATE {table} SET content_hash=NULL WHERE user_uid=%s", (self.a,))
            connection.commit()
        for changes in ({"notes": "divergent"}, {"doubts": ["other child"]}):
            with self.assertRaises(DiaryConflict):
                self.diary.sync_full_diary(self.a, {"sessions": [
                    {**self.session, **changes, "updatedAt": "2026-11-19T01:00:00Z"}]})
        with self.assertRaises(DiaryConflict):
            self.diary.sync_full_diary(self.a, {"memory_items": [{**self.memory, "topic": "other"}]})
        self.assertEqual(self.diary.sync_full_diary(self.a, self.payload)["hashes"], first["hashes"])

    def test_event_origin_idempotency_and_corrections(self):
        event_id = str(uuid4())
        event = {"id":event_id, "note":"fixture","answer":"curricular", "inference_source":"OFFLINE_ESSENTIAL",
                 "is_complex":False, "occurred_at":datetime.now(timezone.utc).isoformat()}
        correction = {"id":str(uuid4()), "term_spanish":"Luz", "translated_quechua":"fixture", "suggested_chanka":"A"}
        for uid, label in ((self.a,"A"), (self.a,"A"), (self.b,"B")):
            self.events.sync(uid, {"events":[{**event,"answer":label}]})
            self.diary.submit_linguistic_correction(uid, {**correction,"suggested_chanka":label})
        from app.repositories.sync_repository import EventConflict
        with self.assertRaises(EventConflict):
            self.events.sync(self.a, {"events":[{**event,"id":str(uuid4())},{**event,"answer":"divergent"}]})
        self.assertEqual(self.count("sync_events",self.a),1)
        with self.connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT user_uid,answer_text,inference_source FROM sync_events WHERE event_id=%s", (event_id,))
            self.assertEqual(set(cursor.fetchall()),{(self.a,"A","OFFLINE_ESSENTIAL"),(self.b,"B","OFFLINE_ESSENTIAL")})
            cursor.execute("SELECT user_uid,suggested_chanka FROM linguistic_corrections WHERE id=%s", (correction["id"],))
            self.assertEqual(dict(cursor.fetchall()), {self.a:"A", self.b:"B"})

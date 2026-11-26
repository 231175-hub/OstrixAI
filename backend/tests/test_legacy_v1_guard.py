"""Regression: legacy v1 updates must preserve compare-and-swap protection."""
from test_mysql_integration import MySQLIntegration
from app.repositories.diary_repository import DiaryConflict


class LegacyV1Guard(MySQLIntegration):

    def test_legacy_v1_cas(self):
        original = self.diary.sync_full_diary(
            self.a, {"sessions": [self.session]}
        )
        base = original["hashes"]["sessions"][self.sid]

        edited = {
            **self.session,
            "notes": "Edicion legitima version 1"
        }
        request = {
            "sessions": [edited],
            "base_hashes": {"sessions": {self.sid: base}}
        }

        accepted = self.diary.sync_full_diary(self.a, request)
        new_hash = accepted["hashes"]["sessions"][self.sid]

        self.assertNotEqual(base, new_hash)

        stale = {
            **self.session,
            "notes": "Edicion desactualizada"
        }

        with self.assertRaises(DiaryConflict):
            self.diary.sync_full_diary(
                self.a,
                {
                    "sessions": [stale],
                    "base_hashes": {"sessions": {self.sid: base}}
                }
            )

        repeated = self.diary.sync_full_diary(self.a, request)
        self.assertEqual(
            repeated["hashes"]["sessions"][self.sid], new_hash
        )

        saved = self.diary.get_user_sessions(self.a)
        self.assertEqual(len(saved), 1)
        self.assertEqual(
            saved[0]["notes_text"],
            "Edicion legitima version 1"
        )

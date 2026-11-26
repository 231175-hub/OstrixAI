"""Run: cd backend && python -m unittest discover -s tests -v"""
from datetime import datetime, timezone
from unittest import TestCase
from uuid import uuid4

from app.services.sync_service import InvalidSyncPayload, SyncService


class FakeRepository:
    def __init__(self):
        self.inserted = []
    def insert_batch(self, events):
        self.inserted.extend(events)


def event():
    return {
        'id': str(uuid4()),
        'note': 'Apuntes de algebra',
        'answer': 'Resumen correcto',
        'inference_source': 'ON_DEVICE',
        'is_complex': False,
        'occurred_at': datetime.now(timezone.utc).isoformat(),
    }


class SyncServiceTests(TestCase):
    def setUp(self):
        self.repo = FakeRepository()
        self.service = SyncService(self.repo)

    def test_accepts_and_uses_server_verified_uid(self):
        raw = event()
        result = self.service.sync('firebase-user-123', {'events': [raw]})
        self.assertEqual(result, {'accepted': 1, 'ids': [raw['id']]})
        self.assertEqual(self.repo.inserted[0].user_uid, 'firebase-user-123')

    def test_rejects_duplicate_batch_ids_without_writing(self):
        row = event()
        with self.assertRaises(InvalidSyncPayload):
            self.service.sync('u1', {'events': [row, row]})
        self.assertFalse(self.repo.inserted)

    def test_rejects_invalid_source(self):
        row = event()
        row['inference_source'] = 'CLOUD_FAKE'
        with self.assertRaises(InvalidSyncPayload):
            self.service.sync('u1', {'events': [row]})
        self.assertFalse(self.repo.inserted)

    def test_rejects_spoofed_user_id(self):
        row = event()
        row['user_uid'] = 'other-student'
        with self.assertRaises(InvalidSyncPayload):
            self.service.sync('u1', {'events': [row]})

    def test_rejects_large_batch(self):
        with self.assertRaises(InvalidSyncPayload):
            self.service.sync('u1', {'events': [event() for _ in range(26)]})

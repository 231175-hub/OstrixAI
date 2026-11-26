import unittest
from app.services.translation_service import InvalidTranslation, TranslationService

class FakeTranslator:
    def translate(self, text):
        return "simulada: " + text

class TranslationServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = TranslationService(FakeTranslator())

    def test_accepts_es_qu(self):
        result = self.service.translate({"cloudConsent":True, "text":"Hola", "source":"es", "target":"qu"})
        self.assertEqual(result["translated"], "simulada: Hola")
        self.assertEqual(result["quality"], "machine-unverified")

    def test_rejects_reverse_translation_for_now(self):
        with self.assertRaises(InvalidTranslation):
            self.service.translate({"cloudConsent":True, "text":"Hola", "source":"qu", "target":"es"})

    def test_rejects_empty_or_oversized(self):
        for val in ("", "a"*4001):
            with self.assertRaises(InvalidTranslation):
                self.service.translate({"cloudConsent":True, "text":val, "source":"es", "target":"qu"})

if __name__ == "__main__": unittest.main()

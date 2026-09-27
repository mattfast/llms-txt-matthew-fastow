import unittest

from app.services.api_keys import API_KEY_PREFIX, generate_api_key, hash_api_key


class ApiKeyTests(unittest.TestCase):
    def test_generated_keys_are_prefixed_and_unique(self):
        first = generate_api_key()
        second = generate_api_key()

        self.assertTrue(first.startswith(API_KEY_PREFIX))
        self.assertNotEqual(first, second)

    def test_hash_is_stable_and_does_not_store_the_key(self):
        api_key = generate_api_key()
        hashed = hash_api_key(api_key)

        self.assertEqual(hashed, hash_api_key(api_key))
        self.assertEqual(len(hashed), 64)
        self.assertNotEqual(hashed, api_key)

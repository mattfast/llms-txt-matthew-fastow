import unittest

from app.schemas.sites import SiteCreateRequest


class SiteDefaultsTests(unittest.TestCase):
    def test_new_site_defaults_to_150_pages(self):
        request = SiteCreateRequest(url="https://example.com")

        self.assertEqual(request.max_pages, 150)

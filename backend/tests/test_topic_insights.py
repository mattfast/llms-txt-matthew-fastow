from types import SimpleNamespace
import unittest

from app.services.topic_insights import extract_topics, is_salient_topic


class TopicInsightsTests(unittest.TestCase):
    def test_filters_generic_interface_and_transition_words(self):
        for term in ("than", "over", "open", "click", "with"):
            with self.subTest(term=term):
                self.assertFalse(is_salient_topic(term))

    def test_keeps_informative_terms(self):
        for term in ("analytics", "pricing", "security"):
            with self.subTest(term=term):
                self.assertTrue(is_salient_topic(term))

    def test_weights_page_titles_more_than_descriptions(self):
        pages = [
            SimpleNamespace(
                title="Analytics platform",
                description="Than over open pricing",
            ),
            SimpleNamespace(
                title="Security analytics",
                description="Advanced pricing analytics",
            ),
        ]

        topics = dict(extract_topics(pages))

        self.assertNotIn("than", topics)
        self.assertNotIn("over", topics)
        self.assertNotIn("open", topics)
        self.assertEqual(topics["analytics"], 7)
        self.assertEqual(topics["pricing"], 2)

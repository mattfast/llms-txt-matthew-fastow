import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.models.jobs import CrawlJob
from app.models.site import Site
from app.workers.tasks import crawl_site_job_failed


class CrawlJobFailureTests(unittest.TestCase):
    def test_worker_failure_marks_crawl_failed_and_clears_activity(self):
        site = SimpleNamespace(status="crawling", crawl_activity={"current_url": "https://example.com"})
        crawl_job = SimpleNamespace(status="running", error_message=None, finished_at=None)
        db = Mock()
        db.get.side_effect = [site, crawl_job]
        rq_job = SimpleNamespace(args=("site-id", "crawl-job-id"))
        timeout_error = TimeoutError("job exceeded execution timeout")

        with patch("app.workers.tasks.SessionLocal", return_value=db):
            crawl_site_job_failed(
                rq_job,
                Mock(),
                type(timeout_error),
                timeout_error,
                None,
            )

        db.get.assert_any_call(Site, "site-id")
        db.get.assert_any_call(CrawlJob, "crawl-job-id")
        self.assertEqual(site.status, "error")
        self.assertIsNone(site.crawl_activity)
        self.assertEqual(crawl_job.status, "error")
        self.assertIn("TimeoutError", crawl_job.error_message)
        self.assertIn("execution timeout", crawl_job.error_message)
        self.assertIsInstance(crawl_job.finished_at, datetime)
        db.commit.assert_called_once()
        db.close.assert_called_once()

    def test_missing_rows_close_database_without_commit(self):
        db = Mock()
        db.get.return_value = None
        rq_job = SimpleNamespace(args=("deleted-site-id", "deleted-job-id"))

        with patch("app.workers.tasks.SessionLocal", return_value=db):
            crawl_site_job_failed(rq_job, Mock(), RuntimeError, RuntimeError("failed"), None)

        db.commit.assert_not_called()
        db.close.assert_called_once()

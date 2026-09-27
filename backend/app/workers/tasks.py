"""RQ job functions. Each opens its own DB session since RQ workers run in separate processes."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.db import SessionLocal
from app.models.jobs import CrawlJob
from app.models.site import Site
from app.services.pipeline import run_crawl_job


def crawl_site_job(site_id: str, job_id: str) -> None:
    db = SessionLocal()
    try:
        site = db.get(Site, site_id)
        job = db.get(CrawlJob, job_id)
        if not site or not job:
            return
        site.status = "crawling"
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        try:
            run_crawl_job(db, site, job)
        except Exception as exc:  # noqa: BLE001 - surface any failure onto the job row
            db.rollback()
            job.status = "error"
            job.error_message = str(exc)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            site.status = "error"
            db.commit()
            raise
    finally:
        db.close()


def enqueue_rechecks() -> None:
    """Invoked on a schedule (Render Cron) to enqueue a recheck job for every ready site."""
    from app.workers.queue import get_queue

    db = SessionLocal()
    try:
        sites = db.query(Site).filter(Site.status == "ready").all()
        queue = get_queue()
        for site in sites:
            job = CrawlJob(site_id=site.id, job_type="recheck")
            db.add(job)
            db.commit()
            queue.enqueue(crawl_site_job, site.id, job.id, job_timeout=900)
    finally:
        db.close()

"""Orchestrates one crawl (initial or recheck): crawl -> Merkle diff -> regenerate llms.txt
for changed sections only -> embed -> persist. This is the single place that ties the crawler,
Merkle tree, and llms.txt generator together."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy.orm import Session

from app.models.analytics import Topic, TopicSnapshot
from app.models.company import Profile
from app.models.jobs import CrawlJob
from app.models.site import LlmsTxtVersion, Page, Site
from app.services import llms_generator
from app.services.cost_tracker import make_usage_logger
from app.services.crawler import Crawler
from app.services.email_client import send_first_crawl_congrats_email
from app.services.llm_client import embed_texts
from app.services.merkle import MerkleTree
from app.services.topic_insights import extract_topics


def run_crawl_job(
    db: Session,
    site: Site,
    job: CrawlJob,
    on_progress: Callable[[int, int, dict[str, object]], None] | None = None,
) -> None:
    on_usage = make_usage_logger(db, company_id=site.company_id, site_id=site.id, crawl_job_id=job.id)

    crawler = Crawler(
        site.root_url,
        max_pages=site.max_pages,
        allow_subdomains=site.allow_subdomains,
        include_patterns=site.include_patterns,
        exclude_patterns=site.exclude_patterns,
    )
    pages = asyncio.run(crawler.crawl(on_progress=on_progress, started_at=job.started_at))
    job.coverage = crawler.coverage
    job.pages_discovered = len(pages)
    if not pages:
        job.status = "error"
        job.error_message = "Crawl returned zero pages (site may block bots or be unreachable)."
        job.finished_at = datetime.now(timezone.utc)
        site.status = "error"
        site.crawl_activity = None
        db.commit()
        return

    new_leaf_hashes = {p.path: p.content_hash for p in pages}
    new_tree = MerkleTree(new_leaf_hashes)

    existing_pages = {p.path: p for p in db.query(Page).filter(Page.site_id == site.id).all()}
    old_tree = MerkleTree({path: p.content_hash for path, p in existing_pages.items()}) if existing_pages else None

    unchanged_recheck = job.job_type == "recheck" and old_tree is not None and old_tree.root_hash == new_tree.root_hash
    if unchanged_recheck:
        _snapshot_current_topics(db, site)
        job.status = "done"
        job.pages_crawled = len(pages)
        job.pages_changed = 0
        job.finished_at = datetime.now(timezone.utc)
        site.status = "ready"
        site.crawl_activity = None
        site.last_crawled_at = datetime.now(timezone.utc)
        db.commit()
        return

    changed_paths = old_tree.changed_leaf_paths(new_tree) if old_tree else set(new_leaf_hashes)

    _upsert_pages(db, site, pages, existing_pages, changed_paths, on_usage)
    _refresh_topics(db, site, pages)

    # Snapshot before mutating this site's own status, so "first ever" means the company had
    # zero other successfully-crawled sites prior to this job completing.
    is_companys_first_success = (
        db.query(Site).filter(Site.company_id == site.company_id, Site.status == "ready").first() is None
    )

    generated = llms_generator.generate(site.root_url, site.domain, pages, on_usage=on_usage)
    next_version = (
        db.query(LlmsTxtVersion)
        .filter(LlmsTxtVersion.site_id == site.id)
        .order_by(LlmsTxtVersion.version_number.desc())
        .first()
    )
    version_number = (next_version.version_number + 1) if next_version else 1
    db.add(
        LlmsTxtVersion(
            site_id=site.id,
            version_number=version_number,
            content=generated.content,
            full_content=generated.full_content,
            changed_paths=sorted(changed_paths),
            diff_summary=llms_generator.diff_summary(changed_paths, len(pages)),
        )
    )

    site.merkle_root_hash = new_tree.root_hash
    site.pages_discovered = len(pages)
    site.pages_crawled = len(pages)
    site.status = "ready"
    site.crawl_activity = None
    site.last_crawled_at = datetime.now(timezone.utc)

    job.status = "done"
    job.pages_crawled = len(pages)
    job.pages_changed = len(changed_paths)
    job.finished_at = datetime.now(timezone.utc)

    db.commit()

    if is_companys_first_success:
        creator = db.get(Profile, site.created_by)
        if creator:
            send_first_crawl_congrats_email(creator.email, site.domain)


def _upsert_pages(db, site, pages, existing_pages, changed_paths, on_usage) -> None:
    changed_page_objs = [p for p in pages if p.path in changed_paths]
    embeddings = embed_texts([p.text_excerpt or p.title for p in changed_page_objs], on_usage=on_usage)
    embedding_by_path = {p.path: emb for p, emb in zip(changed_page_objs, embeddings)}

    for page in pages:
        row = existing_pages.get(page.path)
        if row is None:
            row = Page(site_id=site.id, path=page.path)
            db.add(row)
        row.url = page.url
        row.title = page.title
        row.description = page.description
        row.section = page.section
        row.content_hash = page.content_hash
        row.raw_text_excerpt = page.text_excerpt
        if page.path in embedding_by_path and embedding_by_path[page.path]:
            row.embedding = embedding_by_path[page.path]

    stale_paths = set(existing_pages) - {p.path for p in pages}
    for path in stale_paths:
        db.delete(existing_pages[path])


def _refresh_topics(db: Session, site: Site, pages) -> None:
    """Cheap, LLM-free topic extraction: salient terms from page titles and descriptions.
    Powers the cross-company "topics frequently mentioned" analytics view."""
    db.query(Topic).filter(Topic.site_id == site.id).delete()
    captured_at = datetime.now(timezone.utc)
    for name, count in extract_topics(pages):
        db.add(Topic(company_id=site.company_id, site_id=site.id, name=name, mention_count=count))
        db.add(
            TopicSnapshot(
                company_id=site.company_id,
                site_id=site.id,
                name=name,
                mention_count=count,
                captured_at=captured_at,
            )
        )


def _snapshot_current_topics(db: Session, site: Site) -> None:
    captured_at = datetime.now(timezone.utc)
    for topic in db.query(Topic).filter(Topic.site_id == site.id).all():
        db.add(
            TopicSnapshot(
                company_id=site.company_id,
                site_id=site.id,
                name=topic.name,
                mention_count=topic.mention_count,
                captured_at=captured_at,
            )
        )

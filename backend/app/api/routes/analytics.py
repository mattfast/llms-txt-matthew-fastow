from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, get_current_user
from app.models.analytics import LlmUsage, Topic, TopicSnapshot
from app.models.company import Profile
from app.models.jobs import CrawlJob
from app.models.site import Page, Site
from app.services.cost_tracker import make_usage_logger
from app.services.llm_client import answer_question, embed_texts
from app.services.topic_insights import is_salient_topic

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    """Users at the company ranked by how much llms.txt content they've generated."""
    if not user.profile:
        return []
    rows = (
        db.query(Profile.id, Profile.email, Profile.display_name, func.count(Site.id).label("sites_generated"))
        .join(Site, Site.created_by == Profile.id)
        .filter(Profile.company_id == user.profile.company_id)
        .group_by(Profile.id)
        .order_by(func.count(Site.id).desc())
        .all()
    )
    return [
        {"user_id": r.id, "email": r.email, "display_name": r.display_name, "sites_generated": r.sites_generated}
        for r in rows
    ]


@router.get("/topics")
def topics(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    """High-level insight into topics frequently mentioned across the company's crawled sites."""
    if not user.profile:
        return []
    rows = (
        db.query(Topic.name, func.sum(Topic.mention_count).label("total_mentions"), func.count(func.distinct(Topic.site_id)).label("site_count"))
        .filter(Topic.company_id == user.profile.company_id)
        .filter(Topic.name.op("~")("^[a-z]{4,}$"))
        .group_by(Topic.name)
        .order_by(func.sum(Topic.mention_count).desc())
        .limit(300)
        .all()
    )
    return [
        {"topic": r.name, "mentions": int(r.total_mentions), "sites": r.site_count}
        for r in rows
        if is_salient_topic(r.name)
    ][:30]


@router.get("/site-topics")
def recent_site_topics(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    """Return extracted terms per recently crawled site, including terms outside the global top 30."""
    if not user.profile:
        return []

    sites = (
        db.query(Site)
        .filter(Site.company_id == user.profile.company_id, Site.status == "ready")
        .order_by(Site.last_crawled_at.desc())
        .limit(6)
        .all()
    )
    result = []
    for site in sites:
        rows = (
            db.query(Topic.name, Topic.mention_count)
            .filter(Topic.company_id == user.profile.company_id, Topic.site_id == site.id)
            .order_by(Topic.mention_count.desc(), Topic.name)
            .limit(25)
            .all()
        )
        result.append(
            {
                "site_id": site.id,
                "domain": site.domain,
                "last_crawled_at": site.last_crawled_at,
                "topics": [
                    {"topic": row.name, "mentions": row.mention_count}
                    for row in rows
                    if is_salient_topic(row.name)
                ],
            }
        )
    return result


@router.get("/topics/trends")
def topic_trends(
    days: int = Query(default=90, ge=7, le=365),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.profile:
        return []
    since = datetime.now(timezone.utc) - timedelta(days=days)
    topic_rows = (
        db.query(Topic.name)
        .filter(Topic.company_id == user.profile.company_id)
        .group_by(Topic.name)
        .order_by(func.sum(Topic.mention_count).desc())
        .limit(300)
        .all()
    )
    top_topics = [row.name for row in topic_rows if is_salient_topic(row.name)][:30]
    if not top_topics:
        return []
    latest_per_site_topic_day = (
        db.query(
            TopicSnapshot.site_id.label("site_id"),
            TopicSnapshot.name.label("name"),
            func.date(TopicSnapshot.captured_at).label("day"),
            func.max(TopicSnapshot.captured_at).label("captured_at"),
        )
        .filter(
            TopicSnapshot.company_id == user.profile.company_id,
            TopicSnapshot.captured_at >= since,
            TopicSnapshot.name.in_(top_topics),
        )
        .group_by(TopicSnapshot.site_id, TopicSnapshot.name, func.date(TopicSnapshot.captured_at))
        .subquery()
    )
    rows = (
        db.query(
            TopicSnapshot.name,
            latest_per_site_topic_day.c.day,
            func.sum(TopicSnapshot.mention_count).label("mentions"),
        )
        .join(
            latest_per_site_topic_day,
            (TopicSnapshot.site_id == latest_per_site_topic_day.c.site_id)
            & (TopicSnapshot.name == latest_per_site_topic_day.c.name)
            & (TopicSnapshot.captured_at == latest_per_site_topic_day.c.captured_at),
        )
        .filter(TopicSnapshot.company_id == user.profile.company_id)
        .group_by(TopicSnapshot.name, latest_per_site_topic_day.c.day)
        .order_by(latest_per_site_topic_day.c.day, TopicSnapshot.name)
        .all()
    )
    return [
        {"topic": row.name, "day": str(row.day), "mentions": int(row.mentions)}
        for row in rows
        if is_salient_topic(row.name)
    ]


@router.get("/topics/{topic_name}/pages")
def topic_pages(
    topic_name: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.profile:
        return {"topic": topic_name, "sites": []}
    topic = topic_name.strip().lower()
    if not topic or len(topic) > 128 or not is_salient_topic(topic):
        raise HTTPException(status_code=400, detail="Invalid topic")

    topic_rows = (
        db.query(Topic, Site)
        .join(Site, Topic.site_id == Site.id)
        .filter(Topic.company_id == user.profile.company_id, Topic.name == topic)
        .order_by(Topic.mention_count.desc(), Site.domain)
        .all()
    )
    sites = []
    for topic_row, site in topic_rows:
        pages = (
            db.query(Page.path, Page.url, Page.title)
            .filter(
                Page.site_id == site.id,
                or_(
                    Page.title.op("~*")(rf"\m{re.escape(topic)}\M"),
                    Page.description.op("~*")(rf"\m{re.escape(topic)}\M"),
                ),
            )
            .order_by(Page.path)
            .limit(20)
            .all()
        )
        matching_pages = [
            {"path": page.path, "url": page.url, "title": page.title}
            for page in pages
        ]
        sites.append(
            {
                "site_id": site.id,
                "domain": site.domain,
                "mentions": topic_row.mention_count,
                "pages": matching_pages,
            }
        )
    return {"topic": topic, "sites": sites}


@router.get("/report")
def download_report(
    format: str = Query(default="json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.profile:
        raise HTTPException(status_code=400, detail="User has no company profile")
    company_id = user.profile.company_id
    generated_at = datetime.now(timezone.utc)
    sites = db.query(Site).filter(Site.company_id == company_id).order_by(Site.domain).all()
    topics = (
        db.query(
            Topic.name,
            func.sum(Topic.mention_count).label("mentions"),
            func.count(func.distinct(Topic.site_id)).label("sites"),
        )
        .filter(Topic.company_id == company_id)
        .group_by(Topic.name)
        .order_by(func.sum(Topic.mention_count).desc())
        .all()
    )
    latest_jobs = {}
    for site in sites:
        latest_jobs[site.id] = (
            db.query(CrawlJob)
            .filter(CrawlJob.site_id == site.id)
            .order_by(CrawlJob.started_at.desc())
            .first()
        )
    report = {
        "generated_at": generated_at.isoformat(),
        "company": {"id": company_id},
        "sites": [
            {
                "id": site.id,
                "domain": site.domain,
                "root_url": site.root_url,
                "status": site.status,
                "pages_crawled": site.pages_crawled,
                "pages_discovered": site.pages_discovered,
                "max_pages": site.max_pages,
                "allow_subdomains": site.allow_subdomains,
                "include_patterns": site.include_patterns,
                "exclude_patterns": site.exclude_patterns,
                "last_crawled_at": site.last_crawled_at.isoformat() if site.last_crawled_at else None,
                "coverage": latest_jobs[site.id].coverage if latest_jobs[site.id] else None,
            }
            for site in sites
        ],
        "topics": [
            {"topic": row.name, "mentions": int(row.mentions), "sites": int(row.sites)}
            for row in topics
        ],
    }
    if format == "json":
        from fastapi.responses import JSONResponse

        return JSONResponse(
            report,
            headers={"Content-Disposition": 'attachment; filename="profound-site-report.json"'},
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["record_type", "generated_at", "site", "status", "pages_crawled", "pages_discovered",
         "coverage_crawled", "coverage_skipped", "coverage_failed", "topic", "mentions", "topic_sites"]
    )
    for site in report["sites"]:
        summary = ((site.get("coverage") or {}).get("summary") or {})
        writer.writerow(
            ["site", report["generated_at"], site["domain"], site["status"], site["pages_crawled"],
             site["pages_discovered"], summary.get("crawled", 0), summary.get("skipped", 0),
             summary.get("failed", 0), "", "", ""]
        )
    for topic in report["topics"]:
        writer.writerow(
            ["topic", report["generated_at"], "", "", "", "", "", "", "", topic["topic"],
             topic["mentions"], topic["sites"]]
        )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="profound-site-report.csv"'},
    )


@router.get("/cost")
def cost_tracker(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    """How much has the company spent on LLM tokens traversing/summarizing its websites?"""
    if not user.profile:
        return {"total_usd": 0, "by_day": [], "by_purpose": []}
    company_id = user.profile.company_id

    total = db.query(func.coalesce(func.sum(LlmUsage.cost_usd), 0)).filter(
        LlmUsage.company_id == company_id
    ).scalar()

    by_day = (
        db.query(func.date(LlmUsage.created_at).label("day"), func.sum(LlmUsage.cost_usd).label("cost"))
        .filter(LlmUsage.company_id == company_id)
        .group_by(func.date(LlmUsage.created_at))
        .order_by(func.date(LlmUsage.created_at))
        .all()
    )
    by_purpose = (
        db.query(LlmUsage.purpose, func.sum(LlmUsage.cost_usd).label("cost"))
        .filter(LlmUsage.company_id == company_id)
        .group_by(LlmUsage.purpose)
        .all()
    )
    return {
        "total_usd": round(float(total), 4),
        "by_day": [{"day": str(r.day), "cost_usd": round(float(r.cost), 4)} for r in by_day],
        "by_purpose": [{"purpose": r.purpose, "cost_usd": round(float(r.cost), 4)} for r in by_purpose],
    }


class SearchRequest(BaseModel):
    query: str


@router.post("/search")
def semantic_search(
    body: SearchRequest, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)
):
    """Query across all of the company's generated llms.txt content for specific topics or
    general questions, via pgvector cosine-similarity search + an LLM-synthesized answer."""
    if not user.profile:
        return {"answer": "", "matches": []}
    company_id = user.profile.company_id
    on_usage = make_usage_logger(db, company_id=company_id)

    [query_embedding] = embed_texts([body.query], on_usage=on_usage)
    if not query_embedding:
        db.commit()
        return {"answer": "Search is unavailable (no OPENAI_API_KEY configured).", "matches": []}

    matches = (
        db.query(Page, Site)
        .join(Site, Page.site_id == Site.id)
        .filter(Site.company_id == company_id, Page.embedding.isnot(None))
        .order_by(Page.embedding.cosine_distance(query_embedding))
        .limit(8)
        .all()
    )

    context_chunks = [
        f"[{site.domain}{page.path}] {page.title}: {page.raw_text_excerpt or page.description or ''}"
        for page, site in matches
    ]
    answer = answer_question(body.query, context_chunks, on_usage=on_usage)
    db.commit()

    return {
        "answer": answer,
        "matches": [
            {"domain": site.domain, "path": page.path, "title": page.title, "url": page.url}
            for page, site in matches
        ],
    }

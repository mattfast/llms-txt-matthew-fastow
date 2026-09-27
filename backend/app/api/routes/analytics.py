from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, get_current_user
from app.models.analytics import LlmUsage, Topic
from app.models.company import Profile
from app.models.site import Page, Site
from app.services.cost_tracker import make_usage_logger
from app.services.llm_client import answer_question, embed_texts

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
        .group_by(Topic.name)
        .order_by(func.sum(Topic.mention_count).desc())
        .limit(30)
        .all()
    )
    return [{"topic": r.name, "mentions": int(r.total_mentions), "sites": r.site_count} for r in rows]


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

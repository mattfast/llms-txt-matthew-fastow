import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class LlmUsage(Base):
    """Every LLM call (summarization, embedding, Q&A) is logged here so we can compute the
    company-wide cost tracker ("how much have we spent traversing websites?")."""

    __tablename__ = "llm_usage"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("companies.id"), index=True)
    site_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("sites.id"), nullable=True)
    crawl_job_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("crawl_jobs.id"), nullable=True
    )

    purpose: Mapped[str] = mapped_column(String(32))  # "summarize" | "embed" | "qa" | "quote"
    model: Mapped[str] = mapped_column(String(64))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Topic(Base):
    """Aggregated topic mentions per site, used for the cross-company "topic insights" view."""

    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("companies.id"), index=True)
    site_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("sites.id"), index=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    mention_count: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

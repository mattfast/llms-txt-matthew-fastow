import uuid
from datetime import datetime, timezone
from enum import Enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SiteStatus(str, Enum):
    pending = "pending"
    crawling = "crawling"
    ready = "ready"
    error = "error"


class Site(Base):
    """A monitored website. Owns a Merkle tree (root_hash) used to cheaply detect changes
    on subsequent recrawls without re-fetching/re-diffing every page."""

    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("companies.id"), index=True)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("profiles.id"))

    root_url: Mapped[str] = mapped_column(String(2048))
    domain: Mapped[str] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(32), default=SiteStatus.pending.value)
    max_pages: Mapped[int] = mapped_column(Integer, default=100)
    allow_subdomains: Mapped[bool] = mapped_column(Boolean, default=True)
    include_patterns: Mapped[list] = mapped_column(JSON, default=list)
    exclude_patterns: Mapped[list] = mapped_column(JSON, default=list)

    merkle_root_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pages_discovered: Mapped[int] = mapped_column(Integer, default=0)
    pages_crawled: Mapped[int] = mapped_column(Integer, default=0)
    crawl_activity: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    last_crawled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    pages: Mapped[list["Page"]] = relationship(back_populates="site", cascade="all, delete-orphan")
    versions: Mapped[list["LlmsTxtVersion"]] = relationship(
        back_populates="site", cascade="all, delete-orphan", order_by="LlmsTxtVersion.version_number.desc()"
    )

    __table_args__ = (UniqueConstraint("company_id", "domain", name="uq_site_company_domain"),)


class Page(Base):
    """A single crawled page = one leaf in the site's Merkle tree."""

    __tablename__ = "pages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("sites.id"), index=True)

    url: Mapped[str] = mapped_column(String(2048))
    path: Mapped[str] = mapped_column(String(2048), index=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    section: Mapped[str | None] = mapped_column(String(128), nullable=True)  # e.g. "Docs", "Blog"

    content_hash: Mapped[str] = mapped_column(String(64))  # Merkle leaf hash
    raw_text_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)

    crawled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    site: Mapped["Site"] = relationship(back_populates="pages")

    __table_args__ = (UniqueConstraint("site_id", "path", name="uq_page_site_path"),)


class LlmsTxtVersion(Base):
    """An immutable, versioned snapshot of the generated llms.txt (git-commit style history)."""

    __tablename__ = "llms_txt_versions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("sites.id"), index=True)

    version_number: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)  # llms.txt
    full_content: Mapped[str] = mapped_column(Text)  # llms-full.txt
    changed_paths: Mapped[list] = mapped_column(JSON, default=list)  # modified or newly-added paths
    removed_paths: Mapped[list] = mapped_column(JSON, default=list)  # paths no longer discovered
    diff_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    site: Mapped["Site"] = relationship(back_populates="versions")

    __table_args__ = (UniqueConstraint("site_id", "version_number", name="uq_version_site_number"),)

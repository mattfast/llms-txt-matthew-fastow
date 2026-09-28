from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class CrawlActivityOut(BaseModel):
    started_at: datetime
    current_url: str | None
    recently_crawled: list[str]
    recently_discovered: list[str]
    coverage: dict[str, int] | None = None


class SiteCreateRequest(BaseModel):
    url: HttpUrl
    max_pages: int = Field(default=500, ge=1, le=5000)
    allow_subdomains: bool = True
    include_patterns: list[str] = Field(default_factory=list, max_length=50)
    exclude_patterns: list[str] = Field(default_factory=list, max_length=50)


class SiteSettingsUpdateRequest(BaseModel):
    max_pages: int = Field(ge=1, le=5000)
    allow_subdomains: bool
    include_patterns: list[str] = Field(max_length=50)
    exclude_patterns: list[str] = Field(max_length=50)


class SiteOut(BaseModel):
    id: str
    root_url: str
    domain: str
    status: str
    max_pages: int
    allow_subdomains: bool
    include_patterns: list[str]
    exclude_patterns: list[str]
    pages_discovered: int
    pages_crawled: int
    crawl_activity: CrawlActivityOut | None = None
    last_crawled_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CrawlJobOut(BaseModel):
    id: str
    job_type: str
    status: str
    pages_discovered: int
    pages_crawled: int
    pages_changed: int
    error_message: str | None
    coverage: dict | None = None
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class LlmsTxtVersionOut(BaseModel):
    id: str
    version_number: int
    content: str
    full_content: str
    changed_paths: list[str]
    diff_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LlmsTxtVersionSummaryOut(BaseModel):
    id: str
    version_number: int
    changed_paths: list[str]
    diff_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

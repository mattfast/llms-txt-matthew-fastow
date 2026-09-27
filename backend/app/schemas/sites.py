from datetime import datetime

from pydantic import BaseModel, HttpUrl


class SiteCreateRequest(BaseModel):
    url: HttpUrl


class SiteOut(BaseModel):
    id: str
    root_url: str
    domain: str
    status: str
    pages_discovered: int
    pages_crawled: int
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

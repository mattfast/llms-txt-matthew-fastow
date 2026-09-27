"""Turns raw token counts from LLM calls into logged, priced usage rows for the cost tracker."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.analytics import LlmUsage

settings = get_settings()


def compute_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    if "embedding" in model:
        return (prompt_tokens / 1000) * settings.price_per_1k_embedding_tokens
    return (
        (prompt_tokens / 1000) * settings.price_per_1k_prompt_tokens
        + (completion_tokens / 1000) * settings.price_per_1k_completion_tokens
    )


def make_usage_logger(
    db: Session, company_id: str, site_id: str | None = None, crawl_job_id: str | None = None
):
    """Returns an `on_usage(purpose, model, prompt_tokens, completion_tokens)` callback that
    persists an LlmUsage row per call, batched into the caller's existing DB session/commit."""

    def _log(purpose: str, model: str, prompt_tokens: int, completion_tokens: int) -> None:
        db.add(
            LlmUsage(
                company_id=company_id,
                site_id=site_id,
                crawl_job_id=crawl_job_id,
                purpose=purpose,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=compute_cost_usd(model, prompt_tokens, completion_tokens),
            )
        )

    return _log

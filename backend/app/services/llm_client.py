"""Thin OpenAI wrapper used for: (1) backfilling missing page descriptions, (2) writing a
one-paragraph site summary, (3) generating homepage quotes, and (4) answering cross-site
questions (semantic Q&A). Every call reports token usage via an optional callback so the
caller can log it for the cost tracker."""
from __future__ import annotations

import random
from collections.abc import Callable
from typing import TYPE_CHECKING

from openai import OpenAI

from app.core.config import get_settings

if TYPE_CHECKING:
    from app.services.crawler import CrawledPage

settings = get_settings()
UsageCallback = Callable[[str, str, int, int], None] | None

_client: OpenAI | None = None


def _get_client() -> OpenAI | None:
    global _client
    if not settings.openai_api_key:
        return None
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def _chat(purpose: str, system: str, user: str, on_usage: UsageCallback, max_tokens: int = 300) -> str:
    client = _get_client()
    if client is None:
        return ""
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens,
        temperature=0.4,
    )
    if on_usage and response.usage:
        on_usage(purpose, settings.openai_model, response.usage.prompt_tokens, response.usage.completion_tokens)
    return (response.choices[0].message.content or "").strip()


def summarize_site(
    domain: str,
    homepage_title: str,
    homepage_description: str,
    pages: list["CrawledPage"],
    on_usage: UsageCallback = None,
) -> tuple[str, str]:
    """Returns (title, one-paragraph summary) for the llms.txt header."""
    if homepage_title and homepage_description:
        title, summary = homepage_title, homepage_description
    else:
        title, summary = domain, ""

    sample_titles = ", ".join(p.title for p in pages[:15])
    text = _chat(
        purpose="summarize",
        system=(
            "You write a single, crisp sentence describing what a website/company does, for "
            "use as the top-level summary in an llms.txt file. No marketing fluff."
        ),
        user=f"Domain: {domain}\nHomepage title: {homepage_title}\nSample page titles: {sample_titles}",
        on_usage=on_usage,
        max_tokens=80,
    )
    if text:
        summary = text
    return title or domain, summary or f"{domain} - see linked pages for details."


def summarize_page(page: "CrawledPage", on_usage: UsageCallback = None) -> str:
    """Backfills a one-line description when a page has no meta description."""
    if page.description:
        return page.description
    text = _chat(
        purpose="summarize",
        system="Write a single concise sentence (<20 words) describing what this page is about.",
        user=f"Title: {page.title}\nContent: {page.text_excerpt[:1500]}",
        on_usage=on_usage,
        max_tokens=40,
    )
    return text or "No description available."


_FALLBACK_QUOTES = [
    "Ship it. You can refactor your self-esteem later.",
    "Every website has a story. Yours is about to get a table of contents.",
    "llms.txt: because robots.txt was getting lonely.",
    "The best crawler is the one that finishes before your coffee gets cold.",
    "Documentation nobody reads, now readable by something that never sleeps.",
]


def generate_quote(on_usage: UsageCallback = None) -> str:
    """A different funny/motivational quote each time the homepage loads."""
    text = _chat(
        purpose="quote",
        system=(
            "Generate ONE short, funny-but-motivational one-liner (max 20 words) for developers "
            "about turning websites into structured data for AI. Output only the quote, no quotes marks."
        ),
        user="Give me a new one.",
        on_usage=on_usage,
        max_tokens=40,
    )
    return text or random.choice(_FALLBACK_QUOTES)


def answer_question(question: str, context_chunks: list[str], on_usage: UsageCallback = None) -> str:
    context = "\n---\n".join(context_chunks[:12])
    return _chat(
        purpose="qa",
        system=(
            "Answer the user's question using ONLY the provided llms.txt excerpts from company "
            "sites. Cite which site/page each fact comes from. If the answer isn't in the "
            "context, say so."
        ),
        user=f"Context:\n{context}\n\nQuestion: {question}",
        on_usage=on_usage,
        max_tokens=500,
    )


def embed_texts(texts: list[str], on_usage: UsageCallback = None) -> list[list[float]]:
    client = _get_client()
    if client is None or not texts:
        return [[] for _ in texts]
    response = client.embeddings.create(model=settings.openai_embedding_model, input=texts)
    if on_usage:
        total_tokens = response.usage.total_tokens if response.usage else 0
        on_usage("embed", settings.openai_embedding_model, total_tokens, 0)
    return [item.embedding for item in response.data]

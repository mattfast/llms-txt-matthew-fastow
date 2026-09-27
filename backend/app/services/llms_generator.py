"""Generates llms.txt / llms-full.txt content per the https://llmstxt.org spec:

    # Title
    > Optional summary/blockquote
    Optional free-form context paragraphs
    ## Section Name
    - [Link title](url): optional link description
    ## Optional
    - [Link title](url): optional link description

Sections are derived from the site's URL structure (first path segment), and each page's
title/description are either taken from crawled metadata or backfilled by an LLM summary
when metadata is missing or low quality.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from app.services.crawler import CrawledPage
from app.services.llm_client import summarize_site, summarize_page

OPTIONAL_SECTION_HINTS = ("blog", "changelog", "news", "press", "legal", "careers")


@dataclass
class GeneratedLlmsTxt:
    content: str
    full_content: str
    site_title: str
    site_summary: str


def generate(
    root_url: str, domain: str, pages: list[CrawledPage], on_usage=None
) -> GeneratedLlmsTxt:
    if not pages:
        raise ValueError("Cannot generate llms.txt from zero crawled pages")

    homepage = next((p for p in pages if p.path in ("/", "")), pages[0])
    site_title, site_summary = summarize_site(
        domain, homepage.title, homepage.description, pages, on_usage=on_usage
    )

    sections: dict[str, list[CrawledPage]] = defaultdict(list)
    for page in pages:
        sections[page.section].append(page)

    ordered_sections = sorted(
        sections.items(),
        key=lambda kv: (kv[0].lower() in OPTIONAL_SECTION_HINTS, kv[0].lower()),
    )

    lines = [f"# {site_title}", "", f"> {site_summary}", ""]
    full_lines = [f"# {site_title}", "", f"> {site_summary}", ""]

    for section_name, section_pages in ordered_sections:
        heading = "Optional" if section_name.lower() in OPTIONAL_SECTION_HINTS else _titleize(section_name)
        lines.append(f"## {heading}")
        full_lines.append(f"## {heading}")
        for page in sorted(section_pages, key=lambda p: p.path):
            description = page.description or summarize_page(page, on_usage=on_usage)
            lines.append(f"- [{page.title}]({page.url}): {description}".rstrip(": "))
            full_lines.append(f"- [{page.title}]({page.url}): {description}".rstrip(": "))
            full_lines.append("")
            full_lines.append(page.text_excerpt)
            full_lines.append("")
        lines.append("")

    return GeneratedLlmsTxt(
        content="\n".join(lines).strip() + "\n",
        full_content="\n".join(full_lines).strip() + "\n",
        site_title=site_title,
        site_summary=site_summary,
    )


def _titleize(segment: str) -> str:
    return segment.replace("-", " ").replace("_", " ").strip().title() or "Pages"


def diff_summary(changed_paths: set[str], total_pages: int) -> str:
    if not changed_paths:
        return "No content changes detected since the last check."
    sample = ", ".join(sorted(changed_paths)[:5])
    more = f" and {len(changed_paths) - 5} more" if len(changed_paths) > 5 else ""
    return f"{len(changed_paths)} of {total_pages} pages changed: {sample}{more}."

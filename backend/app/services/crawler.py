"""Crawls a website: discovers URLs (sitemap.xml + robots.txt aware BFS), fetches pages, and
extracts clean metadata/content for llms.txt generation."""
from __future__ import annotations

import asyncio
import re
import urllib.robotparser as robotparser
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

import httpx
from bs4 import BeautifulSoup

from app.core.config import get_settings
from app.services.merkle import hash_content

settings = get_settings()

_SKIP_EXTENSIONS = (
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".css", ".js", ".zip", ".mp4",
    ".mp3", ".woff", ".woff2", ".ico", ".xml", ".json",
)


@dataclass
class CrawledPage:
    url: str
    path: str
    title: str
    description: str
    section: str
    content_hash: str
    text_excerpt: str


class Crawler:
    def __init__(self, root_url: str, max_pages: int | None = None):
        parsed = urlparse(root_url if "://" in root_url else f"https://{root_url}")
        self.root_url = f"{parsed.scheme}://{parsed.netloc}"
        self.domain = parsed.netloc
        self.max_pages = max_pages or settings.max_pages_per_site
        self._robots = robotparser.RobotFileParser()
        self._visited: set[str] = set()

    async def _load_robots(self, client: httpx.AsyncClient) -> None:
        try:
            resp = await client.get(urljoin(self.root_url, "/robots.txt"), timeout=5)
            if resp.status_code == 200:
                self._robots.parse(resp.text.splitlines())
            else:
                self._robots.parse([])
        except httpx.HTTPError:
            self._robots.parse([])

    def _allowed(self, url: str) -> bool:
        try:
            return self._robots.can_fetch(settings.user_agent, url)
        except Exception:
            return True

    async def _discover_from_sitemap(self, client: httpx.AsyncClient) -> list[str]:
        """Prefers sitemap.xml for URL discovery - far more reliable than link-following on
        large or JS-heavy sites, and it's what search engines/crawlers use for the same reason."""
        candidates = [urljoin(self.root_url, "/sitemap.xml"), urljoin(self.root_url, "/sitemap_index.xml")]
        urls: list[str] = []
        for sitemap_url in candidates:
            try:
                resp = await client.get(sitemap_url, timeout=10)
                if resp.status_code != 200:
                    continue
                root = ElementTree.fromstring(resp.content)
                ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
                # Sitemap index -> recurse one level into child sitemaps
                sub_sitemaps = [loc.text for loc in root.findall(".//sm:sitemap/sm:loc", ns) if loc.text]
                for sub in sub_sitemaps[:20]:
                    try:
                        sub_resp = await client.get(sub, timeout=10)
                        if sub_resp.status_code == 200:
                            sub_root = ElementTree.fromstring(sub_resp.content)
                            urls += [loc.text for loc in sub_root.findall(".//sm:url/sm:loc", ns) if loc.text]
                    except (httpx.HTTPError, ElementTree.ParseError):
                        continue
                urls += [loc.text for loc in root.findall(".//sm:url/sm:loc", ns) if loc.text]
                if urls:
                    break
            except (httpx.HTTPError, ElementTree.ParseError):
                continue
        return urls

    def _same_domain(self, url: str) -> bool:
        return urlparse(url).netloc == self.domain

    def _is_skippable(self, url: str) -> bool:
        path = urlparse(url).path.lower()
        return path.endswith(_SKIP_EXTENSIONS)

    async def crawl(self, on_progress: Callable[[int, int], None] | None = None) -> list[CrawledPage]:
        headers = {"User-Agent": settings.user_agent}
        async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
            await self._load_robots(client)
            seed_urls = await self._discover_from_sitemap(client)
            if not seed_urls:
                seed_urls = [self.root_url]

            queue = [u for u in dict.fromkeys(seed_urls) if self._same_domain(u) and not self._is_skippable(u)]
            queue = queue[: self.max_pages * 3] or [self.root_url]

            semaphore = asyncio.Semaphore(settings.crawl_concurrency)
            results: list[CrawledPage] = []

            async def fetch_one(url: str) -> CrawledPage | None:
                if url in self._visited or len(self._visited) >= self.max_pages:
                    return None
                self._visited.add(url)
                if not self._allowed(url):
                    return None
                async with semaphore:
                    try:
                        resp = await client.get(url, timeout=settings.crawl_timeout_seconds)
                    except httpx.HTTPError:
                        return None
                if resp.status_code != 200 or "text/html" not in resp.headers.get("content-type", ""):
                    return None
                return _extract_page(url, self.root_url, resp.text)

            tasks = [fetch_one(url) for url in queue[: self.max_pages]]
            total = len(tasks)
            completed = 0
            if on_progress:
                on_progress(completed, total)
            for coro in asyncio.as_completed(tasks):
                page = await coro
                completed += 1
                if page:
                    results.append(page)
                if on_progress:
                    on_progress(completed, total)

            await self._render_thin_pages_with_playwright(results)
            return results

    async def _render_thin_pages_with_playwright(self, pages: list[CrawledPage]) -> None:
        """Many modern sites are client-rendered SPAs where a plain HTTP GET returns an
        almost-empty shell. For any page whose extracted text is suspiciously short, fall back
        to a headless-browser render so we still capture real content - this is what lets the
        tool "work for a large variety of websites" rather than just static ones."""
        thin_pages = [p for p in pages if len(p.text_excerpt) < 200]
        if not thin_pages:
            return
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return

        async with async_playwright() as pw:
            browser = await pw.chromium.launch()
            try:
                context = await browser.new_context(user_agent=settings.user_agent)
                for page_meta in thin_pages[:20]:  # cap expensive renders per site
                    try:
                        browser_page = await context.new_page()
                        await browser_page.goto(page_meta.url, timeout=settings.crawl_timeout_seconds * 1000)
                        html = await browser_page.content()
                        await browser_page.close()
                    except Exception:
                        continue
                    rendered = _extract_page(page_meta.url, self.root_url, html)
                    if len(rendered.text_excerpt) > len(page_meta.text_excerpt):
                        page_meta.title, page_meta.description = rendered.title, rendered.description
                        page_meta.content_hash = rendered.content_hash
                        page_meta.text_excerpt = rendered.text_excerpt
            finally:
                await browser.close()


def _extract_page(url: str, root_url: str, html: str) -> CrawledPage:
    soup = BeautifulSoup(html, "lxml")

    title = _first_text(soup.title) or _first_text(soup.find("h1")) or urlparse(url).path
    meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    description = (meta_desc.get("content", "").strip() if meta_desc else "") or _fallback_description(soup)

    for tag in soup(["script", "style", "nav", "footer", "noscript", "svg"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = re.sub(r"\s+", " ", main.get_text(" ", strip=True)) if main else ""

    parsed = urlparse(url)
    path = parsed.path or "/"
    trimmed = path.strip("/")
    first_segment = trimmed.split("/")[0] if trimmed else ""
    # A first segment containing a dot (e.g. "changes.html") is a filename, not a real
    # subdirectory - i.e. this is a flat site with no meaningful top-level grouping. Bucket
    # those under a generic section instead of turning the filename itself into a heading.
    if not first_segment:
        section = "home"
    elif "." in first_segment and "/" not in trimmed:
        section = "pages"
    else:
        section = first_segment

    return CrawledPage(
        url=url,
        path=path,
        title=title.strip()[:512],
        description=description.strip()[:1000],
        section=section or "home",
        content_hash=hash_content(f"{title}|{description}|{text}"),
        text_excerpt=text[:4000],
    )


def _first_text(tag) -> str:
    return tag.get_text(strip=True) if tag else ""


def _fallback_description(soup: BeautifulSoup) -> str:
    p = soup.find("p")
    return _first_text(p)[:300]

"""Crawls a website: discovers URLs (sitemap.xml + robots.txt aware BFS), fetches pages, and
extracts clean metadata/content for llms.txt generation."""
from __future__ import annotations

import asyncio
import logging
import re
import urllib.robotparser as robotparser
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlsplit, urlunsplit
from xml.etree import ElementTree

import httpx
import tldextract
from bs4 import BeautifulSoup

from app.core.config import get_settings
from app.services.merkle import hash_content

settings = get_settings()
logger = logging.getLogger(__name__)
_domain_extractor = tldextract.TLDExtract(
    suffix_list_urls=(),
    include_psl_private_domains=True,
)

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
        candidate = root_url if "://" in root_url else f"https://{root_url}"
        canonical = self._canonicalize_url(candidate, candidate)
        if not canonical:
            raise ValueError("Crawler requires a valid website hostname")
        parsed = urlsplit(canonical)
        self.root_url = f"{parsed.scheme}://{parsed.netloc}"
        self.root_hostname = parsed.hostname.lower().rstrip(".")
        extracted = _domain_extractor(self.root_hostname)
        self.site_domain = ".".join(part for part in (extracted.domain, extracted.suffix) if part)
        self.max_pages = max_pages if max_pages is not None else settings.max_pages_per_site
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
        return self._robots.can_fetch(settings.user_agent, url)

    async def _discover_from_sitemap(self, client: httpx.AsyncClient) -> list[str]:
        """Read robots.txt sitemap declarations and recursively traverse sitemap indexes."""
        sitemap_queue = deque(
            [
                *(self._robots.site_maps() or []),
                urljoin(self.root_url, "/sitemap.xml"),
                urljoin(self.root_url, "/sitemap_index.xml"),
                urljoin(self.root_url, "/sitemap-index.xml"),
            ]
        )
        seen_sitemaps: set[str] = set()
        urls: list[str] = []
        max_sitemaps = 100
        max_sitemap_urls = self.max_pages * 20

        while sitemap_queue and len(seen_sitemaps) < max_sitemaps and len(urls) < max_sitemap_urls:
            sitemap_url = self._canonicalize_url(sitemap_queue.popleft(), self.root_url)
            if (
                not sitemap_url
                or sitemap_url in seen_sitemaps
                or not self._same_domain(sitemap_url)
                or not self._allowed(sitemap_url)
            ):
                continue
            seen_sitemaps.add(sitemap_url)
            try:
                resp = await client.get(sitemap_url, timeout=10)
                if resp.status_code != 200:
                    continue
                root = ElementTree.fromstring(resp.content)
                root_type = root.tag.rsplit("}", 1)[-1].lower()
                if root_type == "sitemapindex":
                    sitemap_queue.extend(
                        loc.text.strip()
                        for sitemap in root
                        if sitemap.tag.rsplit("}", 1)[-1].lower() == "sitemap"
                        for loc in sitemap
                        if loc.tag.rsplit("}", 1)[-1].lower() == "loc" and loc.text
                    )
                elif root_type == "urlset":
                    urls.extend(
                        loc.text.strip()
                        for entry in root
                        if entry.tag.rsplit("}", 1)[-1].lower() == "url"
                        for loc in entry
                        if loc.tag.rsplit("}", 1)[-1].lower() == "loc" and loc.text
                    )
            except (httpx.HTTPError, ElementTree.ParseError):
                logger.debug("Could not read sitemap %s", sitemap_url, exc_info=True)
                continue
        return list(dict.fromkeys(urls))

    def _same_domain(self, url: str) -> bool:
        hostname = (urlsplit(url).hostname or "").lower().rstrip(".")
        if hostname == self.root_hostname:
            return True
        if not self.site_domain:
            return False
        extracted = _domain_extractor(hostname)
        domain = ".".join(part for part in (extracted.domain, extracted.suffix) if part)
        return domain == self.site_domain

    def _canonicalize_url(self, url: str, base_url: str) -> str | None:
        """Resolve and normalize a URL so fragments/tracking tags don't create crawl loops."""
        try:
            parsed = urlsplit(urljoin(base_url, url.strip()))
            hostname = (parsed.hostname or "").lower().rstrip(".")
            if (
                parsed.scheme.lower() not in {"http", "https"}
                or not hostname
                or parsed.username
                or parsed.password
            ):
                return None

            port = parsed.port
            netloc = f"[{hostname}]" if ":" in hostname else hostname
            if port and not ((parsed.scheme.lower() == "http" and port == 80) or (
                parsed.scheme.lower() == "https" and port == 443
            )):
                netloc = f"{hostname}:{port}"
                if ":" in hostname:
                    netloc = f"[{hostname}]:{port}"

            query_items = [
                (key, value)
                for key, value in parse_qsl(parsed.query, keep_blank_values=True)
                if key.lower() not in {"fbclid", "gclid"} and not key.lower().startswith("utm_")
            ]
            path = parsed.path or "/"
            if path != "/":
                path = path.rstrip("/") or "/"
            canonical = urlunsplit(
                (parsed.scheme.lower(), netloc, path, urlencode(query_items, doseq=True), "")
            )
            return canonical if len(canonical) <= 2048 else None
        except ValueError:
            return None

    def _is_skippable(self, url: str) -> bool:
        path = urlsplit(url).path.lower()
        return path.endswith(_SKIP_EXTENSIONS)

    def _extract_links(self, html: str, page_url: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        links: list[str] = []
        for anchor in soup.find_all("a", href=True):
            rel = anchor.get("rel", [])
            if isinstance(rel, str):
                rel = rel.split()
            if "nofollow" in {value.lower() for value in rel}:
                continue
            canonical = self._canonicalize_url(anchor["href"], page_url)
            if (
                canonical
                and self._same_domain(canonical)
                and not self._is_skippable(canonical)
                and self._allowed(canonical)
            ):
                links.append(canonical)
        return list(dict.fromkeys(links))

    async def crawl(
        self,
        on_progress: Callable[[int, int, dict[str, object]], None] | None = None,
        started_at: datetime | None = None,
    ) -> list[CrawledPage]:
        headers = {"User-Agent": settings.user_agent}
        if self.max_pages <= 0:
            return []
        crawl_started_at = started_at or datetime.now(timezone.utc)

        async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
            await self._load_robots(client)
            sitemap_urls = await self._discover_from_sitemap(client)
            seed_urls = [self.root_url] if self._allowed(self.root_url) else sitemap_urls
            frontier = deque()
            queued: set[str] = set()
            for raw_url in seed_urls:
                canonical = self._canonicalize_url(raw_url, self.root_url)
                if (
                    canonical
                    and canonical not in queued
                    and self._same_domain(canonical)
                    and not self._is_skippable(canonical)
                ):
                    frontier.append(canonical)
                    queued.add(canonical)

            concurrency = max(1, settings.crawl_concurrency)
            semaphore = asyncio.Semaphore(concurrency)
            pages_by_path: dict[str, CrawledPage] = {}
            attempted = 0
            js_rendered = 0
            recently_crawled: list[str] = []
            recently_discovered: list[str] = []
            playwright = None
            browser = None
            browser_unavailable = False

            def report_progress(current_url: str | None) -> None:
                if on_progress:
                    on_progress(
                        attempted,
                        min(len(queued), self.max_pages),
                        {
                            "started_at": crawl_started_at.isoformat(),
                            "current_url": current_url,
                            "recently_crawled": recently_crawled[-8:],
                            "recently_discovered": recently_discovered[-8:],
                        },
                    )

            async def fetch_one(url: str) -> tuple[str, httpx.Response | None]:
                async with semaphore:
                    try:
                        resp = await client.get(url, timeout=settings.crawl_timeout_seconds)
                    except httpx.HTTPError:
                        logger.debug("Failed to fetch %s", url, exc_info=True)
                        return url, None
                return url, resp

            report_progress(frontier[0] if frontier else None)

            try:
                while frontier and attempted < self.max_pages:
                    batch: list[str] = []
                    while (
                        frontier
                        and len(batch) < concurrency
                        and attempted + len(batch) < self.max_pages
                    ):
                        url = frontier.popleft()
                        if url in self._visited or not self._allowed(url):
                            continue
                        self._visited.add(url)
                        batch.append(url)

                    if not batch:
                        continue

                    report_progress(batch[0])
                    responses = await asyncio.gather(*(fetch_one(url) for url in batch))
                    attempted += len(batch)
                    discovered_links: list[str] = []
                    completed_urls: list[str] = []

                    for requested_url, resp in responses:
                        if (
                            resp is None
                            or resp.status_code != 200
                            or "text/html" not in resp.headers.get("content-type", "")
                        ):
                            continue

                        page_url = self._canonicalize_url(str(resp.url), requested_url)
                        if not page_url or not self._same_domain(page_url):
                            continue

                        completed_urls.append(page_url)
                        html = resp.text
                        page = _extract_page(page_url, self.root_url, html)
                        page_links = self._extract_links(html, page_url)

                        should_render = (
                            requested_url == self.root_url
                            or not page_links
                            or len(page.text_excerpt) < 200
                        )
                        if (
                            should_render
                            and js_rendered < settings.crawl_js_render_limit
                            and not browser_unavailable
                        ):
                            try:
                                if browser is None:
                                    from playwright.async_api import async_playwright

                                    playwright = await async_playwright().start()
                                    browser = await playwright.chromium.launch()
                                js_rendered += 1
                                browser_page = await browser.new_page(user_agent=settings.user_agent)
                                try:
                                    await browser_page.goto(
                                        page_url,
                                        timeout=settings.crawl_timeout_seconds * 1000,
                                        wait_until="domcontentloaded",
                                    )
                                    await browser_page.wait_for_timeout(500)
                                    rendered_html = await browser_page.content()
                                    rendered_url = self._canonicalize_url(browser_page.url, page_url)
                                finally:
                                    await browser_page.close()
                                if rendered_html and rendered_url and self._same_domain(rendered_url):
                                    rendered_page = _extract_page(rendered_url, self.root_url, rendered_html)
                                    if len(rendered_page.text_excerpt) > len(page.text_excerpt):
                                        page = rendered_page
                                    page_links.extend(self._extract_links(rendered_html, rendered_url))
                            except Exception:
                                browser_unavailable = browser is None
                                logger.warning("JavaScript rendering failed for %s", page_url, exc_info=True)

                        pages_by_path[page.path] = page
                        discovered_links.extend(page_links)

                    if self.root_url in batch:
                        discovered_links.extend(sitemap_urls)

                    newly_discovered: list[str] = []
                    for link in discovered_links:
                        if link not in queued and link not in self._visited and len(queued) < self.max_pages * 20:
                            queued.add(link)
                            frontier.append(link)
                            newly_discovered.append(link)

                    recently_crawled = (recently_crawled + completed_urls)[-8:]
                    recently_discovered = (recently_discovered + newly_discovered)[-8:]
                    report_progress(frontier[0] if frontier else None)

                if frontier:
                    logger.info(
                        "Reached crawl page limit (%s) for %s with %s URLs still queued",
                        self.max_pages,
                        self.root_url,
                        len(frontier),
                    )
            finally:
                if browser is not None:
                    await browser.close()
                if playwright is not None:
                    await playwright.stop()

            results = list(pages_by_path.values())
            return results


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
    if parsed.query:
        path = f"{path}?{parsed.query}"
    trimmed = (parsed.path or "/").strip("/")
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

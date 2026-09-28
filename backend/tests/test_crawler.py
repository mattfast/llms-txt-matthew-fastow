from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.services import crawler as crawler_module
from app.services.crawler import Crawler, _extract_page


class FakeResponse:
    status_code = 200
    headers = {"content-type": "text/html; charset=utf-8"}

    def __init__(self, url: str, text: str):
        self.url = url
        self.text = text


class FakeClient:
    def __init__(self, pages: dict[str, str]):
        self.pages = pages
        self.requested: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def get(self, url: str, **_):
        self.requested.append(url)
        return FakeResponse(url, self.pages[url])


class FakeSitemapResponse:
    def __init__(self, content: bytes, status_code: int = 200):
        self.content = content
        self.status_code = status_code


class FakeSitemapClient:
    def __init__(self, sitemaps: dict[str, bytes]):
        self.sitemaps = sitemaps
        self.requested: list[str] = []

    async def get(self, url: str, **_):
        self.requested.append(url)
        if url not in self.sitemaps:
            return FakeSitemapResponse(b"", status_code=404)
        return FakeSitemapResponse(self.sitemaps[url])


class CrawlerTests(unittest.TestCase):
    def test_canonicalizes_tracking_tags_but_keeps_content_query(self):
        crawler = Crawler("https://www.example.com")

        canonical = crawler._canonicalize_url(
            "../pricing/?plan=pro&utm_source=nav#details",
            "https://www.example.com/products/",
        )

        self.assertEqual(canonical, "https://www.example.com/pricing?plan=pro")

    def test_includes_same_site_subdomains_but_excludes_other_sites(self):
        crawler = Crawler("https://example.com")

        self.assertTrue(crawler._same_domain("https://docs.example.com/guide"))
        self.assertFalse(crawler._same_domain("https://example.org/"))

    def test_does_not_treat_other_github_pages_projects_as_same_site(self):
        crawler = Crawler("https://my-project.github.io")

        self.assertTrue(crawler._same_domain("https://my-project.github.io/docs"))
        self.assertFalse(crawler._same_domain("https://someone-else.github.io/"))

    def test_extracts_navigable_links_and_skips_external_or_nofollow(self):
        crawler = Crawler("https://example.com")
        crawler._robots.parse([])
        html = """
        <a href="/products?utm_campaign=nav">Products</a>
        <a href="https://docs.example.com/reference">Docs</a>
        <a href="https://outside.test/">External</a>
        <a href="/private" rel="nofollow">No follow</a>
        <a href="mailto:hello@example.com">Email</a>
        <a href="/guide.pdf">PDF</a>
        """

        self.assertEqual(
            crawler._extract_links(html, "https://example.com/"),
            ["https://example.com/products", "https://docs.example.com/reference"],
        )

    def test_query_variants_have_distinct_storage_paths(self):
        page = _extract_page(
            "https://example.com/pricing?plan=pro",
            "https://example.com",
            "<html><title>Pricing</title><main><p>Pricing details</p></main></html>",
        )

        self.assertEqual(page.path, "/pricing?plan=pro")

    def test_applies_include_exclude_and_subdomain_scope(self):
        crawler = Crawler(
            "https://example.com",
            allow_subdomains=False,
            include_patterns=["/docs/*"],
            exclude_patterns=["/docs/private*"],
        )
        crawler._robots.parse([])

        self.assertIsNone(crawler._scope_reason("https://example.com/"))
        self.assertIsNone(crawler._scope_reason("https://example.com/docs/start"))
        self.assertEqual(
            crawler._scope_reason("https://example.com/pricing"),
            "Does not match an include URL pattern",
        )
        self.assertEqual(
            crawler._scope_reason("https://example.com/docs/private"),
            "Excluded by URL pattern",
        )
        self.assertEqual(
            crawler._scope_reason("https://docs.example.com/docs/start"),
            "Outside the selected hostname scope",
        )


class SitemapTests(unittest.IsolatedAsyncioTestCase):
    async def test_recursively_follows_sitemap_indexes(self):
        crawler = Crawler("https://example.com")
        crawler._robots.parse(["Sitemap: https://example.com/custom-index.xml"])
        client = FakeSitemapClient(
            {
                "https://example.com/custom-index.xml": b"""<?xml version="1.0"?>
                    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                      <sitemap><loc>https://example.com/content.xml</loc></sitemap>
                    </sitemapindex>""",
                "https://example.com/content.xml": b"""<?xml version="1.0"?>
                    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                      <url><loc>https://example.com/docs</loc></url>
                      <url><loc>https://docs.example.com/api</loc></url>
                    </urlset>""",
            }
        )

        urls = await crawler._discover_from_sitemap(client)

        self.assertEqual(
            urls,
            ["https://example.com/docs", "https://docs.example.com/api"],
        )


class CrawlTraversalTests(unittest.IsolatedAsyncioTestCase):
    async def test_crawls_links_breadth_first_when_site_has_no_sitemap(self):
        paragraph = "Useful site content. " * 20
        pages = {
            "https://example.com/": (
                f"<html><title>Home</title><main><p>{paragraph}</p>"
                '<a href="/products">Products</a><a href="/docs">Docs</a></main></html>'
            ),
            "https://example.com/products": (
                f"<html><title>Products</title><main><p>{paragraph}</p>"
                '<a href="/pricing?plan=pro">Pricing</a></main></html>'
            ),
            "https://example.com/docs": (
                f"<html><title>Docs</title><main><p>{paragraph}</p></main></html>"
            ),
            "https://example.com/pricing?plan=pro": (
                f"<html><title>Pricing</title><main><p>{paragraph}</p></main></html>"
            ),
        }
        client = FakeClient(pages)
        crawler = Crawler("https://example.com", max_pages=10)

        async def allow_all_robots(_):
            crawler._robots.parse([])

        with (
            patch.object(Crawler, "_load_robots", new_callable=AsyncMock, side_effect=allow_all_robots),
            patch.object(Crawler, "_discover_from_sitemap", new_callable=AsyncMock, return_value=[]),
            patch.object(crawler_module.httpx, "AsyncClient", return_value=client),
            patch.object(crawler_module.settings, "crawl_js_render_limit", 0),
            patch.object(crawler_module.settings, "crawl_concurrency", 2),
        ):
            result = await crawler.crawl()

        self.assertEqual(
            set(client.requested),
            set(pages),
        )
        self.assertEqual({page.path for page in result}, {"/", "/products", "/docs", "/pricing?plan=pro"})

    async def test_reports_counts_and_recently_discovered_urls(self):
        html = (
            "<html><title>Home</title><main><p>"
            + ("Useful site content. " * 20)
            + '</p><a href="/products">Products</a></main></html>'
        )
        pages = {
            "https://example.com/": html,
            "https://example.com/products": (
                "<html><title>Products</title><main><p>"
                + ("Product details. " * 20)
                + "</p></main></html>"
            ),
        }
        client = FakeClient(pages)
        crawler = Crawler("https://example.com", max_pages=10)
        progress: list[tuple[int, int, dict[str, object]]] = []

        async def allow_all_robots(_):
            crawler._robots.parse([])

        with (
            patch.object(Crawler, "_load_robots", new_callable=AsyncMock, side_effect=allow_all_robots),
            patch.object(Crawler, "_discover_from_sitemap", new_callable=AsyncMock, return_value=[]),
            patch.object(crawler_module.httpx, "AsyncClient", return_value=client),
            patch.object(crawler_module.settings, "crawl_js_render_limit", 0),
            patch.object(crawler_module.settings, "crawl_concurrency", 1),
        ):
            result = await crawler.crawl(
                on_progress=lambda done, total, activity: progress.append((done, total, activity))
            )

        self.assertEqual(len(result), 2)
        self.assertTrue(progress)
        final_done, final_total, activity = progress[-1]
        self.assertEqual(final_done, 2)
        self.assertEqual(final_total, 2)
        self.assertIn("https://example.com/products", activity["recently_crawled"])
        self.assertIn("https://example.com/products", activity["recently_discovered"])
        self.assertIsNone(activity["current_url"])

    async def test_marks_urls_beyond_page_cap_as_skipped(self):
        html = (
            "<html><title>Home</title><main><p>"
            + ("Useful site content. " * 20)
            + '</p><a href="/one">One</a><a href="/two">Two</a></main></html>'
        )
        client = FakeClient({"https://example.com/": html})
        crawler = Crawler("https://example.com", max_pages=1)

        async def allow_all_robots(_):
            crawler._robots.parse([])

        with (
            patch.object(Crawler, "_load_robots", new_callable=AsyncMock, side_effect=allow_all_robots),
            patch.object(Crawler, "_discover_from_sitemap", new_callable=AsyncMock, return_value=[]),
            patch.object(crawler_module.httpx, "AsyncClient", return_value=client),
            patch.object(crawler_module.settings, "crawl_js_render_limit", 0),
            patch.object(crawler_module.settings, "crawl_concurrency", 1),
        ):
            result = await crawler.crawl()

        self.assertEqual(len(result), 1)
        self.assertEqual(crawler.coverage["summary"]["discovered"], 3)
        self.assertEqual(crawler.coverage["summary"]["crawled"], 1)
        self.assertEqual(crawler.coverage["summary"]["skipped"], 2)

    async def test_redirected_self_link_stays_marked_crawled(self):
        """A page that redirects (e.g. https://example.com/ -> https://www.example.com/) and
        then links back to itself must not have its coverage status reset from "crawled" back
        to "discovered" once that self-link is re-encountered."""
        html = (
            "<html><title>Home</title><main><p>"
            + ("Useful site content. " * 20)
            + '</p><a href="/">Home</a></main></html>'
        )

        class FakeRedirectResponse:
            status_code = 200
            headers = {"content-type": "text/html; charset=utf-8"}

            def __init__(self, url: str, text: str):
                self.url = url
                self.text = text

        class FakeRedirectClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def get(self, url: str, **_):
                # Every request to the bare hostname is redirected to "www.".
                return FakeRedirectResponse("https://www.example.com/", html)

        client = FakeRedirectClient()
        crawler = Crawler("https://example.com", max_pages=5)

        async def allow_all_robots(_):
            crawler._robots.parse([])

        with (
            patch.object(Crawler, "_load_robots", new_callable=AsyncMock, side_effect=allow_all_robots),
            patch.object(Crawler, "_discover_from_sitemap", new_callable=AsyncMock, return_value=[]),
            patch.object(crawler_module.httpx, "AsyncClient", return_value=client),
            patch.object(crawler_module.settings, "crawl_js_render_limit", 0),
            patch.object(crawler_module.settings, "crawl_concurrency", 2),
        ):
            result = await crawler.crawl()

        self.assertEqual(len(result), 1)
        # Both the pre-redirect URL and its resolved target are recorded as crawled; neither
        # is left stuck showing "discovered"/pending, and the redirect target keeps its
        # "crawled" status rather than being reset when its self-link is re-encountered.
        self.assertEqual(crawler.coverage["summary"]["crawled"], 2)
        self.assertEqual(crawler.coverage["summary"]["pending"], 0)
        record = next(p for p in crawler.coverage["pages"] if p["url"] == "https://www.example.com/")
        self.assertEqual(record["status"], "crawled")


if __name__ == "__main__":
    unittest.main()

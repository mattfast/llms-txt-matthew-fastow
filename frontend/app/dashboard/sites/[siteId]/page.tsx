"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import type {
  CrawlJob,
  CrawlCoverage,
  LlmsTxtVersion,
  LlmsTxtVersionSummary,
  MerkleTreeResponse,
  Site,
} from "@/lib/types";
import { MerkleTreeViz } from "@/components/MerkleTreeViz";
import { CrawlProgress } from "@/components/CrawlProgress";

const PREVIEW_LIMIT = 8000;
const CHANGED_PATHS_PREVIEW_LIMIT = 5;
const DEFAULT_CRAWL_PAGE_LIMIT = 100;
type CoverageStatus = CrawlCoverage["pages"][number]["status"];

function normalizePath(path: string): string {
  const [pathname, query = ""] = path.split("?", 2);
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";
  return query ? `${normalized}?${query}` : normalized;
}

function extractLlmsSection(content: string, selectedPath: string): string | null {
  const lines = content.split("\n");
  const target = normalizePath(selectedPath);
  let sectionStart = -1;

  for (let index = 0; index <= lines.length; index += 1) {
    const isHeading = index < lines.length && /^##\s/.test(lines[index]);
    if (isHeading || index === lines.length) {
      if (sectionStart >= 0) {
        const section = lines.slice(sectionStart, index);
        const containsPage = section.some((line) => {
          const match = line.match(/\]\((https?:\/\/[^)\s]+)\)/);
          if (!match) return false;
          try {
            const url = new URL(match[1]);
            return normalizePath(`${url.pathname}${url.search}`) === target;
          } catch {
            return false;
          }
        });
        if (containsPage) return section.join("\n").trim();
      }
      sectionStart = isHeading ? index : -1;
    }
  }

  return null;
}

export default function SiteDetailPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  const [site, setSite] = useState<Site | null>(null);
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [versions, setVersions] = useState<LlmsTxtVersionSummary[]>([]);
  const [activeVersion, setActiveVersion] = useState<LlmsTxtVersion | null>(null);
  const [merkle, setMerkle] = useState<MerkleTreeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [downloading, setDownloading] = useState<"llms" | "full" | null>(null);
  const [coverage, setCoverage] = useState<CrawlCoverage | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageStatus | "all">("all");
  const [editingSettings, setEditingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [maxPages, setMaxPages] = useState(DEFAULT_CRAWL_PAGE_LIMIT);
  const [allowSubdomains, setAllowSubdomains] = useState(true);
  const [includePatterns, setIncludePatterns] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [tab, setTab] = useState<"content" | "full">("content");
  const [expandFull, setExpandFull] = useState(false);
  const [expandChangedPaths, setExpandChangedPaths] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const prevStatus = useRef<Site["status"] | null>(null);
  const followingLatestVersion = useRef(true);
  const activeVersionId = useRef<string | null>(null);
  const visibleChangedPaths =
    activeVersion && expandChangedPaths
      ? activeVersion.changed_paths
      : activeVersion?.changed_paths.slice(0, CHANGED_PATHS_PREVIEW_LIMIT) ?? [];

  const refresh = useCallback(async () => {
    try {
      const [siteData, jobsData, versionsData] = await Promise.all([
        apiFetch<Site>(`/sites/${siteId}`),
        apiFetch<CrawlJob[]>(`/sites/${siteId}/jobs`),
        apiFetch<LlmsTxtVersionSummary[]>(`/sites/${siteId}/versions`),
      ]);
      setSite(siteData);
      setJobs(jobsData);
      setVersions(versionsData);
      setCoverage(jobsData.find((job) => job.coverage)?.coverage ?? null);

      if (versionsData.length > 0) {
        const latest = await apiFetch<LlmsTxtVersion>(`/sites/${siteId}/versions/latest`).catch(() => null);
        if (latest && followingLatestVersion.current) {
          if (activeVersionId.current !== latest.id) {
            activeVersionId.current = latest.id;
            setSelectedPath(null);
            setActiveVersion(latest);
          }
        }
      }

      if (siteData.status === "ready") {
        const tree = await apiFetch<MerkleTreeResponse>(`/sites/${siteId}/merkle-tree`).catch(() => null);
        if (tree) setMerkle(tree);
      }

      // Toast once when a pending crawl completes (or fails) while this page is open.
      if (prevStatus.current && prevStatus.current !== siteData.status) {
        if (siteData.status === "ready") {
          toast.success(`${siteData.domain} finished crawling ✅`);
        } else if (siteData.status === "error") {
          toast.error(`${siteData.domain} failed to crawl`);
        }
      }
      prevStatus.current = siteData.status;
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }, [siteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling an external API, setState happens in the async callback
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function loadVersion(versionId: string) {
    try {
      const version = await apiFetch<LlmsTxtVersion>(`/sites/${siteId}/versions/${versionId}`);
      followingLatestVersion.current = versions[0]?.id === version.id;
      activeVersionId.current = version.id;
      setActiveVersion(version);
      setExpandFull(false);
      setExpandChangedPaths(false);
      setSelectedPath(null);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  }

  async function triggerRecheck() {
    setRechecking(true);
    try {
      await apiFetch(`/sites/${siteId}/recheck`, { method: "POST" });
      await refresh();
      toast.success("Recheck queued");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        toast.error(err.message || "Couldn't queue a recheck");
      }
    } finally {
      setRechecking(false);
    }
  }

  async function downloadLlmsFile(full: boolean) {
    if (!site) return;
    const kind = full ? "full" : "llms";
    setDownloading(kind);
    try {
      const content = await apiFetch<string>(
        `/sites/${siteId}/${full ? "llms-full.txt" : "llms.txt"}`
      );
      const objectUrl = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${site.domain}-${full ? "llms-full.txt" : "llms.txt"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't download the file.";
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  }

  function editCrawlSettings() {
    if (!site) return;
    setMaxPages(site.max_pages);
    setAllowSubdomains(site.allow_subdomains);
    setIncludePatterns(site.include_patterns.join("\n"));
    setExcludePatterns(site.exclude_patterns.join("\n"));
    setEditingSettings(true);
  }

  async function saveCrawlSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const updated = await apiFetch<Site>(`/sites/${siteId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          max_pages: maxPages,
          allow_subdomains: allowSubdomains,
          include_patterns: includePatterns.split("\n").map((pattern) => pattern.trim()).filter(Boolean),
          exclude_patterns: excludePatterns.split("\n").map((pattern) => pattern.trim()).filter(Boolean),
        }),
      });
      setSite(updated);
      setEditingSettings(false);
      toast.success("Crawl settings saved. Run a recheck to apply them.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save crawl settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  if (!site) {
    return (
      <div className="p-8">
        <span className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
      </div>
    );
  }

  const fullContent = activeVersion?.full_content ?? "";
  const isLong = fullContent.length > PREVIEW_LIMIT;
  const displayedFull = isLong && !expandFull ? fullContent.slice(0, PREVIEW_LIMIT) : fullContent;
  const selectedSection =
    tab === "content" && selectedPath && activeVersion
      ? extractLlmsSection(activeVersion.content, selectedPath)
      : null;
  const displayedContent = selectedPath
    ? selectedSection ??
      `No llms.txt section contains ${selectedPath} in version v${activeVersion?.version_number ?? ""}.`
    : activeVersion?.content ?? "";
  const filteredCoveragePages =
    coverage?.pages.filter((page) => coverageFilter === "all" || page.status === coverageFilter) ?? [];

  function selectPage(path: string) {
    setSelectedPath(path);
    setTab("content");
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight break-all">{site.domain}</h1>
          <p className="text-foreground-muted text-sm mt-1">
            {site.status === "crawling"
              ? "Crawling now…"
              : site.status === "pending"
                ? "Queued for crawl…"
                : site.status === "error"
                  ? "Last crawl failed"
                  : `${site.pages_crawled} pages · last checked ${
                      site.last_crawled_at ? new Date(site.last_crawled_at).toLocaleString() : "never"
                    }`}
          </p>
        </div>
        <button
          onClick={triggerRecheck}
          disabled={rechecking || site.status === "pending" || site.status === "crawling"}
          className="pill bg-surface-raised hover:bg-surface-hover border border-border-subtle transition-colors px-4 py-2 text-sm disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          {rechecking ? "Queuing…" : site.status === "error" ? "Retry crawl" : "Recheck now"}
        </button>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Crawl settings</h2>
            <p className="text-xs text-foreground-muted mt-1">
              Up to {site.max_pages} pages · {site.allow_subdomains ? "subdomains included" : "root hostname only"}
            </p>
          </div>
          {!editingSettings && (
            <button
              type="button"
              onClick={editCrawlSettings}
              disabled={site.status === "pending" || site.status === "crawling"}
              className="pill border border-border-subtle px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
            >
              Edit settings
            </button>
          )}
        </div>
        {editingSettings && (
          <form onSubmit={saveCrawlSettings} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Maximum pages (1–5000; default {DEFAULT_CRAWL_PAGE_LIMIT})
              <input
                type="number"
                min={1}
                max={5000}
                required
                value={maxPages}
                onChange={(event) => setMaxPages(Number(event.target.value))}
                className="card px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
            {maxPages > DEFAULT_CRAWL_PAGE_LIMIT && (
              <p
                role="status"
                className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200"
              >
                A higher page limit sends more requests and may make crawls take longer or cost more.
                Some sites may throttle or block crawlers that make too many requests.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowSubdomains}
                onChange={(event) => setAllowSubdomains(event.target.checked)}
              />
              Include subdomains
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Include URL patterns <span className="text-xs text-foreground-muted">One glob per line, e.g. /docs/*; leave blank to include all paths.</span>
              <textarea
                value={includePatterns}
                onChange={(event) => setIncludePatterns(event.target.value)}
                rows={3}
                className="card px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Exclude URL patterns <span className="text-xs text-foreground-muted">Excluded paths always take precedence over include patterns.</span>
              <textarea
                value={excludePatterns}
                onChange={(event) => setExcludePatterns(event.target.value)}
                rows={3}
                className="card px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSettings(false)}
                className="pill border border-border-subtle px-3 py-2 text-xs hover:bg-surface-hover cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSettings || maxPages < 1 || maxPages > 5000}
                className="pill bg-accent px-3 py-2 text-xs text-white disabled:opacity-50 cursor-pointer"
              >
                {savingSettings ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        )}
      </section>

      {coverage && (
        <section className="card p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <h2 className="font-medium">Crawl coverage</h2>
            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              Filter by type
              <select
                value={coverageFilter}
                onChange={(event) => setCoverageFilter(event.target.value as CoverageStatus | "all")}
                aria-label="Filter coverage by type"
                className="card px-3 py-2 text-sm text-foreground outline-none focus:border-accent/60 transition-colors cursor-pointer"
              >
                <option value="all">All types</option>
                <option value="discovered">Discovered</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
                <option value="crawled">Crawled</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ["Discovered", coverage.summary.discovered],
              ["Crawled", coverage.summary.crawled],
              ["Skipped", coverage.summary.skipped],
              ["Failed", coverage.summary.failed],
            ].map(([label, count]) => (
              <div key={label} className="rounded-lg bg-surface p-3">
                <p className="text-xs text-foreground-muted">{label}</p>
                <p className="text-xl font-semibold mt-1">{count}</p>
              </div>
            ))}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
            {filteredCoveragePages.slice(0, 200).map((page) => (
              <div key={page.url} className="py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs">
                <span className="font-mono break-all flex-1">{page.url}</span>
                <span className={`uppercase font-semibold ${
                  page.status === "crawled" ? "text-emerald-400" :
                  page.status === "failed" ? "text-red-400" :
                  page.status === "skipped" ? "text-amber-400" : "text-foreground-muted"
                }`}>{page.status}</span>
                {page.reason && <span className="text-foreground-muted">{page.reason}</span>}
              </div>
            ))}
            {filteredCoveragePages.length === 0 && (
              <p className="py-3 text-xs text-foreground-muted">No URLs match this type.</p>
            )}
          </div>
          {filteredCoveragePages.length > 200 && (
            <p className="text-xs text-foreground-muted mt-3">
              Showing 200 of {filteredCoveragePages.length} matching URLs.
            </p>
          )}
          {coverage.summary.truncated > 0 && coverageFilter === "all" && (
            <p className="text-xs text-foreground-muted mt-3">
              {coverage.summary.truncated} additional URLs omitted from this report.
            </p>
          )}
        </section>
      )}

      {activeVersion && activeVersion.version_number >= 2 && (
        <section className="card p-5 border-accent/20">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Changes in version v{activeVersion.version_number}</h2>
              <p className="text-sm text-foreground-muted mt-1">
                {activeVersion.diff_summary || "No change summary is available for this version."}
              </p>
            </div>
            <span className="pill bg-accent/15 text-accent text-xs px-2.5 py-1 self-start">
              {activeVersion.changed_paths.length} changed page
              {activeVersion.changed_paths.length === 1 ? "" : "s"}
            </span>
          </div>
          {activeVersion.changed_paths.length > 0 && (
            <>
              <ul
                className={`mt-4 flex flex-col gap-1.5 overflow-y-auto ${
                  expandChangedPaths ? "max-h-96" : "max-h-40"
                }`}
              >
                {visibleChangedPaths.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => selectPage(path)}
                      className="text-sm font-mono text-accent hover:underline text-left break-all cursor-pointer"
                    >
                      {path}
                    </button>
                  </li>
                ))}
              </ul>
              {activeVersion.changed_paths.length > CHANGED_PATHS_PREVIEW_LIMIT && (
                <button
                  type="button"
                  onClick={() => setExpandChangedPaths((expanded) => !expanded)}
                  className="mt-2 text-xs text-accent hover:underline self-start cursor-pointer"
                >
                  {expandChangedPaths ? "Show less" : "Show more changed pages"}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {(site.status === "pending" || site.status === "crawling") && (
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
            <p className="text-sm text-foreground-muted">
              Discovering pages via sitemap, crawling content, and hashing each page into the
              Merkle tree…
            </p>
          </div>
          <CrawlProgress site={site} />
        </div>
      )}

      {site.status === "error" && jobs[0]?.error_message && (
        <div className="card p-6 border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-danger break-words">{jobs[0].error_message}</p>
          <button
            type="button"
            onClick={triggerRecheck}
            disabled={rechecking}
            className="pill shrink-0 bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors px-4 py-2 text-sm disabled:opacity-50 cursor-pointer"
          >
            {rechecking ? "Queuing…" : "Retry failed crawl"}
          </button>
        </div>
      )}

      {activeVersion && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <div className="card p-5 flex flex-col min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border-subtle">
                <button
                  onClick={() => setTab("content")}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    tab === "content" ? "bg-surface-hover text-foreground" : "text-foreground-muted"
                  }`}
                >
                  llms.txt
                </button>
                <button
                  onClick={() => setTab("full")}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    tab === "full" ? "bg-surface-hover text-foreground" : "text-foreground-muted"
                  }`}
                >
                  llms-full.txt
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadLlmsFile(false)}
                  disabled={downloading !== null}
                  className="text-xs text-foreground-muted hover:text-foreground underline disabled:opacity-50 cursor-pointer"
                >
                  {downloading === "llms" ? "Downloading…" : "Download llms.txt"}
                </button>
                <button
                  type="button"
                  onClick={() => downloadLlmsFile(true)}
                  disabled={downloading !== null}
                  className="text-xs text-foreground-muted hover:text-foreground underline disabled:opacity-50 cursor-pointer"
                >
                  {downloading === "full" ? "Downloading…" : "Download full"}
                </button>
              </div>
            </div>
            {selectedPath && tab === "content" && (
              <div className="flex items-center justify-between gap-3 text-xs text-foreground-muted mb-2">
                <span className="truncate">
                  Showing section for <span className="font-mono text-foreground">{selectedPath}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPath(null)}
                  className="text-accent hover:underline shrink-0 cursor-pointer"
                >
                  Show full llms.txt
                </button>
              </div>
            )}
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono bg-surface rounded-lg p-4 border border-border-subtle max-h-[520px] overflow-auto">
              {tab === "content" ? displayedContent : displayedFull}
            </pre>
            {tab === "full" && isLong && (
              <button
                onClick={() => setExpandFull((v) => !v)}
                className="text-xs text-accent hover:underline mt-2 self-start cursor-pointer"
              >
                {expandFull
                  ? "Show less"
                  : `Show full content (${fullContent.length.toLocaleString()} characters)`}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            {merkle && (
              <MerkleTreeViz
                tree={merkle.tree}
                rootHash={merkle.root_hash}
                changedCount={merkle.changed_paths.length}
                selectedPath={selectedPath}
                onSelectPage={selectPage}
              />
            )}

            <div className="card p-5">
              <h3 className="font-medium text-sm mb-3">Version history</h3>
              <div className="flex flex-col gap-2 max-h-72 overflow-auto">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => loadVersion(v.id)}
                    className={`text-left px-3 py-2 rounded-lg text-xs border transition-colors cursor-pointer ${
                      activeVersion?.id === v.id
                        ? "border-accent/50 bg-accent/10"
                        : "border-border-subtle hover:bg-surface-hover"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">v{v.version_number}</span>
                      <span className="text-foreground-muted">
                        {new Date(v.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-foreground-muted mt-1 line-clamp-2">{v.diff_summary}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import type {
  CrawlJob,
  LlmsTxtVersion,
  LlmsTxtVersionSummary,
  MerkleTreeResponse,
  Site,
} from "@/lib/types";
import { MerkleTreeViz } from "@/components/MerkleTreeViz";
import { CrawlProgress } from "@/components/CrawlProgress";

const PREVIEW_LIMIT = 8000;

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
  const [tab, setTab] = useState<"content" | "full">("content");
  const [expandFull, setExpandFull] = useState(false);
  const [expandChangedPaths, setExpandChangedPaths] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const prevStatus = useRef<Site["status"] | null>(null);
  const followingLatestVersion = useRef(true);
  const activeVersionId = useRef<string | null>(null);

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

      if (siteData.status === "ready") {
        const [latest, tree] = await Promise.all([
          apiFetch<LlmsTxtVersion>(`/sites/${siteId}/versions/latest`).catch(() => null),
          apiFetch<MerkleTreeResponse>(`/sites/${siteId}/merkle-tree`).catch(() => null),
        ]);
        if (latest && followingLatestVersion.current) {
          if (activeVersionId.current !== latest.id) {
            activeVersionId.current = latest.id;
            setSelectedPath(null);
            setActiveVersion(latest);
          }
        }
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
          disabled={rechecking || site.status !== "ready"}
          className="pill bg-surface-raised hover:bg-surface-hover border border-border-subtle transition-colors px-4 py-2 text-sm disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          {rechecking ? "Queuing…" : "Recheck now"}
        </button>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

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
                {activeVersion.changed_paths.map((path) => (
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
              <button
                type="button"
                onClick={() => setExpandChangedPaths((expanded) => !expanded)}
                className="mt-2 text-xs text-accent hover:underline self-start cursor-pointer"
              >
                {expandChangedPaths ? "Show less" : "Show more changed pages"}
              </button>
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
        <div className="card p-6 border-red-500/30">
          <p className="text-sm text-danger">{jobs[0].error_message}</p>
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
                <a
                  href={`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/sites/${siteId}/llms.txt`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-foreground-muted hover:text-foreground underline"
                >
                  Download llms.txt
                </a>
                <a
                  href={`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/sites/${siteId}/llms-full.txt`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-foreground-muted hover:text-foreground underline"
                >
                  Download full
                </a>
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type {
  CrawlJob,
  LlmsTxtVersion,
  LlmsTxtVersionSummary,
  MerkleTreeResponse,
  Site,
} from "@/lib/types";
import { MerkleTreeViz } from "@/components/MerkleTreeViz";

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
        if (latest) setActiveVersion(latest);
        if (tree) setMerkle(tree);
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }, [siteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling an external API, setState happens in the async callback
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function loadVersion(versionId: string) {
    const version = await apiFetch<LlmsTxtVersion>(`/sites/${siteId}/versions/latest`);
    // Full lookup by id isn't separately exposed; latest covers the common case. For older
    // versions we display the summary's diff and let the user download via the API directly.
    if (version.id === versionId) setActiveVersion(version);
  }

  async function triggerRecheck() {
    setRechecking(true);
    try {
      await apiFetch(`/sites/${siteId}/recheck`, { method: "POST" });
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
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

  return (
    <div className="p-8 max-w-5xl flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{site.domain}</h1>
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
          className="pill bg-surface-raised hover:bg-surface-hover border border-border-subtle transition-colors px-4 py-2 text-sm disabled:opacity-50 cursor-pointer"
        >
          {rechecking ? "Queuing…" : "Recheck now"}
        </button>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      {(site.status === "pending" || site.status === "crawling") && (
        <div className="card p-6 flex items-center gap-3">
          <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-sm text-foreground-muted">
            Discovering pages via sitemap, crawling content, and hashing each page into the
            Merkle tree…
          </p>
        </div>
      )}

      {site.status === "error" && jobs[0]?.error_message && (
        <div className="card p-6 border-red-500/30">
          <p className="text-sm text-danger">{jobs[0].error_message}</p>
        </div>
      )}

      {activeVersion && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="card p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
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
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono bg-surface rounded-lg p-4 border border-border-subtle max-h-[520px] overflow-auto">
              {tab === "content" ? activeVersion.content : "Open the full download link above for llms-full.txt content."}
            </pre>
          </div>

          <div className="flex flex-col gap-4">
            {merkle && (
              <MerkleTreeViz
                tree={merkle.tree}
                rootHash={merkle.root_hash}
                changedCount={merkle.changed_paths.length}
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

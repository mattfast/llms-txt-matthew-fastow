"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, Search as SearchIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { normalizeUrl } from "@/lib/url";
import type { Site } from "@/lib/types";
import { CrawlProgress } from "@/components/CrawlProgress";
import { ReportDownloadButtons } from "@/components/ReportDownloadButtons";

const STATUS_STYLES: Record<Site["status"], string> = {
  pending: "bg-yellow-500/15 text-yellow-400",
  crawling: "bg-accent/15 text-accent",
  ready: "bg-emerald-500/15 text-emerald-400",
  error: "bg-red-500/15 text-red-400",
};

function StatusBadge({ status }: { status: Site["status"] }) {
  return (
    <span className={`pill inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium px-2.5 py-1 ${STATUS_STYLES[status]}`}>
      {status === "crawling" && (
        <span className="inline-block w-1.5 h-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
      )}
      {status}
    </span>
  );
}

type SortKey = "created_at" | "last_crawled_at" | "pages_crawled";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created_at", label: "Date added" },
  { key: "last_crawled_at", label: "Last checked" },
  { key: "pages_crawled", label: "Pages crawled" },
];

function SitesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingUrl = searchParams.get("new");

  const [sites, setSites] = useState<Site[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteLoadError, setSiteLoadError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const siteLoadRequestRef = useRef(0);

  const loadSites = useCallback(async () => {
    const requestId = ++siteLoadRequestRef.current;
    try {
      const data = await apiFetch<Site[]>("/sites", { cache: "no-store" });
      if (requestId !== siteLoadRequestRef.current) return;
      setSites(data);
      setSiteLoadError(null);
    } catch (err) {
      if (requestId === siteLoadRequestRef.current) {
        setSiteLoadError(
          err instanceof ApiError ? err.message : "Couldn't refresh the site list. Please try again."
        );
      }
    }
  }, []);

  useEffect(() => {
    // Polling an external API for status updates is a valid effect subscription;
    // the flagged setState calls happen inside async callbacks, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSites();
    const interval = setInterval(loadSites, 3000);
    return () => clearInterval(interval);
  }, [loadSites]);

  const createSite = useCallback(
    async (url: string) => {
      setCreating(true);
      setError(null);
      try {
        await apiFetch<Site>("/sites", { method: "POST", body: JSON.stringify({ url }) });
        await loadSites();
        toast.success(`${url.replace(/^https?:\/\//, "")} queued for crawling`);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
          toast.error(err.message || "Couldn't add that site");
        }
      } finally {
        setCreating(false);
      }
    },
    [loadSites]
  );

  async function deleteSite() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch<void>(`/sites/${deleteTarget.id}`, { method: "DELETE" });
      setSites((current) => current?.filter((site) => site.id !== deleteTarget.id) ?? []);
      toast.success(`${deleteTarget.domain} and its generated content were deleted`);
      setDeleteTarget(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Couldn't delete this generation. Please try again.";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (pendingUrl) {
      sessionStorage.removeItem("pending_site_url");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async createSite, not a synchronous setState
      createSite(pendingUrl);
      router.replace("/dashboard");
    }
  }, [pendingUrl, createSite, router]);

  // Toast whenever a site transitions into "ready" or "error" (i.e. a pending task completed).
  // Tracked via a ref (not state) since it's only used to diff against the next poll, not to render.
  const prevStatusesRef = useRef<Record<string, Site["status"]>>({});
  useEffect(() => {
    if (!sites) return;
    const prev = prevStatusesRef.current;
    const next = { ...prev };
    for (const site of sites) {
      const before = prev[site.id];
      if (before && before !== site.status) {
        if (site.status === "ready") {
          toast.success(`${site.domain} finished crawling ✅`);
        } else if (site.status === "error") {
          toast.error(`${site.domain} failed to crawl`);
        }
      }
      next[site.id] = site.status;
    }
    prevStatusesRef.current = next;
  }, [sites]);

  const visibleSites = useMemo(() => {
    if (!sites) return null;
    const filtered = query.trim()
      ? sites.filter((s) => s.domain.toLowerCase().includes(query.trim().toLowerCase()))
      : sites;
    const sorted = [...filtered].sort((a, b) => {
      let av: number;
      let bv: number;
      if (sortKey === "pages_crawled") {
        av = a.pages_crawled;
        bv = b.pages_crawled;
      } else {
        const aDate = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
        const bDate = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
        av = aDate;
        bv = bDate;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [sites, query, sortKey, sortDir]);

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your sites</h1>
          <p className="text-foreground-muted text-sm mt-1">
            Monitored sites with an auto-generated, auto-updated llms.txt.
          </p>
        </div>
        <ReportDownloadButtons />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const normalized = normalizeUrl(manualUrl);
          if (!normalized) {
            setError("Enter a valid domain or URL, e.g. yourcompany.com");
            toast.error("Enter a valid domain or URL, e.g. yourcompany.com");
            return;
          }
          createSite(normalized);
          setManualUrl("");
        }}
        className="flex gap-2 mb-6"
      >
        <input
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="Add another site, e.g. yourcompany.com"
          className="flex-1 card px-4 py-2.5 text-sm outline-none focus:border-accent/60 transition-colors"
        />
        <button
          type="submit"
          disabled={creating}
          className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium px-5 disabled:opacity-60 cursor-pointer"
        >
          {creating ? "Adding…" : "Add"}
        </button>
      </form>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <SearchIcon
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites by name…"
            className="w-full card pl-9 pr-4 py-2 text-sm outline-none focus:border-accent/60 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="card px-3 py-2 text-sm outline-none focus:border-accent/60 transition-colors cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                Sort by: {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="card px-3 py-2 text-sm flex items-center gap-1.5 hover:border-accent/40 transition-colors cursor-pointer"
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            <ArrowUpDown size={14} />
            {sortDir === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
      </div>

      {(error || siteLoadError) && (
        <p className="text-danger text-sm mb-4">{error || siteLoadError}</p>
      )}

      <AnimatePresence>
        {visibleSites === null ? (
          error || siteLoadError ? null : <p className="text-foreground-muted text-sm">Loading…</p>
        ) : visibleSites.length === 0 ? (
          <p className="text-foreground-muted text-sm">
            {sites && sites.length > 0
              ? "No sites match your search."
              : "No sites yet. Paste a URL above to generate your first llms.txt."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleSites.map((site) => (
              <motion.div
                key={site.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="card relative flex flex-col justify-between hover:border-accent/40 hover:bg-surface-hover transition-colors h-full">
                  <Link
                    href={`/dashboard/sites/${site.id}`}
                    className="flex flex-col justify-between px-5 py-4 pr-36 min-h-24"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{site.domain}</p>
                        <p className="text-foreground-muted text-xs mt-0.5">
                          {site.pages_crawled} pages crawled
                          {site.last_crawled_at &&
                            ` · last checked ${new Date(site.last_crawled_at).toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                    {(site.status === "crawling" || site.status === "pending") && (
                      <CrawlProgress site={site} compact />
                    )}
                  </Link>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <StatusBadge status={site.status} />
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(site);
                      }}
                      aria-label={`Delete ${site.domain} generation`}
                      title="Delete generation"
                      className="inline-flex items-center justify-center rounded-md p-2 text-foreground-muted hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setDeleteTarget(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-generation-title"
            aria-describedby="delete-generation-description"
            className="card w-full max-w-md p-6 shadow-2xl"
          >
            <h2 id="delete-generation-title" className="text-lg font-semibold">
              Delete {deleteTarget.domain}?
            </h2>
            <p id="delete-generation-description" className="text-sm text-foreground-muted mt-2">
              This permanently removes its generated llms.txt files, version history, crawled
              pages, and topic insights. Usage and cost history will be retained. A crawl
              currently in progress must finish before this generation can be deleted.
            </p>
            {deleteError && <p className="text-danger text-sm mt-3">{deleteError}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="pill border border-border-subtle px-4 py-2 text-sm hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteSite}
                disabled={deleting}
                className="pill bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Deleting…" : "Delete generation"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function SitesPage() {
  return (
    <Suspense fallback={null}>
      <SitesContent />
    </Suspense>
  );
}

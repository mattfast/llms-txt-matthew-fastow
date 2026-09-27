"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { normalizeUrl } from "@/lib/url";
import type { Site } from "@/lib/types";
import { CrawlProgress } from "@/components/CrawlProgress";

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
  const [manualUrl, setManualUrl] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadSites = useCallback(async () => {
    try {
      const data = await apiFetch<Site[]>("/sites");
      setSites(data);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your sites</h1>
          <p className="text-foreground-muted text-sm mt-1">
            Monitored sites with an auto-generated, auto-updated llms.txt.
          </p>
        </div>
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

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      <AnimatePresence>
        {visibleSites === null ? (
          error ? null : <p className="text-foreground-muted text-sm">Loading…</p>
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
                <Link
                  href={`/dashboard/sites/${site.id}`}
                  className="card flex flex-col justify-between px-5 py-4 hover:border-accent/40 hover:bg-surface-hover transition-colors h-full"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{site.domain}</p>
                      <p className="text-foreground-muted text-xs mt-0.5">
                        {site.pages_crawled} pages crawled
                        {site.last_crawled_at &&
                          ` · last checked ${new Date(site.last_crawled_at).toLocaleString()}`}
                      </p>
                    </div>
                    <StatusBadge status={site.status} />
                  </div>
                  {(site.status === "crawling" || site.status === "pending") && (
                    <CrawlProgress site={site} compact />
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
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

"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ReportDownloadButtons } from "@/components/ReportDownloadButtons";
import { apiFetch, ApiError } from "@/lib/api";
import type { Site, TopicEntry, TopicTrendPoint } from "@/lib/types";

type TopicSources = {
  topic: string;
  sites: {
    site_id: string;
    domain: string;
    mentions: number;
    pages: { path: string; url: string; title: string | null }[];
  }[];
};

function TopicDetails({
  topic,
  trendData,
  sources,
  loadingSources,
  onClose,
}: {
  topic: string;
  trendData: { day: string; mentions: number }[];
  sources: TopicSources | null;
  loadingSources: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium capitalize">{topic}: trend and sources</h2>
          <p className="text-xs text-foreground-muted mt-1 mb-4">
            Historical counts are saved per successful crawl. Early dates may have limited history.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-foreground-muted hover:text-foreground cursor-pointer"
          aria-label="Close topic details"
        >
          Close
        </button>
      </div>
      {trendData.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2d" />
            <XAxis dataKey="day" stroke="#9a9ea3" fontSize={11} />
            <YAxis stroke="#9a9ea3" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1c", border: "1px solid #2a2a2d", fontSize: 12 }} />
            <Line type="monotone" dataKey="mentions" stroke="#818cf8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-foreground-muted">No historical snapshots for this topic yet.</p>
      )}
      <h3 className="text-sm font-medium mt-5 mb-3">Appears on these sites and pages</h3>
      {loadingSources ? (
        <p className="text-sm text-foreground-muted">Loading sources…</p>
      ) : sources?.sites.length ? (
        <div className="flex flex-col gap-3 max-h-[42vh] overflow-y-auto">
          {sources.sites.map((source) => (
            <div key={source.site_id} className="rounded-lg bg-surface p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{source.domain}</span>
                <span className="text-xs text-foreground-muted">{source.mentions} mentions</span>
              </div>
              {source.pages.length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {source.pages.map((page) => (
                    <li key={page.url}>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent hover:underline break-all"
                      >
                        {page.title || page.path}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-foreground-muted mt-2">
                  No matching page titles are available.
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-foreground-muted">No current source pages found.</p>
      )}
    </>
  );
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<TopicEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<TopicTrendPoint[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [siteStatusError, setSiteStatusError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingSiteId, setRetryingSiteId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [sources, setSources] = useState<TopicSources | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);

  const refreshInsights = useCallback(async (showFeedback = false) => {
    setRefreshing(true);
    try {
      const [topicData, trendData] = await Promise.all([
        apiFetch<TopicEntry[]>("/analytics/topics", { cache: "no-store" }),
        apiFetch<TopicTrendPoint[]>("/analytics/topics/trends?days=90", { cache: "no-store" }),
      ]);
      setTopics(topicData);
      setTrends(trendData);
      setLastRefreshed(new Date());
      setError(null);
      if (showFeedback) {
        toast.success(
          `Insights refreshed: ${topicData.length} company-wide topics`
        );
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't refresh topic insights";
      setError(message);
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let previousStatuses: Record<string, Site["status"]> = {};
    let active = true;
    let hasLoadedInitialStatus = false;

    const pollSiteStatuses = async () => {
      try {
        const currentSites = await apiFetch<Site[]>("/sites", { cache: "no-store" });
        if (!active) return;
        const isInitialLoad = !hasLoadedInitialStatus;
        hasLoadedInitialStatus = true;
        const crawlCompleted = currentSites.some((site) => {
          const previousStatus = previousStatuses[site.id];
          return (
            (previousStatus === "pending" || previousStatus === "crawling") &&
            (site.status === "ready" || site.status === "error")
          );
        });
        previousStatuses = Object.fromEntries(currentSites.map((site) => [site.id, site.status]));
        setSites(currentSites);
        setSiteStatusError(null);
        if (isInitialLoad || crawlCompleted) void refreshInsights();
      } catch (err) {
        if (!active) return;
        if (!hasLoadedInitialStatus) {
          hasLoadedInitialStatus = true;
          void refreshInsights();
        }
        setSiteStatusError(
          err instanceof ApiError ? err.message : "Couldn't check site crawl status"
        );
      }
    };

    void pollSiteStatuses();
    const interval = setInterval(() => void pollSiteStatuses(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refreshInsights]);

  const activeSites = sites?.filter((site) => site.status === "pending" || site.status === "crawling") ?? [];
  const failedSites = sites?.filter((site) => site.status === "error") ?? [];

  async function retrySite(site: Site) {
    setRetryingSiteId(site.id);
    try {
      await apiFetch(`/sites/${site.id}/recheck`, { method: "POST" });
      toast.success(`${site.domain} retry queued`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Couldn't retry ${site.domain}`);
    } finally {
      setRetryingSiteId(null);
    }
  }

  const max = topics && topics.length > 0 ? topics[0].mentions : 1;
  const trendData = selectedTopic
    ? trends
        .filter((point) => point.topic === selectedTopic)
        .map(({ day, mentions }) => ({ day, mentions }))
    : [];

  async function selectTopic(topic: string) {
    if (selectedTopic === topic) {
      setSelectedTopic(null);
      setSources(null);
      return;
    }
    setSelectedTopic(topic);
    setSources(null);
    setLoadingSources(true);
    try {
      setSources(await apiFetch<TopicSources>(`/analytics/topics/${encodeURIComponent(topic)}/pages`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't load topic sources");
    } finally {
      setLoadingSources(false);
    }
  }

  function closeDetails() {
    setSelectedTopic(null);
    setSources(null);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Topic insights</h1>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-foreground-muted text-sm">
          What&rsquo;s frequently mentioned across every site your company has crawled. Insights
          update after a successful crawl; this page checks crawl status every 5 seconds and refreshes
          when one completes.
          </p>
          {lastRefreshed && (
            <p className="text-xs text-foreground-muted mt-1">
              Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void refreshInsights(true)}
            disabled={refreshing}
            className="pill inline-flex items-center gap-2 border border-border-subtle px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <ReportDownloadButtons />
        </div>
      </div>

      {activeSites.length > 0 && (
        <section
          aria-live="polite"
          className="card border border-accent/30 bg-accent/5 p-4 mb-5"
        >
          <h2 className="text-sm font-medium">New site data is on the way</h2>
          <p className="text-xs text-foreground-muted mt-1">
            These sites will appear in Topic Insights after their first crawl finishes.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {activeSites.map((site) => (
              <li key={site.id} className="flex items-center gap-2 text-sm">
                <span className="inline-block w-2 h-2 shrink-0 rounded-full bg-accent animate-pulse" />
                <span className="font-medium">{site.domain}</span>
                <span className="text-foreground-muted">
                  {site.status === "pending"
                    ? "Queued for crawling"
                    : `Crawling · ${site.pages_crawled} of ${site.pages_discovered || "?"} pages`}
                </span>
              </li>
            ))}
          </ul>
          <a href="/dashboard" className="inline-block text-xs text-accent hover:underline mt-3">
            View all sites
          </a>
        </section>
      )}

      {failedSites.length > 0 && (
        <section className="card border border-red-500/30 bg-red-500/5 p-4 mb-5">
          <h2 className="text-sm font-medium text-red-400">Some site crawls need attention</h2>
          <p className="text-xs text-foreground-muted mt-1">
            Topic Insights only includes sites whose crawl completed successfully.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {failedSites.map((site) => (
              <li
                key={site.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <Link
                  href={`/dashboard/sites/${site.id}`}
                  className="text-accent hover:underline"
                >
                  {site.domain} · View error
                </Link>
                <button
                  type="button"
                  onClick={() => void retrySite(site)}
                  disabled={retryingSiteId !== null}
                  className="pill self-start border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
                >
                  {retryingSiteId === site.id ? "Queuing…" : "Retry crawl"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {siteStatusError && (
        <p role="status" className="text-xs text-foreground-muted mb-4">
          Live crawl status is temporarily unavailable: {siteStatusError}
        </p>
      )}

      <div
        className={`grid items-start gap-5 ${
          selectedTopic ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""
        }`}
      >
        <section>
          {topics === null ? (
            error ? (
              <p className="text-danger text-sm">{error}</p>
            ) : (
              <p className="text-foreground-muted text-sm">Loading…</p>
            )
          ) : topics.length === 0 ? (
            <p className="text-foreground-muted text-sm">No topics extracted yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {topics.map((topic) => (
                <Fragment key={topic.topic}>
                  <button
                    type="button"
                    onClick={() => void selectTopic(topic.topic)}
                    aria-expanded={selectedTopic === topic.topic}
                    className={`flex w-full items-center gap-3 text-left rounded-lg transition-colors cursor-pointer ${
                      selectedTopic === topic.topic
                        ? "bg-surface p-2 ring-1 ring-accent/40"
                        : "hover:bg-surface/60 p-2"
                    }`}
                  >
                    <span className="w-20 sm:w-32 shrink-0 text-sm capitalize truncate">{topic.topic}</span>
                    <div className="flex-1 h-6 bg-surface rounded-md overflow-hidden border border-border-subtle">
                      <div
                        className="h-full bg-accent/70 transition-all duration-500"
                        style={{ width: `${Math.max(6, (topic.mentions / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 sm:w-24 shrink-0 text-xs text-foreground-muted text-right">
                      {topic.mentions} · {topic.sites} site{topic.sites === 1 ? "" : "s"}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {selectedTopic === topic.topic && (
                      <motion.section
                        key={`mobile-${topic.topic}`}
                        initial={{ opacity: 0, height: 0, y: -8 }}
                        animate={{ opacity: 1, height: "auto", y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="lg:hidden overflow-hidden"
                      >
                        <div className="card p-4 mt-2">
                          <TopicDetails
                            topic={topic.topic}
                            trendData={trendData}
                            sources={sources}
                            loadingSources={loadingSources}
                            onClose={closeDetails}
                          />
                        </div>
                      </motion.section>
                    )}
                  </AnimatePresence>
                </Fragment>
              ))}
            </div>
          )}
        </section>

        <AnimatePresence initial={false}>
          {selectedTopic && (
            <motion.section
              key={`desktop-${selectedTopic}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="hidden lg:block card p-5 min-w-0 lg:sticky lg:top-4"
            >
              <TopicDetails
                topic={selectedTopic}
                trendData={trendData}
                sources={sources}
                loadingSources={loadingSources}
                onClose={closeDetails}
              />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

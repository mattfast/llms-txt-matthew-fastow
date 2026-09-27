"use client";

import { motion } from "framer-motion";
import type { Site } from "@/lib/types";

function estimatedTime(site: Site, now: number): string {
  const activity = site.crawl_activity;
  if (!activity || site.pages_crawled < 2) return "Estimating time…";

  const startedAt = new Date(activity.started_at).getTime();
  const elapsedSeconds = (now - startedAt) / 1000;
  const pagesPerSecond = site.pages_crawled / elapsedSeconds;
  if (!Number.isFinite(pagesPerSecond) || pagesPerSecond <= 0) return "Estimating time…";

  const remaining = Math.max(0, site.pages_discovered - site.pages_crawled);
  if (remaining === 0) return "Finishing up…";

  const seconds = Math.ceil(remaining / pagesPerSecond);
  if (seconds < 60) return `About ${seconds}s left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `About ${minutes} min left`;
  return `About ${Math.ceil(minutes / 60)} hr left`;
}

export function CrawlProgress({ site, compact = false }: { site: Site; compact?: boolean }) {
  const total = site.pages_discovered;
  const done = site.pages_crawled;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 5;
  const activity = site.crawl_activity;

  return (
    <div className={`w-full ${compact ? "mt-2" : ""}`}>
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <motion.div
          className="h-full bg-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-foreground-muted text-xs mt-2">
        <span>
          {total > 0
            ? `${done} checked · ${total} discovered`
            : "Finding pages and checking the site…"}
        </span>
        <span>{estimatedTime(site, Date.now())}</span>
      </div>

      {!compact && activity?.current_url && (
        <p className="text-foreground-muted text-xs mt-3">
          <span className="text-foreground">Up next: </span>
          <span className="break-all">{activity.current_url}</span>
        </p>
      )}

      {activity?.recently_discovered.length ? (
        <div className="mt-3">
          <p className="text-foreground-muted text-xs mb-1">Recently found</p>
          <ul className="flex flex-col gap-1">
            {activity.recently_discovered.slice(- (compact ? 2 : 5)).reverse().map((url) => (
              <li key={url} className="text-xs text-foreground-muted truncate" title={url}>
                {url}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

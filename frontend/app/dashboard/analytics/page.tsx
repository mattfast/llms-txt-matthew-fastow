"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import type { TopicEntry } from "@/lib/types";

export default function TopicsPage() {
  const [topics, setTopics] = useState<TopicEntry[] | null>(null);

  useEffect(() => {
    apiFetch<TopicEntry[]>("/analytics/topics")
      .then(setTopics)
      .catch((err) => {
        if (err instanceof ApiError) toast.error(err.message || "Couldn't load topic insights");
      });
  }, []);

  const max = topics && topics.length > 0 ? topics[0].mentions : 1;

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Topic insights</h1>
      <p className="text-foreground-muted text-sm mb-6">
        What&rsquo;s frequently mentioned across every site your company has crawled.
      </p>

      {topics === null ? (
        <p className="text-foreground-muted text-sm">Loading…</p>
      ) : topics.length === 0 ? (
        <p className="text-foreground-muted text-sm">No topics extracted yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {topics.map((t) => (
            <div key={t.topic} className="flex items-center gap-3">
              <span className="w-20 sm:w-32 shrink-0 text-sm capitalize truncate">{t.topic}</span>
              <div className="flex-1 h-6 bg-surface rounded-md overflow-hidden border border-border-subtle">
                <div
                  className="h-full bg-accent/70 transition-all duration-500"
                  style={{ width: `${Math.max(6, (t.mentions / max) * 100)}%` }}
                />
              </div>
              <span className="w-20 sm:w-24 shrink-0 text-xs text-foreground-muted text-right">
                {t.mentions} · {t.sites} site{t.sites === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

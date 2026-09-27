"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LeaderboardEntry[]>("/analytics/leaderboard")
      .then(setEntries)
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message || "Couldn't load the leaderboard");
          toast.error(err.message || "Couldn't load the leaderboard");
        }
      });
  }, []);

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Leaderboard</h1>
      <p className="text-foreground-muted text-sm mb-6">
        Who at your company has generated the most llms.txt content.
      </p>

      {entries === null ? (
        error ? (
          <p className="text-danger text-sm">{error}</p>
        ) : (
          <p className="text-foreground-muted text-sm">Loading…</p>
        )
      ) : entries.length === 0 ? (
        <p className="text-foreground-muted text-sm">No sites generated yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <div
              key={entry.user_id}
              className="card flex items-center justify-between px-5 py-3.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg w-6 text-center shrink-0">{MEDALS[i] ?? i + 1}</span>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{entry.display_name || entry.email}</p>
                  {entry.display_name && (
                    <p className="text-foreground-muted text-xs truncate">{entry.email}</p>
                  )}
                </div>
              </div>
              <span className="pill bg-accent/15 text-accent text-xs font-medium px-3 py-1 shrink-0 ml-2">
                {entry.sites_generated} site{entry.sites_generated === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

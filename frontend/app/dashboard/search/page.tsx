"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import type { SearchResult } from "@/lib/types";

const HISTORY_KEY = "ask_your_sites_history";
const MAX_HISTORY = 12;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage, must run client-only post-mount to avoid SSR/hydration mismatch
    setHistory(loadHistory());
  }, []);

  async function runQuery(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SearchResult>("/analytics/search", {
        method: "POST",
        body: JSON.stringify({ query: q }),
      });
      setResult(data);
      setHistory((prev) => {
        const next = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        toast.error(err.message || "Search failed");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runQuery(query);
  }

  function removeHistoryItem(q: string, e: React.MouseEvent) {
    e.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((h) => h !== q);
      saveHistory(next);
      return next;
    });
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Ask your sites</h1>
      <p className="text-foreground-muted text-sm mb-6">
        Query across every llms.txt your company has generated, for specific topics or general
        questions.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Which of our sites mention pricing?"
          className="flex-1 card px-4 py-2.5 text-sm outline-none focus:border-accent/60 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium px-5 py-2.5 sm:py-0 disabled:opacity-60 cursor-pointer"
        >
          {loading ? "Searching…" : "Ask"}
        </button>
      </form>

      {history.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="flex items-center gap-1 text-xs text-foreground-muted mr-1">
            <Clock size={12} /> Recent:
          </span>
          {history.map((h) => (
            <button
              key={h}
              onClick={() => {
                setQuery(h);
                runQuery(h);
              }}
              className="pill bg-surface-raised hover:bg-surface-hover border border-border-subtle transition-colors text-xs px-3 py-1 flex items-center gap-1.5 cursor-pointer max-w-xs"
            >
              <span className="truncate">{h}</span>
              <X
                size={12}
                className="text-foreground-muted hover:text-foreground shrink-0"
                onClick={(e) => removeHistoryItem(h, e)}
              />
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
          </div>
          {result.matches.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-foreground-muted uppercase tracking-wide">Sources</p>
              {result.matches.map((m, i) => (
                <a
                  key={i}
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="card px-4 py-3 text-sm hover:border-accent/40 hover:bg-surface-hover transition-colors"
                >
                  <p className="font-medium">{m.title}</p>
                  <p className="text-foreground-muted text-xs mt-0.5">
                    {m.domain}
                    {m.path}
                  </p>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

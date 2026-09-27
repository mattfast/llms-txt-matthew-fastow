"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { SearchResult } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SearchResult>("/analytics/search", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Ask your sites</h1>
      <p className="text-foreground-muted text-sm mb-6">
        Query across every llms.txt your company has generated, for specific topics or general
        questions.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Which of our sites mention pricing?"
          className="flex-1 card px-4 py-2.5 text-sm outline-none focus:border-accent/60 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium px-5 disabled:opacity-60 cursor-pointer"
        >
          {loading ? "Searching…" : "Ask"}
        </button>
      </form>

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

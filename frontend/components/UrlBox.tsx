"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { normalizeUrl } from "@/lib/url";

const EXAMPLE_SITES = [
  "amazon.com",
  "stripe.com",
  "github.com",
  "notion.so",
  "airbnb.com",
  "figma.com",
  "vercel.com",
  "shopify.com",
];

export function UrlBox() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [value, setValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % EXAMPLE_SITES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const placeholder = useMemo(() => `Try ${EXAMPLE_SITES[placeholderIndex]}`, [placeholderIndex]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeUrl(value);
    if (!normalized) {
      setError("Enter a valid URL, e.g. stripe.com");
      return;
    }

    setSubmitting(true);
    // Persist the target URL across the auth redirect so we can kick off the crawl
    // immediately once the user lands on (or already has) their dashboard.
    sessionStorage.setItem("pending_site_url", normalized);

    if (loading) {
      // Auth state still resolving - fall through to a neutral default once ready.
    }

    if (session) {
      router.push(`/dashboard?new=${encodeURIComponent(normalized)}`);
    } else {
      router.push(`/signup?next=${encodeURIComponent(normalized)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <motion.div
        whileFocus={{ scale: 1.01 }}
        className="flex items-center gap-2 card px-3 py-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] focus-within:border-accent/60 transition-colors"
      >
        <svg
          className="text-foreground-muted shrink-0"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-foreground placeholder:text-foreground-muted text-[15px]"
          autoFocus
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={submitting}
          className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium px-4 py-1.5 disabled:opacity-60 cursor-pointer"
        >
          Generate
        </button>
      </motion.div>
      {error && <p className="text-danger text-sm mt-2 text-center">{error}</p>}
    </form>
  );
}

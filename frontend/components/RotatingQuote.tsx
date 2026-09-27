"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const FALLBACK_QUOTES = [
  "Ship it. You can refactor your self-esteem later.",
  "Every website has a story. Yours is about to get a table of contents.",
  "llms.txt: because robots.txt was getting lonely.",
  "The best crawler is the one that finishes before your coffee gets cold.",
  "Documentation nobody reads, now readable by something that never sleeps.",
];

/** Fetches a fresh funny/motivational quote on an interval, with graceful fallback to a
 * local rotation if the backend/OpenAI is unavailable. */
export function RotatingQuote() {
  const [quote, setQuote] = useState(FALLBACK_QUOTES[0]);

  useEffect(() => {
    let cancelled = false;
    let fallbackIndex = 0;

    async function fetchQuote() {
      try {
        const res = await fetch("/api/quotes");
        if (!res.ok) throw new Error("quote fetch failed");
        const data = await res.json();
        if (!cancelled && data.quote) setQuote(data.quote);
      } catch {
        if (!cancelled) {
          fallbackIndex = (fallbackIndex + 1) % FALLBACK_QUOTES.length;
          setQuote(FALLBACK_QUOTES[fallbackIndex]);
        }
      }
    }

    fetchQuote();
    const interval = setInterval(fetchQuote, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="h-6 flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={quote}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35 }}
          className="text-foreground-muted text-sm italic text-center px-4"
        >
          &ldquo;{quote}&rdquo;
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

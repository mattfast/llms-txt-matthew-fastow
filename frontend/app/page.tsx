"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { UrlBox } from "@/components/UrlBox";
import { RotatingQuote } from "@/components/RotatingQuote";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      const pendingUrl = sessionStorage.getItem("pending_site_url");
      router.replace(
        pendingUrl
          ? `/dashboard?new=${encodeURIComponent(pendingUrl)}`
          : "/dashboard"
      );
    }
  }, [loading, router, session]);

  if (loading || session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/guide"
            className="text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 cursor-pointer"
          >
            User guide
          </Link>
          <Link
            href="/login"
            className="text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 cursor-pointer"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="pill bg-surface-raised hover:bg-surface-hover border border-border-subtle transition-colors px-4 py-1.5 cursor-pointer"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-6 -mt-10">
        <div className="flex flex-col items-center gap-3 animate-fade-slide-up">
          <RotatingQuote />
          <h1 className="text-3xl sm:text-4xl font-semibold text-center tracking-tight max-w-2xl">
            Turn any website into an{" "}
            <span className="text-accent">llms.txt</span>
          </h1>
          <p className="text-foreground-muted text-center max-w-md">
            Paste a URL. We crawl it, write the spec-compliant file, and keep it fresh
            automatically.
          </p>
        </div>

        <UrlBox />

        <p className="text-xs text-foreground-muted text-center">
          Create an account to crawl a site, generate llms.txt, and track changes.
        </p>
      </main>

      <footer className="text-center text-xs text-foreground-muted py-6">
        Built for the Profound take-home assignment &middot; conforms to{" "}
        <a
          href="https://llmstxt.org"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          llmstxt.org
        </a>
      </footer>
    </div>
  );
}

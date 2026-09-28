"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const returnTo = searchParams.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
      router.push(returnTo);
    } else {
      router.push(next ? `/dashboard?new=${encodeURIComponent(next)}` : "/dashboard");
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your company dashboard.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="bg-surface border border-border-subtle rounded-lg px-3 py-2 outline-none focus:border-accent/60 transition-colors"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center justify-between">
            Password
            <Link href="/forgot-password" className="text-xs text-foreground-muted hover:text-foreground underline">
              Forgot password?
            </Link>
          </span>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="bg-surface border border-border-subtle rounded-lg px-3 py-2 outline-none focus:border-accent/60 transition-colors"
          />
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium py-2 mt-2 disabled:opacity-60 cursor-pointer"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-xs text-foreground-muted mt-4 text-center">
        <Link href="/" className="hover:text-foreground underline">
          Back to homepage
        </Link>
      </p>
      <p className="text-xs text-foreground-muted mt-5 text-center">
        Don&rsquo;t have an account?{" "}
        <Link href="/signup" className="text-foreground underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function SignupForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = getSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/verify${
      next ? `?next=${encodeURIComponent(next)}` : ""
    }`;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle="One more step">
        <p className="text-sm text-foreground leading-relaxed">
          We sent a verification link to <span className="font-medium">{email}</span>. Click it
          to activate your account &mdash; your company dashboard will be waiting.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="You'll need to verify your email before your dashboard unlocks."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Work email
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
          Password
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="bg-surface border border-border-subtle rounded-lg px-3 py-2 outline-none focus:border-accent/60 transition-colors"
          />
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium py-2 mt-2 disabled:opacity-60 cursor-pointer"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-xs text-foreground-muted mt-5 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

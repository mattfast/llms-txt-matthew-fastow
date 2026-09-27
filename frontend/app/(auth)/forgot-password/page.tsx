"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = getSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle="Password reset requested">
        <p className="text-sm text-foreground leading-relaxed">
          If an account exists for <span className="font-medium">{email}</span>, we&rsquo;ve sent
          a link to reset your password.
        </p>
        <p className="text-xs text-foreground-muted mt-5 text-center">
          <Link href="/login" className="text-foreground underline">
            Back to log in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
    >
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
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium py-2 mt-2 disabled:opacity-60 cursor-pointer"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-xs text-foreground-muted mt-5 text-center">
        Remembered it?{" "}
        <Link href="/login" className="text-foreground underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

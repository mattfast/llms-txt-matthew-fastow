"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The reset link redirects here with a recovery session already established
    // (or established shortly after, once Supabase parses the URL fragment).
    let cancelled = false;
    async function checkSession() {
      const supabase = getSupabaseBrowserClient();
      let session = (await supabase.auth.getSession()).data.session;
      for (let attempt = 0; !session && attempt < 10 && !cancelled; attempt++) {
        await new Promise((r) => setTimeout(r, 300));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!cancelled) {
        setReady(true);
        if (!session) {
          setError("This reset link is invalid or has expired. Request a new one.");
        }
      }
    }
    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You're all set">
        <p className="text-sm text-foreground leading-relaxed">
          Redirecting you to your dashboard…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Choose a new password below.">
      {!ready ? (
        <p className="text-sm text-foreground-muted">Verifying your link…</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            New password
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
          <label className="flex flex-col gap-1 text-sm">
            Confirm password
            <input
              required
              minLength={8}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="bg-surface border border-border-subtle rounded-lg px-3 py-2 outline-none focus:border-accent/60 transition-colors"
            />
          </label>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium py-2 mt-2 disabled:opacity-60 cursor-pointer"
          >
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
      <p className="text-xs text-foreground-muted mt-5 text-center">
        <Link href="/login" className="text-foreground underline">
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

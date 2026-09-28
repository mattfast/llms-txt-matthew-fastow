"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type InvitationPreview = {
  email: string;
  role: "admin" | "member";
  expires_at: string;
  company_name: string;
};

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { session, loading: authLoading, refreshMe } = useAuth();
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const accepting = useRef(false);
  const accountEmail = session?.user.email?.toLowerCase();
  const returnTo = useMemo(
    () => `/invite?token=${encodeURIComponent(token ?? "")}`,
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    apiFetch<InvitationPreview>(`/team/invitations/preview?token=${encodeURIComponent(token)}`)
      .then((data) => {
        if (!cancelled) setInvitation(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError ? error.message : "Couldn't verify this invitation."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (
      !session ||
      !invitation ||
      accountEmail !== invitation.email.toLowerCase() ||
      accepting.current
    ) return;
    accepting.current = true;
    let cancelled = false;
    async function accept() {
      try {
        await apiFetch("/team/invitations/accept", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        await refreshMe();
        router.replace("/dashboard");
      } catch (error) {
        accepting.current = false;
        if (!cancelled) {
          setAcceptError(
            error instanceof ApiError ? error.message : "Couldn't accept this invitation."
          );
        }
      }
    }
    void accept();
    return () => {
      cancelled = true;
    };
  }, [accountEmail, invitation, refreshMe, router, session, token]);

  async function signUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation || !token) return;
    setSubmitting(true);
    setRegistrationError(null);
    setAccountExists(false);
    try {
      await apiFetch("/team/invitations/register", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email: invitation.email,
        password,
      });
      if (signInError) {
        throw new Error(
          `Your account was created, but automatic sign-in failed. Please log in with your new password. ${signInError.message}`
        );
      }
      accepting.current = true;
      try {
        await apiFetch("/team/invitations/accept", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        await refreshMe();
        router.replace("/dashboard");
      } catch (acceptError) {
        accepting.current = false;
        setRegistrationError(
          acceptError instanceof ApiError
            ? acceptError.message
            : "Couldn't accept this invitation."
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setAccountExists(true);
        setRegistrationError(error.message);
      } else {
        setRegistrationError(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Couldn't create your invited account."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (!invitation && !loadError)) {
    return (
      <AuthShell title="Checking invitation" subtitle="Just a moment">
        <p className="text-sm text-foreground-muted">Verifying your invitation…</p>
      </AuthShell>
    );
  }

  if (loadError || !token || !invitation) {
    return (
      <AuthShell title="Invitation unavailable" subtitle="This link may have expired or been revoked.">
        <p className="text-sm text-danger">
          {loadError || (!token ? "This invitation link is invalid." : "Invitation not found.")}
        </p>
        <Link href="/login" className="text-sm text-accent underline mt-4">Log in</Link>
      </AuthShell>
    );
  }

  if (session && accountEmail !== invitation.email.toLowerCase()) {
    return (
      <AuthShell title="Use the invited email" subtitle={`This invitation was sent to ${invitation.email}.`}>
        <p className="text-sm text-foreground-muted">
          You&rsquo;re currently signed in as {session.user.email}. Sign out and log in with the invited address.
        </p>
        <Link
          href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="pill inline-block bg-accent text-white text-sm font-medium px-4 py-2 mt-4"
        >
          Switch account
        </Link>
      </AuthShell>
    );
  }

  if (accountExists) {
    return (
      <AuthShell title="Log in to accept" subtitle={`This invitation was sent to ${invitation.email}.`}>
        <p className="text-sm text-danger">{registrationError}</p>
        <Link
          href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="pill inline-block bg-accent text-white text-sm font-medium px-4 py-2 mt-4"
        >
          Log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${invitation.company_name}`}
      subtitle={`You have been invited as a workspace ${invitation.role}.`}
    >
      {session ? (
        <>
          <p className="text-sm text-foreground-muted">Accepting invitation…</p>
          {acceptError && <p className="text-sm text-danger mt-3">{acceptError}</p>}
        </>
      ) : (
        <>
          <p className="text-xs text-foreground-muted mb-4">
            Invitation for {invitation.email}. Expires {new Date(invitation.expires_at).toLocaleString()}.
          </p>
          <form onSubmit={signUp} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Set a password
              <input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                className="bg-surface border border-border-subtle rounded-lg px-3 py-2 outline-none focus:border-accent/60"
              />
            </label>
            <p className="text-xs text-foreground-muted">
              This invitation link verifies your email address; no separate verification email is needed.
            </p>
            {registrationError && <p className="text-sm text-danger">{registrationError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="pill bg-accent text-white text-sm font-medium py-2 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? "Sending verification…" : "Accept invitation"}
            </button>
          </form>
          <p className="text-xs text-foreground-muted mt-5 text-center">
            Already have an account?{" "}
            <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-foreground underline">
              Log in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteContent />
    </Suspense>
  );
}

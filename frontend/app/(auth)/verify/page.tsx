"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import type { MeResponse } from "@/lib/types";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [status, setStatus] = useState<"checking" | "onboarding" | "error">("checking");
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = getSupabaseBrowserClient();
      // The verification link round-trips through Supabase, which establishes a session
      // and lands the user back here. Poll briefly since session hydration is async.
      let session = (await supabase.auth.getSession()).data.session;
      for (let attempt = 0; !session && attempt < 10 && !cancelled; attempt++) {
        await new Promise((r) => setTimeout(r, 400));
        session = (await supabase.auth.getSession()).data.session;
      }

      if (!session) {
        if (!cancelled) {
          setStatus("error");
          setMessage("We couldn't confirm your email. Try the link again or log in directly.");
        }
        return;
      }

      if (cancelled) return;
      setStatus("onboarding");
      setMessage("Setting up your company workspace…");

      try {
        const me = await apiFetch<MeResponse>("/auth/me");
        if (!me.onboarded) {
          const pendingCompanyName =
            (session.user.user_metadata?.pending_company_name as string) || "My Company";
          await apiFetch("/auth/onboard", {
            method: "POST",
            body: JSON.stringify({ company_name: pendingCompanyName }),
          });
        }
      } catch {
        // Non-fatal: dashboard will retry onboarding if needed.
      }

      if (!cancelled) {
        router.push(next ? `/dashboard?new=${encodeURIComponent(next)}` : "/dashboard");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  return (
    <AuthShell title="Verifying" subtitle="Just a moment">
      <div className="flex items-center gap-3 text-sm text-foreground-muted">
        {status !== "error" && (
          <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        )}
        <span>{message}</span>
      </div>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}

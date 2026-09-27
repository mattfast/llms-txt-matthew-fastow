"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Sites", icon: "🌐" },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/dashboard/analytics", label: "Topic insights", icon: "📊" },
  { href: "/dashboard/search", label: "Ask your sites", icon: "🔍" },
  { href: "/dashboard/cost", label: "Cost tracker", icon: "💸" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, me, loading, refreshMe, signOut } = useAuth();
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const onboardingInFlight = useRef(false);

  useEffect(() => {
    if (!loading && !session) {
      router.push("/login");
    }
  }, [loading, session, router]);

  // Self-heal: if the /verify page's onboarding call didn't complete (e.g. the user
  // confirmed their email in a different browser/tab), retry it here from the dashboard
  // using the company name stashed in Supabase user metadata at signup time.
  useEffect(() => {
    if (!session || !me || me.onboarded || onboardingInFlight.current) return;

    let cancelled = false;
    onboardingInFlight.current = true;
    async function retryOnboarding() {
      const pendingCompanyName =
        (session?.user.user_metadata?.pending_company_name as string) || "My Company";
      try {
        await apiFetch("/auth/onboard", {
          method: "POST",
          body: JSON.stringify({ company_name: pendingCompanyName }),
        });
        if (!cancelled) await refreshMe();
      } catch {
        if (!cancelled) setOnboardError("We couldn't finish setting up your workspace.");
      } finally {
        onboardingInFlight.current = false;
      }
    }
    retryOnboarding();
    return () => {
      cancelled = true;
    };
  }, [session, me, refreshMe]);

  if (loading || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (me && !me.onboarded) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="card p-7 max-w-sm text-center flex flex-col items-center gap-3">
          {!onboardError && (
            <span className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          )}
          <p className="text-sm text-foreground-muted">
            {onboardError ?? "Finishing account setup\u2026"}
          </p>
          {onboardError && (
            <button
              onClick={() => window.location.reload()}
              className="pill bg-surface-raised hover:bg-surface-hover border border-border-subtle transition-colors px-4 py-1.5 text-xs cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex">
      <aside className="w-60 shrink-0 border-r border-border-subtle flex flex-col p-4 gap-6">
        <Link href="/">
          <Logo className="px-2" />
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-surface-raised text-foreground"
                    : "text-foreground-muted hover:bg-surface hover:text-foreground"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-1">
          <div className="text-xs text-foreground-muted truncate">{me?.company_name}</div>
          <div className="text-xs text-foreground-muted truncate">{me?.email}</div>
          <button
            onClick={() => signOut().then(() => router.push("/"))}
            className="text-left text-xs text-foreground-muted hover:text-foreground transition-colors mt-1 cursor-pointer"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

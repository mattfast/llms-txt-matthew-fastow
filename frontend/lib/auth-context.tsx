"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase";
import { apiFetch } from "./api";
import type { MeResponse } from "./types";

interface AuthContextValue {
  session: Session | null;
  me: MeResponse | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const result = await apiFetch<MeResponse>("/auth/me");
      setMe(result);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(async (result: { data: { session: Session | null } }) => {
      setSession(result.data.session);
      if (result.data.session) await refreshMe();
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, newSession: Session | null) => {
        setSession(newSession);
        if (newSession) {
          await refreshMe();
        } else {
          setMe(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    await getSupabaseBrowserClient().auth.signOut();
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, me, loading, refreshMe, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

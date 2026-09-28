"use client";

import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

/** Browser-side Supabase client, used for auth (sign up / sign in / session) only.
 * All app data flows through the FastAPI backend, which independently verifies the
 * Supabase-issued JWT on every request. Browser localStorage keeps refresh tokens
 * across browser restarts; Supabase refreshes short-lived access tokens automatically. */
export function getSupabaseBrowserClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
  return client;
}

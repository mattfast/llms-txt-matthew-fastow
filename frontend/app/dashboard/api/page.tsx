"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type CreatedApiKey = ApiKey & { api_key: string };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const API_BASE_PATH = `${API_BASE_URL.replace(/\/$/, "")}/api`;

const ENDPOINTS = [
  ["GET", "/sites", "List company sites and crawl status."],
  ["POST", "/sites", 'Start a crawl. JSON body: {"url":"https://example.com","max_pages":100}; max_pages defaults to 100. Higher limits may trigger throttling or blocking, increase crawl time, and raise costs.'],
  ["GET", "/sites/{site_id}", "Get site details and crawl activity."],
  ["PATCH", "/sites/{site_id}/settings", "Update page cap, subdomain scope, and URL patterns."],
  ["DELETE", "/sites/{site_id}", "Delete a site and its generated data."],
  ["GET", "/sites/{site_id}/coverage", "Get the latest crawl coverage summary and URL outcomes."],
  ["GET", "/sites/{site_id}/jobs", "List recent crawl jobs."],
  ["POST", "/sites/{site_id}/recheck", "Queue a recheck."],
  ["GET", "/sites/{site_id}/versions", "List generated llms.txt versions."],
  ["GET", "/sites/{site_id}/versions/latest", "Get the latest version, including content."],
  ["GET", "/sites/{site_id}/versions/{version_id}", "Get a specific version."],
  ["GET", "/sites/{site_id}/llms.txt", "Download the latest llms.txt as plain text."],
  ["GET", "/sites/{site_id}/llms-full.txt", "Download the latest llms-full.txt as plain text."],
  ["GET", "/sites/{site_id}/merkle-tree", "Get the Merkle tree and latest changed paths."],
  ["GET", "/analytics/leaderboard", "Get the company generation leaderboard."],
  ["GET", "/analytics/topics", "Get aggregated topic insights."],
  ["GET", "/analytics/topics/trends?days=90", "Get historical topic mention counts."],
  ["GET", "/analytics/topics/{topic}/pages", "Get sites and pages contributing to a topic."],
  ["GET", "/analytics/report?format=json", "Download a JSON company site health report; supports csv."],
  ["GET", "/analytics/cost", "Get LLM usage and cost summaries."],
  ["POST", "/analytics/search", 'Ask across company sites. JSON body: {"query":"pricing"}'],
  ["GET", "/team/members", "List workspace members and roles (admin session required)."],
  ["PATCH", "/team/members/{profile_id}", 'Update a member role. JSON body: {"role":"member"} (admin session required).'],
  ["POST", "/team/invitations", 'Invite an email as an admin or member. JSON body: {"email":"person@example.com","role":"member"} (admin session required).'],
  ["GET", "/team/invitations", "List active workspace invitations (admin session required)."],
  ["DELETE", "/team/invitations/{invitation_id}", "Revoke a pending invitation (admin session required)."],
  ["GET", "/team/invitations/preview?token=…", "Validate an invitation link (public; token is required)."],
  ["POST", "/team/invitations/accept", 'Accept an invitation. JSON body: {"token":"…"} (Supabase session required).'],
  ["GET", "/team/audit-events", "List recent workspace audit events (admin session required)."],
  ["GET", "/auth/me", "Get the authenticated account and company workspace."],
  ["GET", "/quotes/random", "Get a rotating homepage quote (does not require authentication)."],
] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export default function ApiAccessPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [keyLoadError, setKeyLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<CreatedApiKey | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await apiFetch<ApiKey[]>("/api-keys"));
      setKeyLoadError(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Couldn't load API keys.";
      toast.error(message);
      setKeyLoadError(message);
    }
  }, []);

  useEffect(() => {
    // Fetching the current user's API keys is an external subscription on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadKeys();
  }, [loadKeys]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await apiFetch<CreatedApiKey>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setSecret(created);
      setName("");
      await loadKeys();
      toast.success("API key created. Copy it now; it won't be shown again.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't create API key.");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(key: ApiKey) {
    if (!window.confirm(`Revoke "${key.name}"? Any integrations using it will stop working.`)) return;
    setRevokingId(key.id);
    try {
      await apiFetch<void>(`/api-keys/${key.id}`, { method: "DELETE" });
      await loadKeys();
      toast.success("API key revoked.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't revoke API key.");
    } finally {
      setRevokingId(null);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.api_key);
      toast.success("API key copied.");
    } catch {
      toast.error("Clipboard access is unavailable. Select and copy the key manually.");
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto w-full flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">API access</h1>
        <p className="text-foreground-muted text-sm">
          Create company-wide keys for integrations and explore the REST API.
        </p>
        <p className="text-xs text-foreground-muted mt-2">
          API keys access company site and analytics operations. Managing keys, member roles, and audit
          history requires an admin&rsquo;s signed-in session.
        </p>
      </header>

      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound size={17} className="text-accent" />
          <h2 className="font-medium">API keys</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Company admins can manage keys. Each key grants access to all company sites and
          analytics. Keys are shown only once; store them securely.
        </p>
        <form onSubmit={createKey} className="flex flex-col sm:flex-row gap-2 mb-5">
          <input
            required
            minLength={1}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name, e.g. Production integration"
            aria-label="API key name"
            className="flex-1 card px-4 py-2.5 text-sm outline-none focus:border-accent/60 transition-colors"
          />
          <button
            type="submit"
            disabled={creating || !name.trim() || Boolean(secret)}
            className="pill bg-accent hover:bg-indigo-500 transition-colors text-white text-sm font-medium px-4 py-2 disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>

        {secret && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 mb-5">
            <p className="text-sm font-medium mb-2">Copy your new API key now</p>
            <p className="text-xs text-foreground-muted mb-3">
              This secret will not be displayed again. Treat it like a password.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-background p-3 text-xs break-all select-all">
                {secret.api_key}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="pill border border-border-subtle px-3 py-2 text-sm hover:bg-surface-hover inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Copy size={14} /> Copy
              </button>
              <button
                type="button"
                onClick={() => setSecret(null)}
                aria-label="Dismiss API key"
                className="pill border border-border-subtle px-3 py-2 text-sm hover:bg-surface-hover inline-flex items-center justify-center cursor-pointer"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        )}

        {keys === null ? (
          keyLoadError ? (
            <p className="text-sm text-danger">{keyLoadError}</p>
          ) : (
            <p className="text-sm text-foreground-muted">Loading API keys…</p>
          )
        ) : keys.length === 0 ? (
          <p className="text-sm text-foreground-muted">No API keys created yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {keys.map((key) => (
              <div key={key.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{key.name}</span>
                    {key.revoked_at && (
                      <span className="pill bg-red-500/10 text-red-400 text-xs px-2 py-0.5">Revoked</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted mt-1">
                    <code>{key.key_prefix}…</code> · Created {formatDate(key.created_at)} · Last used{" "}
                    {formatDate(key.last_used_at)}
                  </p>
                </div>
                {!key.revoked_at && (
                  <button
                    type="button"
                    onClick={() => revokeKey(key)}
                    disabled={revokingId === key.id}
                    className="pill border border-border-subtle px-3 py-1.5 text-xs text-foreground-muted hover:text-red-400 hover:border-red-500/30 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    {revokingId === key.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="font-medium">REST API documentation</h2>
            <p className="text-sm text-foreground-muted mt-1">
              All endpoints below use the company scope of your API key.
            </p>
          </div>
          <a
            href={`${API_BASE_URL.replace(/\/$/, "")}/docs`}
            target="_blank"
            rel="noreferrer"
            className="pill border border-border-subtle px-3 py-2 text-xs hover:bg-surface-hover inline-flex items-center gap-2 self-start"
          >
            Open interactive API reference <ExternalLink size={13} />
          </a>
        </div>

        <div className="rounded-lg bg-surface p-4 mb-5">
          <p className="text-xs text-foreground-muted mb-2">Base URL</p>
          <code className="text-sm break-all">{API_BASE_PATH}</code>
          <p className="text-xs text-foreground-muted mt-4 mb-2">Authentication</p>
          <code className="text-xs break-all">Authorization: Bearer YOUR_API_KEY</code>
          <pre className="mt-4 overflow-x-auto text-xs leading-relaxed text-foreground-muted">{`curl "${API_BASE_PATH}/sites" \\
  -H "Authorization: Bearer $PROFOUND_API_KEY"`}</pre>
        </div>

        <div className="flex flex-col">
          {ENDPOINTS.map(([method, path, description]) => (
            <div key={`${method}-${path}`} className="grid grid-cols-1 sm:grid-cols-[4.5rem_1fr] gap-1 sm:gap-3 py-3 border-t border-border-subtle">
              <code
                className={`text-xs font-semibold ${
                  method === "DELETE"
                    ? "text-red-400"
                    : method === "POST"
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`}
              >
                {method}
              </code>
              <div className="min-w-0">
                <code className="text-xs break-all">{path}</code>
                <p className="text-xs text-foreground-muted mt-1">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-foreground-muted mt-4">
          API key management uses your signed-in dashboard session and is intentionally unavailable
          to API-key-authenticated requests. Crawl creation returns a site immediately; poll its
          status or jobs endpoint for progress. Use the dashboard to create and revoke keys.
        </p>
      </section>
    </div>
  );
}

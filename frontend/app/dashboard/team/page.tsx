"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Member = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "member";
  created_at: string;
};

type AuditEvent = {
  id: string;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  created_at: string;
};

export default function TeamPage() {
  const { me, loading: authLoading } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [loadingMember, setLoadingMember] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Invitation["role"]>("member");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [revokingInvitation, setRevokingInvitation] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [memberList, inviteList, eventList] = await Promise.all([
        apiFetch<Member[]>("/team/members"),
        apiFetch<Invitation[]>("/team/invitations"),
        apiFetch<AuditEvent[]>("/team/audit-events?limit=100"),
      ]);
      setMembers(memberList);
      setInvitations(inviteList);
      setEvents(eventList);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't load team settings.");
    }
  }, []);

  useEffect(() => {
    // Fetching team data is an external subscription on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!authLoading && me?.role === "admin") void loadData();
  }, [authLoading, loadData, me?.role]);

  async function updateRole(member: Member, role: Member["role"]) {
    setLoadingMember(member.id);
    try {
      await apiFetch(`/team/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await loadData();
      toast.success(`${member.email} is now ${role}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update member role.");
    } finally {
      setLoadingMember(null);
    }
  }

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendingInvite(true);
    try {
      await apiFetch("/team/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail("");
      await loadData();
      toast.success(`Invitation sent to ${inviteEmail}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't send the invitation.");
    } finally {
      setSendingInvite(false);
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    setRevokingInvitation(invitation.id);
    try {
      await apiFetch<void>(`/team/invitations/${invitation.id}`, { method: "DELETE" });
      await loadData();
      toast.success(`Invitation to ${invitation.email} revoked.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't revoke the invitation.");
    } finally {
      setRevokingInvitation(null);
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto w-full flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Team & audit</h1>
        <p className="text-foreground-muted text-sm">
          Manage workspace access and review recent administrative activity.
        </p>
      </header>

      {authLoading ? (
        <p className="text-sm text-foreground-muted">Checking workspace permissions…</p>
      ) : me?.role !== "admin" ? (
        <p className="text-sm text-foreground-muted">Admin access is required to manage this workspace.</p>
      ) : (
      <>
      <section className="card p-5 sm:p-6">
        <h2 className="font-medium mb-1">Invite a teammate</h2>
        <p className="text-xs text-foreground-muted mb-4">
          They&rsquo;ll receive an email with a secure link that expires in 24 hours.
        </p>
        <form onSubmit={inviteMember} className="flex flex-col sm:flex-row gap-2">
          <input
            required
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="teammate@company.com"
            aria-label="Teammate email"
            className="flex-1 card px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          <select
            value={inviteRole}
            onChange={(event) => {
              if (event.target.value === "admin" || event.target.value === "member") {
                setInviteRole(event.target.value);
              }
            }}
            aria-label="Invitation role"
            className="card px-3 py-2 text-sm outline-none focus:border-accent/60"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={sendingInvite || !inviteEmail.trim()}
            className="pill bg-accent px-4 py-2 text-sm text-white disabled:opacity-50 cursor-pointer"
          >
            {sendingInvite ? "Sending…" : "Send invite"}
          </button>
        </form>
        {invitations === null ? (
          <p className="text-sm text-foreground-muted mt-5">Loading invitations…</p>
        ) : invitations.length > 0 ? (
          <div className="mt-5 flex flex-col divide-y divide-border-subtle">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-foreground-muted">
                    {invitation.role} · expires {new Date(invitation.expires_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revokeInvitation(invitation)}
                  disabled={revokingInvitation === invitation.id}
                  className="self-start sm:self-auto text-xs text-foreground-muted hover:text-danger disabled:opacity-50 cursor-pointer"
                >
                  {revokingInvitation === invitation.id ? "Revoking…" : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-foreground-muted mt-5">No pending invitations.</p>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-medium mb-1">Workspace members</h2>
        <p className="text-xs text-foreground-muted mb-4">
          Admins can manage API keys and member roles. Members can work with company sites and analytics.
        </p>
        {members === null ? (
          <p className="text-sm text-foreground-muted">Loading members…</p>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {members.map((member) => {
              const soleAdminSelf =
                member.id === me?.id &&
                member.role === "admin" &&
                members.filter((candidate) => candidate.role === "admin").length === 1;
              return (
              <div key={member.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{member.display_name || member.email}</p>
                  <p className="text-xs text-foreground-muted">
                    {member.email} · joined {new Date(member.created_at).toLocaleDateString()}
                    {soleAdminSelf ? " · sole admin" : ""}
                  </p>
                </div>
                <select
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  disabled={loadingMember === member.id || soleAdminSelf}
                  onChange={(event) => {
                    const role = event.target.value;
                    if (role === "admin" || role === "member") void updateRole(member, role);
                  }}
                  className="card px-3 py-2 text-xs outline-none focus:border-accent/60 disabled:opacity-50"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-medium mb-4">Recent activity</h2>
        {events === null ? (
          <p className="text-sm text-foreground-muted">Loading audit events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-foreground-muted">No administrative activity recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {events.map((event) => (
              <article key={event.id} className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{event.actor_email || "Former member"}</span>{" "}
                    <span className="text-foreground-muted">{event.action.replaceAll(".", " ")}</span>
                  </p>
                  <p className="text-xs text-foreground-muted mt-1">
                    {event.resource_type}
                    {event.resource_id ? ` · ${event.resource_id}` : ""}
                    {Object.keys(event.details).length > 0
                      ? ` · ${JSON.stringify(event.details)}`
                      : ""}
                  </p>
                </div>
                <time className="text-xs text-foreground-muted shrink-0">
                  {new Date(event.created_at).toLocaleString()}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}

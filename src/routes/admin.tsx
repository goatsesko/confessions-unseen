import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Check, Flag, Pin, ScrollText, Sparkles, Star, Trash2, Undo2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { formatConfessionId, timeAgo } from "@/lib/confessions";
import {
  adminStats,
  deleteCommentAsAdmin,
  deleteConfession,
  deleteMessageAsAdmin,
  fetchAdminConfessions,
  fetchAdminUsers,
  fetchAuditLogs,
  fetchFounders,
  fetchReports,
  fetchReportTarget,
  isAdmin,
  moderateConfession,
  moderateUser,
  resolveReport,
  type AdminReport,
  type AuditLog,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Moderation Dashboard — Whispr" },
      { name: "description", content: "Review reports, moderate confessions and manage members." },
      { property: "og:title", content: "Moderation Dashboard — Whispr" },
      { property: "og:description", content: "Review reports, moderate confessions and manage members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Tab = "queue" | "reports" | "users" | "founders" | "audit";

const TABS: { key: Tab; label: string }[] = [
  { key: "queue", label: "Queue" },
  { key: "reports", label: "Reports" },
  { key: "users", label: "Members" },
  { key: "founders", label: "Founders" },
  { key: "audit", label: "Audit Logs" },
];

function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("queue");

  const admin = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: () => isAdmin(user?.id),
    enabled: !!user?.id,
  });
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: adminStats, enabled: admin.data === true });

  if (loading || (user && admin.isLoading)) {
    return (
      <AppShell>
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </AppShell>
    );
  }

  if (!user || admin.data !== true) {
    return (
      <AppShell>
        <div className="mt-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-primary" />
          <h1 className="font-display text-lg font-extrabold">Moderators only</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This dashboard is restricted to the Whispr moderation team.
          </p>
          <Link to="/" className="tap mt-5 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
            Back to feed
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="font-display text-xl font-extrabold">Moderation</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">Keep the confessions safe, anonymous and alive.</p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Stat label="Posts" value={stats.data?.confessions} />
        <Stat label="Comments" value={stats.data?.comments} />
        <Stat label="Members" value={stats.data?.users} />
        <Stat label="Open" value={stats.data?.openReports} accent />
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "tap shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "queue" && <QueueTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "founders" && <FoundersTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value?: number | undefined; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-2 py-2.5 text-center">
      <div className={cn("font-display text-base font-extrabold", accent && "text-primary")}>{value ?? "—"}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/* ---------------------------------- queue ---------------------------------- */

const STATUSES = ["published", "hidden", "removed"] as const;

function QueueTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("published");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState<{ id: string; label: string } | null>(null);

  const list = useQuery({
    queryKey: ["admin-confessions", status, search, page],
    queryFn: () => fetchAdminConfessions(status, { search, page }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-confessions"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const act = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof moderateConfession>[1] }) =>
      moderateConfession(id, patch),
    onSuccess: () => {
      refresh();
      toast.success("Updated");
    },
    onError: () => toast.error("Action failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteConfession(id),
    onSuccess: () => {
      refresh();
      setConfirming(null);
      toast.success("Confession deleted");
    },
    onError: () => toast.error("Couldn't delete"),
  });

  const rows = list.data?.rows ?? [];
  const busy = act.isPending || remove.isPending;

  return (
    <div>
      <input
        value={search}
        onChange={(e) => {
          setPage(0);
          setSearch(e.target.value);
        }}
        placeholder="Search by number (#000123) or text"
        className="mb-3 h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted-foreground"
      />

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setPage(0);
                setStatus(s);
              }}
              className={cn(
                "tap rounded-full px-3 py-1 text-[11px] font-semibold capitalize",
                status === s ? "bg-elevated text-foreground" : "text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">{list.data?.total ?? 0} total</span>
      </div>

      {list.isLoading && <SkeletonList />}
      {list.isError && <Empty text="Couldn't load the queue. Try again." />}
      {!list.isLoading && !list.isError && rows.length === 0 && <Empty text={`No ${status} confessions.`} />}

      <div className={cn("space-y-3", busy && "opacity-60")}>
        {rows.map((c) => (
          <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Link to="/confession/$number" params={{ number: String(c.number) }} className="font-semibold text-primary">
                CONFESSION {formatConfessionId(c.number)}
              </Link>
              <span>· {c.category}</span>
              <span>· {timeAgo(c.created_at)}</span>
              {c.is_pinned && <span className="text-foreground">· pinned</span>}
              {c.is_featured && <span className="text-foreground">· featured</span>}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-foreground/90">{c.body}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Action
                icon={Pin}
                label={c.is_pinned ? "Unpin" : "Pin"}
                active={c.is_pinned}
                onClick={() => act.mutate({ id: c.id, patch: { is_pinned: !c.is_pinned } })}
              />
              <Action
                icon={Star}
                label={c.is_featured ? "Unfeature" : "Feature"}
                active={c.is_featured}
                onClick={() => act.mutate({ id: c.id, patch: { is_featured: !c.is_featured } })}
              />
              {status !== "hidden" && (
                <Action icon={X} label="Hide" onClick={() => act.mutate({ id: c.id, patch: { status: "hidden" } })} />
              )}
              {status !== "published" && (
                <Action
                  icon={Undo2}
                  label="Restore"
                  onClick={() => act.mutate({ id: c.id, patch: { status: "published" } })}
                />
              )}
              {status !== "removed" && (
                <Action
                  icon={Ban}
                  label="Remove"
                  danger
                  onClick={() => act.mutate({ id: c.id, patch: { status: "removed" } })}
                />
              )}
              <Action
                icon={Trash2}
                label="Delete"
                danger
                onClick={() => setConfirming({ id: c.id, label: `CONFESSION ${formatConfessionId(c.number)}` })}
              />
            </div>
          </div>
        ))}
      </div>

      <Pager page={page} total={list.data?.total ?? 0} pageSize={list.data?.pageSize ?? 20} onPage={setPage} />

      <Confirm
        open={!!confirming}
        title="Delete permanently?"
        body={`${confirming?.label ?? "This confession"} and all its comments, reactions and reposts will be erased. This cannot be undone.`}
        confirmLabel="Delete forever"
        busy={remove.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && remove.mutate(confirming.id)}
      />
    </div>
  );
}

/* --------------------------------- reports --------------------------------- */

const REPORT_TYPES = ["", "confession", "comment", "message", "user"] as const;

function ReportsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed">("open");
  const [type, setType] = useState<string>("");
  const [page, setPage] = useState(0);
  const list = useQuery({
    queryKey: ["admin-reports", status, type, page],
    queryFn: () => fetchReports(status, { type, page }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const resolve = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "resolved" | "dismissed" }) => resolveReport(id, next),
    onSuccess: () => {
      refresh();
      toast.success("Report closed");
    },
    onError: () => toast.error("Couldn't update report"),
  });

  const rows = list.data?.rows ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["open", "resolved", "dismissed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setPage(0);
                setStatus(s);
              }}
              className={cn(
                "tap rounded-full px-3 py-1 text-[11px] font-semibold capitalize",
                status === s ? "bg-elevated text-foreground" : "text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={type}
          onChange={(e) => {
            setPage(0);
            setType(e.target.value);
          }}
          className="h-9 rounded-xl border border-border bg-card px-2 text-[11px] outline-none"
        >
          {REPORT_TYPES.map((t) => (
            <option key={t || "all"} value={t}>
              {t === "" ? "All kinds" : t}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading && <SkeletonList />}
      {list.isError && <Empty text="Couldn't load reports. Try again." />}
      {!list.isLoading && !list.isError && rows.length === 0 && <Empty text={`No ${status} reports.`} />}

      <div className="space-y-3">
        {rows.map((r) => (
          <ReportRow
            key={r.id}
            report={r}
            reportCount={list.data?.counts?.[r.target_id] ?? 1}
            onResolve={(next) => resolve.mutate({ id: r.id, next })}
          />
        ))}
      </div>

      <Pager page={page} total={list.data?.total ?? 0} pageSize={list.data?.pageSize ?? 20} onPage={setPage} />
    </div>
  );
}

function ReportRow({
  report,
  reportCount,
  onResolve,
}: {
  report: AdminReport;
  reportCount: number;
  onResolve: (n: "resolved" | "dismissed") => void;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const target = useQuery({
    queryKey: ["report-target", report.target_type, report.target_id],
    queryFn: () => fetchReportTarget(report.target_type, report.target_id),
  });
  const t = target.data;

  const takedown = useMutation({
    mutationFn: async () => {
      if (t?.kind === "confession") await moderateConfession(t.id, { status: "removed" });
      else if (t?.kind === "comment") await deleteCommentAsAdmin(t.id);
      else if (t?.kind === "message") await deleteMessageAsAdmin(t.id, t.body);
      else if (t?.kind === "user") await moderateUser(t.id, { banned: true });
      await resolveReport(report.id, "resolved");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setConfirming(false);
      toast.success("Content actioned");
    },
    onError: () => toast.error("Couldn't action this report"),
  });

  const actionLabel = t?.kind === "user" ? "Ban user" : "Take down";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Flag className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold capitalize text-foreground">{report.target_type}</span>
        <span>· {timeAgo(report.created_at)}</span>
        {reportCount > 1 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
            {reportCount} reports
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium">{report.reason}</p>

      <div className="mt-2 rounded-xl border border-border/70 bg-background p-3 text-xs text-muted-foreground">
        {target.isLoading && <span>Loading context…</span>}
        {!target.isLoading && !t && <span>Content no longer exists.</span>}
        {t?.kind === "confession" && (
          <Link to="/confession/$number" params={{ number: String(t.number) }} className="line-clamp-3 block">
            <span className="font-semibold text-primary">CONFESSION {formatConfessionId(t.number)}</span> — {t.body}
          </Link>
        )}
        {t?.kind === "comment" && <span className="line-clamp-3 block">“{t.body}”</span>}
        {t?.kind === "message" && (
          <div>
            <span className="font-semibold text-foreground">
              Direct message{t.sender_username ? ` from @${t.sender_username}` : ""}
            </span>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{t.body || "(media only)"}</p>
            {(t.image_url || t.audio_url) && (
              <p className="mt-1 text-[11px] text-primary">{t.image_url ? "Contains an image" : "Contains a voice note"}</p>
            )}
          </div>
        )}
        {t?.kind === "user" && (
          <Link to="/u/$username" params={{ username: t.username }} className="font-semibold text-primary">
            @{t.username}
          </Link>
        )}
      </div>

      {report.status === "open" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Action icon={Ban} label={actionLabel} danger onClick={() => setConfirming(true)} />
          <Action icon={Check} label="Resolve" onClick={() => onResolve("resolved")} />
          <Action icon={X} label="Dismiss" onClick={() => onResolve("dismissed")} />
        </div>
      )}

      <Confirm
        open={confirming}
        title={`${actionLabel}?`}
        body={
          t?.kind === "user"
            ? "This member will be banned and locked out immediately."
            : "This content will be taken down and the report marked resolved."
        }
        confirmLabel={actionLabel}
        busy={takedown.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => takedown.mutate()}
      />
    </div>
  );
}

/* ---------------------------------- users ---------------------------------- */

function UsersTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState<{ id: string; username: string } | null>(null);
  const list = useQuery({ queryKey: ["admin-users", q, page], queryFn: () => fetchAdminUsers(q, { page }) });

  const act = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { banned?: boolean; suspended_until?: string | null } }) =>
      moderateUser(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirming(null);
      toast.success("Member updated");
    },
    onError: () => toast.error("Couldn't update member"),
  });

  const suspend = (id: string, days: number) =>
    act.mutate({ id, patch: { suspended_until: new Date(Date.now() + days * 86_400_000).toISOString() } });

  const rows = list.data?.rows ?? [];

  return (
    <div>
      <input
        value={q}
        onChange={(e) => {
          setPage(0);
          setQ(e.target.value);
        }}
        placeholder="Search @username"
        className="mb-3 h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted-foreground"
      />

      {list.isLoading && <SkeletonList />}
      {list.isError && <Empty text="Couldn't load members. Try again." />}
      {!list.isLoading && !list.isError && rows.length === 0 && <Empty text="No members found." />}

      <div className="space-y-2">
        {rows.map((u) => {
          const suspended = !!u.suspended_until && new Date(u.suspended_until) > new Date();
          return (
            <div key={u.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                <UserAvatar avatarPath={u.avatar_url} username={u.username} size="md" />
                <div className="min-w-0 flex-1">
                  <Link to="/u/$username" params={{ username: u.username }} className="block truncate text-sm font-semibold">
                    @{u.username}
                  </Link>
                  <div className="text-[11px] text-muted-foreground">
                    joined {timeAgo(u.created_at)}
                    {u.banned && <span className="text-primary"> · banned</span>}
                    {!u.banned && suspended && <span className="text-primary"> · suspended</span>}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Action icon={Ban} label="24h" onClick={() => suspend(u.id, 1)} />
                <Action icon={Ban} label="7d" onClick={() => suspend(u.id, 7)} />
                {(u.banned || suspended) && (
                  <Action
                    icon={Undo2}
                    label="Lift"
                    onClick={() => act.mutate({ id: u.id, patch: { banned: false, suspended_until: null } })}
                  />
                )}
                {!u.banned && (
                  <Action
                    icon={Ban}
                    label="Ban"
                    danger
                    onClick={() => setConfirming({ id: u.id, username: u.username })}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Pager page={page} total={list.data?.total ?? 0} pageSize={list.data?.pageSize ?? 20} onPage={setPage} />

      <Confirm
        open={!!confirming}
        title={`Ban @${confirming?.username ?? ""}?`}
        body="They lose access to messaging, comments and communities until you lift the ban."
        confirmLabel="Ban member"
        busy={act.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && act.mutate({ id: confirming.id, patch: { banned: true } })}
      />
    </div>
  );
}


/* -------------------------------- founders --------------------------------- */

function FoundersTab() {
  const list = useQuery({ queryKey: ["founders"], queryFn: fetchFounders });

  return (
    <div>
      <div className="mb-3 rounded-2xl border border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Founder allow-list.</span> The first five accounts to join are
        permanent admins with 2-character usernames allowed. Everyone after them needs 5+ characters and no admin rights.
      </div>

      {list.isLoading && <SkeletonList />}

      <div className="space-y-2">
        {(list.data ?? []).map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="font-display text-sm font-extrabold text-primary">#{f.slot}</div>
            <UserAvatar avatarPath={f.avatar_url} username={f.username} size="md" />
            <div className="min-w-0 flex-1">
              <Link to="/u/$username" params={{ username: f.username }} className="block truncate text-sm font-semibold">
                @{f.username}
              </Link>
              <div className="text-[11px] text-muted-foreground">joined {timeAgo(f.created_at)}</div>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase",
                f.isAdmin ? "bg-primary text-primary-foreground" : "bg-elevated text-muted-foreground",
              )}
            >
              <Sparkles className="h-3 w-3" />
              {f.isAdmin ? "Admin" : "Pending"}
            </span>
          </div>
        ))}
        {!list.isLoading &&
          Array.from({ length: Math.max(0, 5 - (list.data?.length ?? 0)) }).map((_, i) => (
            <div
              key={`slot-${i}`}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-3 text-xs text-muted-foreground"
            >
              <div className="font-display text-sm font-extrabold">#{(list.data?.length ?? 0) + i + 1}</div>
              Open founder slot — the next account to sign up claims it.
            </div>
          ))}
      </div>
    </div>
  );
}


/* -------------------------------- audit logs -------------------------------- */

const AUDIT_ACTIONS = [
  "pin",
  "unpin",
  "feature",
  "unfeature",
  "hide",
  "restore",
  "remove",
  "delete",
  "delete_comment",
  "ban",
  "unban",
  "suspend",
  "resolve_report",
  "dismiss_report",
];

function AuditTab() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [admin, setAdmin] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(0);

  const filters = { search, action, admin, from, to, sort, page };
  const logs = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => fetchAuditLogs(filters),
  });

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setPage(0);
    setter(v);
  };

  const total = logs.data?.total ?? 0;
  const pageSize = logs.data?.pageSize ?? 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const inputCls =
    "h-10 rounded-xl border border-border bg-card px-3 text-xs outline-none placeholder:text-muted-foreground";

  return (
    <div>
      <div className="mb-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5 text-primary" /> Immutable moderation history
        </div>
        <input
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
          placeholder="Search target, ID or admin"
          className={cn(inputCls, "mt-2 w-full")}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select value={action} onChange={(e) => reset(setAction)(e.target.value)} className={inputCls}>
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a.replace("_", " ")}
              </option>
            ))}
          </select>
          <input
            value={admin}
            onChange={(e) => reset(setAdmin)(e.target.value)}
            placeholder="@admin"
            className={inputCls}
          />
          <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className={inputCls} />
          <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className={inputCls} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
            className="tap rounded-full bg-elevated px-3 py-1 text-[11px] font-semibold"
          >
            {sort === "newest" ? "Newest first" : "Oldest first"}
          </button>
          <span className="text-[11px] text-muted-foreground">{total} records</span>
        </div>
      </div>

      {logs.isLoading && <SkeletonList />}
      {!logs.isLoading && (logs.data?.rows ?? []).length === 0 && <Empty text="No audit records match these filters." />}

      <div className="space-y-2">
        {(logs.data?.rows ?? []).map((log) => (
          <AuditRow key={log.id} log={log} />
        ))}
      </div>

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="tap rounded-full border border-border px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-[11px] text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <button
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="tap rounded-full border border-border px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
          {log.action.replace("_", " ")}
        </span>
        <span className="capitalize">{log.target_type}</span>
        <span>· {timeAgo(log.created_at)}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold">{log.target_label ?? log.target_id}</p>
      <div className="mt-1 text-[11px] text-muted-foreground">
        by <span className="text-foreground">@{log.admin_username ?? "admin"}</span> ·{" "}
        {new Date(log.created_at).toLocaleString()}
      </div>
      <button onClick={() => setOpen(!open)} className="tap mt-2 text-[11px] font-semibold text-primary">
        {open ? "Hide changes" : "View changes"}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <StateBlock title="Before" value={log.prev_state} />
          <StateBlock title="After" value={log.new_state} />
        </div>
      )}
    </div>
  );
}

function StateBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-elevated p-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-foreground/80">
        {JSON.stringify(value ?? {}, null, 1)}
      </pre>
    </div>
  );
}

/* --------------------------------- shared ---------------------------------- */

function Action({
  icon: Icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon: typeof Pin;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "tap inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold",
        danger
          ? "border-primary/50 text-primary hover:bg-primary/10"
          : active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-foreground/80 hover:bg-elevated",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>;
}

function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between pt-1">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="tap rounded-full border border-border px-4 py-2 text-xs font-medium disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-[11px] text-muted-foreground">
        Page {page} of {pages} · {total} total
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className="tap rounded-full border border-border px-4 py-2 text-xs font-medium disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

function Confirm({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="surface w-full max-w-sm space-y-3 rounded-t-3xl p-5 sm:rounded-3xl">
        <h2 className="font-display text-base font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="tap h-11 flex-1 rounded-full border border-border text-sm">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={onConfirm}
            className="tap h-11 flex-1 rounded-full bg-destructive text-sm font-bold text-destructive-foreground disabled:opacity-50"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

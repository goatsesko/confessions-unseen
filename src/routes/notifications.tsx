import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/confessions";
import { fetchNotifications, markNotificationsRead } from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Whispr" },
      { name: "description", content: "Replies, mentions, likes, follows and community announcements." },
      { property: "og:title", content: "Notifications — Whispr" },
      { property: "og:description", content: "Replies, mentions and community announcements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

const ICONS: Record<string, string> = {
  reply: "💬",
  mention: "📣",
  like: "❤️",
  follow: "👤",
  message: "✉️",
  community: "👥",
};

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const notifications = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: () => fetchNotifications(user!.id),
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  useEffect(() => {
    if (user && (notifications.data ?? []).some((n) => !n.read_at)) {
      markNotificationsRead(user.id);
    }
  }, [notifications.data, user?.id]);

  if (!user) {
    return (
      <AppShell>
        <h1 className="mb-4 font-display text-xl font-extrabold">Notifications</h1>
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-4xl">🔔</p>
          <p className="font-display font-bold">Sign in to get notified</p>
          <p className="text-sm text-muted-foreground">Replies, mentions, likes and follows land here.</p>
          <Link to="/auth" className="tap rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  const rows = notifications.data ?? [];

  return (
    <AppShell>
      <h1 className="mb-4 font-display text-xl font-extrabold">Notifications</h1>
      {notifications.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="surface flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-4xl">🔔</p>
          <p className="font-display font-bold">All quiet</p>
          <p className="text-sm text-muted-foreground">
            Replies, mentions, likes, follows and community announcements will land here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((n) => (
            <div
              key={n.id}
              className={cn("surface flex items-center gap-3 p-3", !n.read_at && "border-primary/40 bg-primary/5")}
            >
              {n.actor ? (
                <Link to="/u/$username" params={{ username: n.actor.username }} className="tap">
                  <UserAvatar username={n.actor.username} avatarPath={n.actor.avatar_url} size="md" />
                </Link>
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-elevated text-lg">
                  {ICONS[n.kind] ?? "🔔"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {n.actor && (
                    <Link to="/u/$username" params={{ username: n.actor.username }} className="font-semibold">
                      @{n.actor.username}{" "}
                    </Link>
                  )}
                  {n.body}
                </p>
                <p className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
              </div>
              {n.link && (
                <a href={n.link} className="tap text-xs font-bold text-primary">
                  View
                </a>
              )}

            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

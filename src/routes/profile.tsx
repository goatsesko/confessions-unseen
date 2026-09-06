import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Settings, Users } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchCommunities } from "@/lib/api";
import { timeAgo } from "@/lib/confessions";
import { fetchFollowStats, fetchReputation } from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — Comrades Confessions" },
      {
        name: "description",
        content: "Your comrade profile: photo, bio, town, followers, reputation, communities and comments.",
      },
      { property: "og:title", content: "Your profile — Comrades Confessions" },
      { property: "og:description", content: "Your comrade profile. Confessions are never linked to you." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

type Tab = "comments" | "communities";

function ProfilePage() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<Tab>("comments");

  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });
  const mine = (communities.data ?? []).filter((c) => user && c.memberIds.includes(user.id));

  const stats = useQuery({
    queryKey: ["follow-stats", user?.id ?? null, user?.id ?? null],
    enabled: !!user,
    queryFn: () => fetchFollowStats(user!.id, user!.id),
  });

  const reputation = useQuery({
    queryKey: ["reputation", user?.id ?? null],
    enabled: !!user,
    queryFn: () => fetchReputation(user!.id),
  });

  const comments = useQuery({
    queryKey: ["my-comments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, body, created_at, confession_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  if (!user) {
    return (
      <AppShell>
        <div className="surface mt-10 flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-4xl">🎭</p>
          <p className="font-display text-lg font-bold">You're browsing anonymously</p>
          <p className="text-sm text-muted-foreground">Sign in to comment, join communities and message comrades.</p>
          <Link
            to="/auth"
            className="tap rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="surface overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end justify-between">
            <UserAvatar username={profile?.username ?? "me"} avatarPath={profile?.avatar_url} size="lg" />
            <Link
              to="/settings"
              className="tap mb-1 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>

          <h1 className="mt-3 font-display text-xl font-extrabold">@{profile?.username ?? "comrade"}</h1>
          {profile?.display_name && <p className="text-sm text-muted-foreground">{profile.display_name}</p>}
          {profile?.bio && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{profile.bio}</p>}
          {profile?.location && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {profile.location}
            </p>
          )}
          {profile?.username && (
            <Link to="/u/$username" params={{ username: profile.username }} className="tap mt-2 inline-block text-xs text-primary">
              View public profile
            </Link>
          )}

          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-4 text-center">
            <Stat label="Followers" value={stats.data?.followers ?? 0} />
            <Stat label="Following" value={stats.data?.following ?? 0} />
            <Stat label="Reputation" value={reputation.data ?? 0} />
            <Stat label="Communities" value={mine.length} />
          </div>
        </div>
      </section>

      <div className="mt-4 flex gap-2">
        <TabButton active={tab === "comments"} onClick={() => setTab("comments")}>
          Comments
        </TabButton>
        <TabButton active={tab === "communities"} onClick={() => setTab("communities")}>
          Communities
        </TabButton>
      </div>

      <div className="mt-3 space-y-2">
        {tab === "comments" &&
          ((comments.data ?? []).length === 0 ? (
            <Empty text="You haven't commented yet." />
          ) : (
            (comments.data ?? []).map((c) => (
              <div key={c.id} className="surface p-3">
                <p className="text-sm leading-relaxed">{c.body}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{timeAgo(c.created_at)}</p>
              </div>
            ))
          ))}

        {tab === "communities" &&
          (mine.length === 0 ? (
            <Empty text="You haven't joined any community yet." />
          ) : (
            mine.map((c) => (
              <Link
                key={c.id}
                to="/communities/$slug"
                params={{ slug: c.slug }}
                className="surface tap flex items-center gap-3 p-3"
              >
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{c.memberIds.length} members</span>
              </Link>
            ))
          ))}
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Confessions you post anonymously never appear here. Only comments, reposts and communities do.
      </p>
    </AppShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "tap flex-1 rounded-full border px-4 py-2 text-xs font-bold",
        active ? "border-primary text-primary" : "border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

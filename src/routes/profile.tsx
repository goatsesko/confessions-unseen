import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Settings } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchCommunities } from "@/lib/api";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Comrades Confessions" },
      { name: "description", content: "Your comments, communities and reposts. Confessions stay anonymous forever." },
      { property: "og:title", content: "Profile — Comrades Confessions" },
      { property: "og:description", content: "Your comrade profile. Confessions are never linked to you." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile } = useAuth();
  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });
  const mine = (communities.data ?? []).filter((c) => user && c.memberIds.includes(user.id));

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
      <div className="surface p-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-elevated text-xl font-bold uppercase text-primary">
          {(profile?.username ?? "me").slice(0, 2)}
        </div>
        <h1 className="mt-3 font-display text-xl font-extrabold">@{profile?.username ?? "comrade"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{profile?.bio ?? "No bio yet."}</p>
        <div className="mt-4 flex justify-center gap-8 text-sm">
          <Stat label="Communities" value={mine.length} />
          <Stat label="Comments" value={comments.data?.length ?? 0} />
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <button className="tap flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs">
            <Settings className="h-3.5 w-3.5" /> Settings
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="tap flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Confessions you post never appear here. Only comments, reposts and communities do.
      </p>

      <h2 className="mt-5 font-display text-sm font-bold">Your comments</h2>
      <div className="mt-2 space-y-2">
        {(comments.data ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        )}
        {(comments.data ?? []).map((c) => (
          <div key={c.id} className="surface p-3 text-sm">
            {c.body}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

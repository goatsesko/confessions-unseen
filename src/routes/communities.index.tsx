import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { fetchCommunities } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCount } from "@/lib/confessions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/communities/")({
  head: () => ({
    meta: [
      { title: "Communities — Comrades Confessions" },
      { name: "description", content: "Join communities for relationships, campus, work, mental health and more." },
      { property: "og:title", content: "Communities — Comrades Confessions" },
      { property: "og:description", content: "Find the people who get it. Join a confession community." },
    ],
  }),
  component: Communities,
});

function Communities() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"mine" | "explore">("explore");
  const [q, setQ] = useState("");

  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });

  const join = useMutation({
    mutationFn: async ({ id, joined }: { id: string; joined: boolean }) => {
      if (!user) throw new Error("auth");
      if (joined) {
        const { error } = await supabase
          .from("community_members")
          .delete()
          .eq("community_id", id)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_members").insert({ community_id: id, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communities"] }),
    onError: () => toast.error("Sign in to join communities"),
  });

  const list = (communities.data ?? [])
    .filter((c) => (tab === "mine" ? user && c.memberIds.includes(user.id) : true))
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell>
      <div className="mb-3 flex items-center gap-2 rounded-full border border-border bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search communities"
          className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="mb-3 flex gap-1">
        {(["mine", "explore"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "tap relative px-3 pb-2 text-sm font-semibold",
              tab === t ? "text-primary" : "text-muted-foreground",
            )}
          >
            {t === "mine" ? "My Communities" : "Explore"}
            {tab === t && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {tab === "mine" ? "You haven't joined any communities yet." : "No communities match that."}
        </p>
      )}

      <div className="space-y-3">
        {list.map((c) => {
          const joined = !!user && c.memberIds.includes(user.id);
          return (
            <div key={c.id} className="surface flex items-center gap-3 p-4">
              <Link to="/communities/$slug" params={{ slug: c.slug }} className="tap flex min-w-0 flex-1 gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevated text-xl">
                  {c.emoji}
                </span>
                <div className="min-w-0">
                  <p className="font-display font-bold">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatCount(c.memberCount)} members</p>
                  <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                </div>
              </Link>
              <button
                onClick={() => join.mutate({ id: c.id, joined })}
                className={cn(
                  "tap shrink-0 rounded-full px-4 py-1.5 text-xs font-bold",
                  joined ? "border border-border text-muted-foreground" : "bg-primary text-primary-foreground",
                )}
              >
                {joined ? "Joined" : "Join"}
              </button>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

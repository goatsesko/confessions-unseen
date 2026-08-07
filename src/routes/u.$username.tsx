import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Flag, Loader2, MessageCircle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfileByUsername, getOrCreateConversation } from "@/lib/messages";
import { fetchBlock, fetchFollowStats, fetchReputation, reportContent, toggleBlock, toggleFollow } from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Comrades Confessions` },
      {
        name: "description",
        content: `See @${params.username}'s comrade profile and start a private chat. Confessions always stay anonymous.`,
      },
      { property: "og:title", content: `@${params.username} — Comrades Confessions` },
      { property: "og:description", content: `Comrade profile for @${params.username}.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile", username],
    queryFn: () => fetchProfileByUsername(username),
  });

  const targetId = profile.data?.id;

  const stats = useQuery({
    queryKey: ["follow-stats", targetId, user?.id ?? null],
    enabled: !!targetId,
    queryFn: () => fetchFollowStats(targetId!, user?.id ?? null),
  });

  const reputation = useQuery({
    queryKey: ["reputation", targetId],
    enabled: !!targetId,
    queryFn: () => fetchReputation(targetId!),
  });

  const block = useQuery({
    queryKey: ["block", targetId, user?.id ?? null],
    enabled: !!targetId && !!user && targetId !== user.id,
    queryFn: () => fetchBlock(user!.id, targetId!),
  });

  const comments = useQuery({
    queryKey: ["profile-comments", targetId],
    enabled: !!targetId,
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, body, created_at")
        .eq("user_id", targetId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const follow = useMutation({
    mutationFn: () => toggleFollow(user!.id, targetId!, !!stats.data?.followedByMe),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["follow-stats"] }),
    onError: () => toast.error("Couldn't update follow"),
  });

  const blockMutation = useMutation({
    mutationFn: () => toggleBlock(user!.id, targetId!, !!block.data?.iBlocked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["block"] });
      toast.success(block.data?.iBlocked ? "Unblocked" : "Blocked");
    },
  });

  async function message() {
    if (!user) return navigate({ to: "/auth" });
    if (block.data?.iBlocked || block.data?.blockedMe) {
      toast.error("You can't message this comrade");
      return;
    }
    const id = await getOrCreateConversation(user.id, targetId!);
    navigate({ to: "/chat/$id", params: { id } });
  }

  async function report() {
    await reportContent({
      targetType: "user",
      targetId: targetId!,
      reason: "flagged by user",
      reporterId: user?.id ?? null,
    });
    toast.success("Reported. Thanks for keeping it safe.");
  }


  if (profile.isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!profile.data) {
    return (
      <AppShell>
        <div className="surface mt-10 p-10 text-center">
          <p className="font-display font-bold">No comrade called @{username}</p>
          <Link to="/inbox" className="tap mt-3 inline-block text-sm text-primary">
            Back to inbox
          </Link>
        </div>
      </AppShell>
    );
  }

  const p = profile.data;
  const isMe = user?.id === p.id;

  return (
    <AppShell>
      <div className="surface flex flex-col items-center p-5 text-center">
        <UserAvatar username={p.username} avatarPath={p.avatar_url} size="lg" />
        <h1 className="mt-3 font-display text-xl font-extrabold">@{p.username}</h1>
        {p.display_name && <p className="text-sm text-muted-foreground">{p.display_name}</p>}
        <p className="mt-1 text-sm text-muted-foreground">{p.bio ?? "No bio yet."}</p>
        {p.location && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {p.location}
          </p>
        )}
        <div className="mt-4">
          {isMe ? (
            <Link
              to="/profile"
              className="tap rounded-full border border-border px-5 py-2 text-xs font-bold"
            >
              Edit profile
            </Link>
          ) : p.open_to_chat ? (
            <button
              onClick={message}
              className="tap flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
            >
              <MessageCircle className="h-4 w-4" /> Message
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">This comrade has private messages turned off.</p>
          )}
        </div>
      </div>

      <h2 className="mt-5 font-display text-sm font-bold">Comments</h2>
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
      <p className="mt-4 text-xs text-muted-foreground">
        Confessions are never linked to a profile. Only comments show up here.
      </p>
    </AppShell>
  );
}

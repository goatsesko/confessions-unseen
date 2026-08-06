import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/confessions";
import { fetchConversations, getOrCreateConversation, searchProfiles } from "@/lib/messages";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Comrades Confessions" },
      { name: "description", content: "Private real-time chats with the comrades you connect with. Usernames only." },
      { property: "og:title", content: "Inbox — Comrades Confessions" },
      { property: "og:description", content: "Private real-time chats between comrades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

  const conversations = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: () => fetchConversations(user!.id),
  });

  const people = useQuery({
    queryKey: ["people", term],
    enabled: !!user && term.trim().length > 0,
    queryFn: () => searchProfiles(term),
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("inbox-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  async function openChat(peerId: string) {
    if (!user) return;
    const id = await getOrCreateConversation(user.id, peerId);
    navigate({ to: "/chat/$id", params: { id } });
  }

  return (
    <AppShell>
      <h1 className="mb-3 font-display text-xl font-extrabold">Inbox</h1>

      <div className="mb-4 flex items-center gap-2 rounded-full border border-border bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Find a comrade by @username"
          className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {!user ? (
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-4xl">💬</p>
          <p className="font-display font-bold">Sign in to message</p>
          <p className="text-sm text-muted-foreground">
            Chats are private and for signed-in comrades only. Your confessions stay anonymous.
          </p>
          <Link
            to="/auth"
            className="tap rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      ) : term.trim() ? (
        <div className="space-y-2">
          {(people.data ?? []).filter((p) => p.id !== user.id).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No comrade with that username.</p>
          )}
          {(people.data ?? [])
            .filter((p) => p.id !== user.id)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => openChat(p.id)}
                className="surface tap flex w-full items-center gap-3 p-3 text-left"
              >
                <UserAvatar username={p.username} avatarPath={p.avatar_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold">@{p.username}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.location ?? p.bio ?? "Tap to start a private chat"}
                  </p>
                </div>
              </button>
            ))}
        </div>
      ) : (conversations.data ?? []).length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-4xl">🕊️</p>
          <p className="font-display font-bold">No conversations yet</p>
          <p className="text-sm text-muted-foreground">
            Search a @username above, or tap a commenter's avatar to start a private chat.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {(conversations.data ?? []).map((c) => (
            <Link
              key={c.id}
              to="/chat/$id"
              params={{ id: c.id }}
              className="surface tap flex items-center gap-3 p-3"
            >
              <UserAvatar username={c.peer?.username ?? "?"} avatarPath={c.peer?.avatar_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold">@{c.peer?.username ?? "comrade"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.lastMessage?.body || (c.lastMessage?.image_url ? "📷 Photo" : "Say hi")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] text-muted-foreground">{timeAgo(c.last_message_at)}</span>
                {c.unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {c.unread}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

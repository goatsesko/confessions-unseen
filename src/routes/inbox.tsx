import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bell, BellOff, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineUsers } from "@/hooks/useOnline";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/confessions";
import {
  canMessage,
  deleteConversation,
  fetchConversations,
  getOrCreateConversation,
  searchProfiles,
  setConversationPrefs,
  type ConversationSummary,
} from "@/lib/messages";
import { cn } from "@/lib/utils";

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

type Tab = "chats" | "requests" | "archived";

function InboxPage() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<Tab>("chats");

  const conversations = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: () => fetchConversations(user!.id),
  });

  const people = useQuery({
    queryKey: ["people", term],
    enabled: !!user && term.trim().startsWith("@"),
    queryFn: () => searchProfiles(term),
  });

  const online = useOnlineUsers(user?.id ?? null, profile?.show_online !== false);

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
    const peers = people.data ?? [];
    const peer = peers.find((p) => p.id === peerId);
    if (peer) {
      const gate = await canMessage(user.id, peer);
      if (!gate.allowed) {
        toast.error(gate.reason);
        return;
      }
    }
    const id = await getOrCreateConversation(user.id, peerId);
    navigate({ to: "/chat/$id", params: { id } });
  }

  const all = conversations.data ?? [];
  const q = term.trim().toLowerCase();
  const matches = (c: ConversationSummary) =>
    !q ||
    (c.peer?.username ?? "").toLowerCase().includes(q.replace("@", "")) ||
    (c.lastMessage?.body ?? "").toLowerCase().includes(q);

  const chats = all.filter((c) => c.accepted && !c.archived).filter(matches);
  const requests = all.filter((c) => !c.accepted && !c.archived).filter(matches);
  const archived = all.filter((c) => c.archived).filter(matches);
  const list = tab === "chats" ? chats : tab === "requests" ? requests : archived;

  return (
    <AppShell>
      <h1 className="mb-3 font-display text-xl font-extrabold">Inbox</h1>

      <div className="mb-3 flex items-center gap-2 rounded-full border border-border bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search chats, or @username to start one"
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
      ) : term.trim().startsWith("@") ? (
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
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            {(
              [
                ["chats", "Chats", chats.length],
                ["requests", "Requests", requests.length],
                ["archived", "Archived", archived.length],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={cn(
                  "tap rounded-full border px-3.5 py-1.5 text-xs font-semibold",
                  tab === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {label}
                {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
              </button>
            ))}
          </div>

          {conversations.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="surface flex items-center gap-3 p-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-elevated" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-elevated" />
                    <div className="h-3 w-40 animate-pulse rounded bg-elevated" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="surface flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-4xl">{tab === "requests" ? "📨" : tab === "archived" ? "🗂️" : "🕊️"}</p>
              <p className="font-display font-bold">
                {tab === "requests"
                  ? "No message requests"
                  : tab === "archived"
                    ? "Nothing archived"
                    : "No conversations yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                Type <span className="text-primary">@username</span> above, or tap “Message” on a helpful comment.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {list.map((c) => (
                <div key={c.id} className="surface flex items-center gap-3 p-3">
                  <Link
                    to="/chat/$id"
                    params={{ id: c.id }}
                    className="tap flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="relative">
                      <UserAvatar username={c.peer?.username ?? "?"} avatarPath={c.peer?.avatar_url} size="md" />
                      {c.peer && c.peer.show_online !== false && online.includes(c.peer.id) && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-bold">
                        @{c.peer?.username ?? "comrade"} {c.muted && <BellOff className="inline h-3 w-3 opacity-60" />}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.lastMessage?.body ||
                          (c.lastMessage?.image_url
                            ? "📷 Photo"
                            : c.lastMessage?.audio_url
                              ? "🎙️ Voice note"
                              : "Say hi")}
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

                  <div className="flex flex-col gap-1">
                    <button
                      aria-label={c.muted ? "Unmute conversation" : "Mute conversation"}
                      onClick={async () => {
                        await setConversationPrefs(c.id, user.id, { muted: !c.muted });
                        qc.invalidateQueries({ queryKey: ["conversations"] });
                      }}
                      className="tap rounded-full p-1.5 text-muted-foreground hover:bg-elevated"
                    >
                      {c.muted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      aria-label={c.archived ? "Unarchive conversation" : "Archive conversation"}
                      onClick={async () => {
                        await setConversationPrefs(c.id, user.id, { archived: !c.archived });
                        qc.invalidateQueries({ queryKey: ["conversations"] });
                      }}
                      className="tap rounded-full p-1.5 text-muted-foreground hover:bg-elevated"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="Delete conversation"
                      onClick={async () => {
                        if (!confirm("Delete this conversation from your inbox?")) return;
                        await deleteConversation(c.id, user.id);
                        qc.invalidateQueries({ queryKey: ["conversations"] });
                        toast.success("Conversation deleted");
                      }}
                      className="tap rounded-full p-1.5 text-muted-foreground hover:bg-elevated"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCheck, ImagePlus, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatar, fetchConversation, markRead, sendMessage, uploadImage } from "@/lib/messages";
import { timeAgo } from "@/lib/confessions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat/$id")({
  head: () => ({
    meta: [
      { title: "Chat — Comrades Confessions" },
      { name: "description", content: "A private, real-time conversation with a comrade. Usernames only." },
      { property: "og:title", content: "Chat — Comrades Confessions" },
      { property: "og:description", content: "Private real-time messaging between comrades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = ["chat", id, user?.id ?? null];
  const chat = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: () => fetchConversation(id, user!.id),
  });

  // Realtime: new/updated messages + typing broadcasts.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat:${id}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["chat", id] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          markRead(id, user.id);
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.userId === user.id) return;
        setPeerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), 2500);
      })
      .subscribe();
    typingChannel.current = channel;
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      supabase.removeChannel(channel);
      typingChannel.current = null;
    };
  }, [id, user?.id, qc]);

  useEffect(() => {
    if (user && chat.data) markRead(id, user.id).then(() => qc.invalidateQueries({ queryKey: ["conversations"] }));
  }, [chat.data, id, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.data?.messages.length, peerTyping]);

  const send = useMutation({
    mutationFn: async (imageUrl?: string | null) => {
      const body = draft.trim();
      if (!body && !imageUrl) return;
      await sendMessage({ conversationId: id, senderId: user!.id, body, imageUrl });
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["chat", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Message didn't send"),
  });

  function onType(value: string) {
    setDraft(value);
    typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { userId: user?.id } });
  }

  async function pickImage(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const path = await uploadImage(user.id, file, "chat");
      const url = await resolveAvatar(path);
      await send.mutateAsync(url);
    } catch {
      toast.error("Couldn't upload that image");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    navigate({ to: "/auth" });
    return null;
  }

  const peer = chat.data?.peer;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link to="/inbox" aria-label="Back to inbox" className="tap -ml-2 rounded-full p-2 hover:bg-elevated">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {peer && (
            <Link to="/u/$username" params={{ username: peer.username }} className="tap flex items-center gap-3">
              <UserAvatar username={peer.username} avatarPath={peer.avatar_url} />
              <div>
                <p className="font-display text-sm font-bold leading-tight">@{peer.username}</p>
                <p className="text-[11px] text-muted-foreground">
                  {peerTyping ? <span className="text-primary">typing…</span> : (peer.location ?? "comrade")}
                </p>
              </div>
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-2 px-4 pb-32 pt-4">
        {chat.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (chat.data?.messages ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Say hi. This chat is private — only the two of you can read it.
          </p>
        ) : (
          (chat.data?.messages ?? []).map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                  )}
                >
                  {m.image_url && (
                    <img src={m.image_url} alt="Shared" className="mb-1.5 max-h-64 rounded-xl object-cover" />
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <span
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {timeAgo(m.created_at)}
                    {mine &&
                      (m.read_at ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        {peerTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl bg-card px-3.5 py-3">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  style={{ animationDelay: `${d}ms` }}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4">
          <label className="tap flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])}
            />
          </label>
          <input
            value={draft}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft.trim() && send.mutate(null)}
            placeholder="Message…"
            className="h-11 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            disabled={!draft.trim() || send.isPending}
            onClick={() => send.mutate(null)}
            aria-label="Send message"
            className="tap flex h-11 w-11 items-center justify-center rounded-full bg-primary disabled:opacity-40"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
            ) : (
              <Send className="h-4 w-4 text-primary-foreground" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

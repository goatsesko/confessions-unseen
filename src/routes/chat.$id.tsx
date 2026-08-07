import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  Flag,
  ImagePlus,
  Loader2,
  Mic,
  Phone,
  Send,
  Square,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptConversation,
  fetchConversation,
  fetchMessageReactions,
  markRead,
  resolveAvatar,
  sendMessage,
  toggleMessageReaction,
  uploadImage,
} from "@/lib/messages";
import { fetchBlock, reportContent, toggleBlock } from "@/lib/social";
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

const EMOJIS = ["❤️", "😂", "😢", "😳", "🔥", "🤝"];

function ChatPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  const key = ["chat", id, user?.id ?? null];
  const chat = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: () => fetchConversation(id, user!.id),
  });

  const peer = chat.data?.peer;

  const reactions = useQuery({
    queryKey: ["message-reactions", id],
    enabled: !!user,
    queryFn: () => fetchMessageReactions(id),
  });

  const block = useQuery({
    queryKey: ["block", peer?.id, user?.id ?? null],
    enabled: !!peer && !!user,
    queryFn: () => fetchBlock(user!.id, peer!.id),
  });

  const membership = useQuery({
    queryKey: ["membership", id, user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_members")
        .select("accepted")
        .eq("conversation_id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  // Realtime: messages, reactions, typing broadcasts and presence.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat:${id}`, { config: { broadcast: { self: false }, presence: { key: user.id } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["chat", id] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          markRead(id, user.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["message-reactions", id] }),
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.userId === user.id) return;
        setPeerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), 2500);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPeerOnline(Object.keys(state).some((k) => k !== user.id));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ userId: user.id, at: Date.now() });
      });
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
    mutationFn: async (media?: { imageUrl?: string | null; audioUrl?: string | null } | null) => {
      const body = draft.trim();
      if (!body && !media?.imageUrl && !media?.audioUrl) return;
      await sendMessage({
        conversationId: id,
        senderId: user!.id,
        body,
        imageUrl: media?.imageUrl ?? null,
        audioUrl: media?.audioUrl ?? null,
        peerId: peer?.id ?? null,
      });
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["chat", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Message didn't send"),
  });

  const react = useMutation({
    mutationFn: (input: { messageId: string; emoji: string; active: boolean }) =>
      toggleMessageReaction({ ...input, conversationId: id, userId: user!.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["message-reactions", id] }),
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
      await send.mutateAsync({ imageUrl: url });
    } catch {
      toast.error("Couldn't upload that image");
    } finally {
      setUploading(false);
    }
  }

  async function toggleRecording() {
    if (!user) return;
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setUploading(true);
        try {
          const path = await uploadImage(user.id, new Blob(chunks, { type: "audio/webm" }), "voice");
          const url = await resolveAvatar(path);
          await send.mutateAsync({ audioUrl: url });
        } catch {
          toast.error("Couldn't send that voice note");
        } finally {
          setUploading(false);
        }
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied");
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

  const blocked = !!block.data?.iBlocked || !!block.data?.blockedMe;
  const needsAccept = membership.data?.accepted === false;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link to="/inbox" aria-label="Back to inbox" className="tap -ml-2 rounded-full p-2 hover:bg-elevated">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {peer && (
            <>
              <Link to="/u/$username" params={{ username: peer.username }} className="tap flex items-center gap-3">
                <div className="relative">
                  <UserAvatar username={peer.username} avatarPath={peer.avatar_url} />
                  {peerOnline && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                  )}
                </div>
                <div>
                  <p className="font-display text-sm font-bold leading-tight">@{peer.username}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {peerTyping ? (
                      <span className="text-primary">typing…</span>
                    ) : peerOnline ? (
                      "online"
                    ) : (
                      (peer.location ?? "comrade")
                    )}
                  </p>
                </div>
              </Link>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => toast("Voice calls are a premium feature — coming soon")}
                  aria-label="Voice call (coming soon)"
                  className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  onClick={() => toast("Video calls are a premium feature — coming soon")}
                  aria-label="Video call (coming soon)"
                  className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                >
                  <Video className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    await toggleBlock(user.id, peer.id, !!block.data?.iBlocked);
                    qc.invalidateQueries({ queryKey: ["block"] });
                    toast.success(block.data?.iBlocked ? "Unblocked" : "Blocked");
                  }}
                  aria-label="Block comrade"
                  className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                >
                  <Ban className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    await reportContent({
                      targetType: "user",
                      targetId: peer.id,
                      reason: "reported from chat",
                      reporterId: user.id,
                    });
                    toast.success("Reported");
                  }}
                  aria-label="Report comrade"
                  className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                >
                  <Flag className="h-4 w-4" />
                </button>
              </div>
            </>
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
            const mineReactions = (reactions.data ?? []).filter((r) => r.message_id === m.id);
            const grouped = EMOJIS.map((e) => ({
              emoji: e,
              count: mineReactions.filter((r) => r.emoji === e).length,
              active: mineReactions.some((r) => r.emoji === e && r.user_id === user.id),
            })).filter((g) => g.count > 0);
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <button
                  onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-left text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                  )}
                >
                  {m.image_url && (
                    <img src={m.image_url} alt="Shared" className="mb-1.5 max-h-64 rounded-xl object-cover" />
                  )}
                  {m.audio_url && <audio controls src={m.audio_url} className="mb-1.5 h-9 w-56 max-w-full" />}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <span
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {timeAgo(m.created_at)}
                    {mine && (m.read_at ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                  </span>
                </button>

                {grouped.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {grouped.map((g) => (
                      <button
                        key={g.emoji}
                        onClick={() => react.mutate({ messageId: m.id, emoji: g.emoji, active: g.active })}
                        className={cn(
                          "tap rounded-full border px-2 py-0.5 text-[11px]",
                          g.active ? "border-primary text-primary" : "border-border text-muted-foreground",
                        )}
                      >
                        {g.emoji} {g.count}
                      </button>
                    ))}
                  </div>
                )}

                {pickerFor === m.id && (
                  <div className="surface mt-1 flex gap-1 p-1.5">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => {
                          react.mutate({
                            messageId: m.id,
                            emoji: e,
                            active: mineReactions.some((r) => r.emoji === e && r.user_id === user.id),
                          });
                          setPickerFor(null);
                        }}
                        className="tap rounded-full px-1.5 text-lg"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
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
        <div className="mx-auto max-w-2xl px-4">
          {blocked ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Messaging is unavailable — one of you blocked the other.
            </p>
          ) : needsAccept ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-xs text-muted-foreground">Message request from @{peer?.username}</p>
              <button
                onClick={async () => {
                  await acceptConversation(id, user.id);
                  qc.invalidateQueries({ queryKey: ["membership", id] });
                  qc.invalidateQueries({ queryKey: ["conversations"] });
                }}
                className="tap rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
              >
                Accept
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="tap flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])}
                />
              </label>
              <button
                onClick={toggleRecording}
                aria-label={recording ? "Stop recording" : "Record voice note"}
                className={cn(
                  "tap flex h-11 w-11 items-center justify-center rounded-full border",
                  recording ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
              >
                {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
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
          )}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  Eraser,
  Flag,
  Forward,
  ImagePlus,
  Loader2,
  Mic,
  MoreVertical,
  Pause,
  Phone,
  Play,
  Search,
  Send,
  Square,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ReportDialog } from "@/components/ReportDialog";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineUsers } from "@/hooks/useOnline";
import { supabase } from "@/integrations/supabase/client";
import { CALL_COMING_SOON } from "@/lib/calls";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  acceptConversation,
  compressImage,
  deleteConversation,
  deleteMessage,
  fetchConversation,
  fetchConversations,
  fetchMessageReactions,
  forwardMessage,
  markDelivered,
  markRead,
  resolveAvatar,
  sendMessage,
  setConversationPrefs,
  toggleMessageReaction,
  uploadImage,
  type Message,
} from "@/lib/messages";
import { fetchBlock, toggleBlock } from "@/lib/social";
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

const EMOJIS = ["❤️", "😂", "😢", "😮", "🔥", "👍"];
const QUICK_EMOJIS = ["😂", "❤️", "🔥", "😭", "😳", "🙏", "😅", "💀", "🥺", "👀"];

function ChatPage() {
  const { id } = Route.useParams();
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [draft, setDraft] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [needle, setNeedle] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState<{ type: "user" | "message"; id: string } | null>(null);
  const [optimistic, setOptimistic] = useState<Message[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const chat = useQuery({
    queryKey: ["chat", id, user?.id ?? null],
    enabled: !!user,
    queryFn: () => fetchConversation(id, user!.id),
  });
  const peer = chat.data?.peer;
  const membership = chat.data?.membership;

  const conversations = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: () => fetchConversations(user!.id),
  });

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

  const online = useOnlineUsers(user?.id ?? null, profile?.show_online !== false);
  const peerOnline = !!peer && peer.show_online !== false && online.includes(peer.id);

  // Realtime: messages, reactions and typing broadcasts.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat:${id}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => {
          setOptimistic([]);
          qc.invalidateQueries({ queryKey: ["chat", id] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          markDelivered(id, user.id);
          markRead(id, user.id, profile?.show_read_receipts !== false);
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
      .subscribe();
    typingChannel.current = channel;
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      supabase.removeChannel(channel);
      typingChannel.current = null;
    };
  }, [id, user?.id, qc, profile?.show_read_receipts]);

  useEffect(() => {
    if (!user || !chat.data) return;
    markDelivered(id, user.id);
    markRead(id, user.id, profile?.show_read_receipts !== false).then(() =>
      qc.invalidateQueries({ queryKey: ["conversations"] }),
    );
  }, [chat.data, id, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.data?.messages.length, optimistic.length, peerTyping]);

  const messages = useMemo(() => {
    const base = [...(chat.data?.messages ?? []), ...optimistic];
    if (!needle.trim()) return base;
    return base.filter((m) => m.body.toLowerCase().includes(needle.trim().toLowerCase()));
  }, [chat.data?.messages, optimistic, needle]);

  const send = useMutation({
    mutationFn: async (media?: { imageUrl?: string | null; audioUrl?: string | null } | null) => {
      const body = draft.trim();
      if (!body && !media?.imageUrl && !media?.audioUrl) return;
      const temp: Message = {
        id: `tmp-${Date.now()}`,
        conversation_id: id,
        sender_id: user!.id,
        body,
        image_url: media?.imageUrl ?? null,
        audio_url: media?.audioUrl ?? null,
        reply_to_id: replyTo?.id ?? null,
        read_at: null,
        delivered_at: null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      setOptimistic((prev) => [...prev, temp]);
      setDraft("");
      const currentReply = replyTo;
      setReplyTo(null);
      try {
        await sendMessage({
          conversationId: id,
          senderId: user!.id,
          body,
          imageUrl: media?.imageUrl ?? null,
          audioUrl: media?.audioUrl ?? null,
          peerId: peer?.id ?? null,
          replyToId: currentReply?.id ?? null,
        });
      } catch (e) {
        setOptimistic((prev) => prev.filter((m) => m.id !== temp.id));
        throw e;
      }
    },
    onSuccess: () => {
      setOptimistic([]);
      qc.invalidateQueries({ queryKey: ["chat", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message || "Message didn't send"),
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

  function stageImage(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, WEBP or GIF images");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That image is larger than 5MB");
      return;
    }
    setPendingImage({ file, preview: URL.createObjectURL(file) });
  }

  async function sendStagedImage() {
    if (!user || !pendingImage) return;
    setUploading(true);
    try {
      const blob = await compressImage(pendingImage.file);
      const path = await uploadImage(user.id, blob, "chat");
      const url = await resolveAvatar(path);
      setPendingImage(null);
      await send.mutateAsync({ imageUrl: url });
    } catch {
      toast.error("Couldn't upload that image");
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    if (!user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        if ((rec as MediaRecorder & { cancelled?: boolean }).cancelled) return;
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
      setPaused(false);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone permission denied");
    }
  }

  function stopRecording(cancel = false) {
    const rec = recorder.current as (MediaRecorder & { cancelled?: boolean }) | null;
    if (!rec) return;
    rec.cancelled = cancel;
    rec.stop();
    setRecording(false);
    setPaused(false);
    if (timer.current) clearInterval(timer.current);
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
  const needsAccept = membership?.accepted === false;
  const canImage = peer?.allow_images !== false;
  const canVoice = peer?.allow_voice !== false;
  const findMessage = (mid: string | null) =>
    mid ? (chat.data?.messages ?? []).find((m) => m.id === mid) ?? null : null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop conversation rail */}
      <aside className="hidden w-80 shrink-0 border-r border-border md:block">
        <div className="sticky top-0 max-h-screen overflow-y-auto p-3">
          <p className="mb-2 px-1 font-display text-sm font-bold">Chats</p>
          {(conversations.data ?? [])
            .filter((c) => c.accepted && !c.archived)
            .map((c) => (
              <Link
                key={c.id}
                to="/chat/$id"
                params={{ id: c.id }}
                className={cn(
                  "tap mb-1 flex items-center gap-3 rounded-2xl p-2.5",
                  c.id === id ? "bg-elevated" : "hover:bg-card",
                )}
              >
                <UserAvatar username={c.peer?.username ?? "?"} avatarPath={c.peer?.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold">@{c.peer?.username ?? "comrade"}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.lastMessage?.body || "…"}</p>
                </div>
                {c.unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {c.unread}
                  </span>
                )}
              </Link>
            ))}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="glass sticky top-0 z-40 border-b border-border">
          <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
            <Link to="/inbox" aria-label="Back to inbox" className="tap -ml-2 rounded-full p-2 hover:bg-elevated md:hidden">
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
                        <span className="text-primary">@{peer.username} is typing…</span>
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
                    onClick={() => setShowSearch((s) => !s)}
                    aria-label="Search this conversation"
                    className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toast(CALL_COMING_SOON)}
                    aria-label="Voice call (coming soon)"
                    className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toast(CALL_COMING_SOON)}
                    aria-label="Video call (coming soon)"
                    className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setMenuOpen((m) => !m)}
                    aria-label="Conversation options"
                    className="tap rounded-full p-2 text-muted-foreground hover:bg-elevated"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          {showSearch && (
            <div className="mx-auto max-w-2xl px-4 pb-3">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={needle}
                  onChange={(e) => setNeedle(e.target.value)}
                  placeholder="Search in this chat"
                  className="h-10 flex-1 bg-transparent text-sm outline-none"
                />
                {needle && (
                  <button onClick={() => setNeedle("")} className="tap text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {menuOpen && peer && (
            <div className="mx-auto max-w-2xl px-4 pb-3">
              <div className="surface grid grid-cols-2 gap-1 p-2 text-sm">
                <MenuItem
                  icon={<Archive className="h-4 w-4" />}
                  label="Archive chat"
                  onClick={async () => {
                    await setConversationPrefs(id, user.id, { archived: true });
                    qc.invalidateQueries({ queryKey: ["conversations"] });
                    setMenuOpen(false);
                    toast.success("Archived");
                    navigate({ to: "/inbox" });
                  }}
                />
                <MenuItem
                  icon={<Eraser className="h-4 w-4" />}
                  label="Clear chat"
                  onClick={async () => {
                    if (!confirm("Clear this chat for you? The other person keeps their copy.")) return;
                    await setConversationPrefs(id, user.id, { cleared_at: new Date().toISOString() });
                    qc.invalidateQueries({ queryKey: ["chat", id] });
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<Ban className="h-4 w-4" />}
                  label={block.data?.iBlocked ? "Unblock" : "Block user"}
                  onClick={async () => {
                    await toggleBlock(user.id, peer.id, !!block.data?.iBlocked);
                    qc.invalidateQueries({ queryKey: ["block"] });
                    setMenuOpen(false);
                    toast.success(block.data?.iBlocked ? "Unblocked" : "Blocked");
                  }}
                />
                <MenuItem
                  icon={<Flag className="h-4 w-4" />}
                  label="Report user"
                  onClick={() => {
                    setReporting({ type: "user", id: peer.id });
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<Trash2 className="h-4 w-4" />}
                  label="Delete conversation"
                  onClick={async () => {
                    if (!confirm("Delete this conversation from your inbox?")) return;
                    await deleteConversation(id, user.id);
                    qc.invalidateQueries({ queryKey: ["conversations"] });
                    navigate({ to: "/inbox" });
                  }}
                />
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1 space-y-2 px-4 pb-40 pt-4">
          {chat.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                  <div className="h-10 w-40 animate-pulse rounded-2xl bg-elevated" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {needle ? "No messages match that search." : "Say hi. This chat is private — only the two of you can read it."}
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user.id;
              const rows = (reactions.data ?? []).filter((r) => r.message_id === m.id);
              const grouped = EMOJIS.map((e) => ({
                emoji: e,
                count: rows.filter((r) => r.emoji === e).length,
                active: rows.some((r) => r.emoji === e && r.user_id === user.id),
              })).filter((g) => g.count > 0);
              const quoted = findMessage(m.reply_to_id);
              return (
                <div key={m.id} className={cn("group flex flex-col", mine ? "items-end" : "items-start")}>
                  <button
                    onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2 text-left text-sm transition-transform active:scale-[0.99]",
                      mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                    )}
                  >
                    {quoted && (
                      <div
                        className={cn(
                          "mb-1.5 rounded-xl border-l-2 px-2 py-1 text-[11px]",
                          mine ? "border-primary-foreground/60 bg-black/15" : "border-primary bg-elevated",
                        )}
                      >
                        <span className="font-semibold">
                          @{quoted.sender_id === user.id ? (profile?.username ?? "you") : (peer?.username ?? "comrade")}
                        </span>
                        <p className="truncate opacity-80">
                          {quoted.body || (quoted.image_url ? "📷 Photo" : "🎙️ Voice note")}
                        </p>
                      </div>
                    )}
                    {m.image_url && (
                      <img
                        src={m.image_url}
                        alt="Shared"
                        loading="lazy"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewer(m.image_url);
                        }}
                        className="mb-1.5 max-h-64 cursor-zoom-in rounded-xl object-cover"
                      />
                    )}
                    {m.audio_url && <VoiceNote src={m.audio_url} mine={mine} />}
                    {m.body && <Highlighted text={m.body} needle={needle} />}
                    <span
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px]",
                        mine ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {m.pending ? "Sending…" : timeAgo(m.created_at)}
                      {mine &&
                        !m.pending &&
                        (m.read_at ? (
                          <CheckCheck className="h-3 w-3" />
                        ) : m.delivered_at ? (
                          <CheckCheck className="h-3 w-3 opacity-60" />
                        ) : (
                          <Check className="h-3 w-3" />
                        ))}
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

                  {pickerFor === m.id && !m.pending && (
                    <div className="surface mt-1 flex flex-wrap items-center gap-1 p-1.5">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            react.mutate({
                              messageId: m.id,
                              emoji: e,
                              active: rows.some((r) => r.emoji === e && r.user_id === user.id),
                            });
                            setPickerFor(null);
                          }}
                          className="tap rounded-full px-1.5 text-lg"
                        >
                          {e}
                        </button>
                      ))}
                      <span className="mx-1 h-4 w-px bg-border" />
                      <IconAction icon={<CornerUpLeft className="h-3.5 w-3.5" />} label="Reply" onClick={() => { setReplyTo(m); setPickerFor(null); }} />
                      <IconAction
                        icon={<Copy className="h-3.5 w-3.5" />}
                        label="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(m.body);
                          toast.success("Copied");
                          setPickerFor(null);
                        }}
                      />
                      <IconAction icon={<Forward className="h-3.5 w-3.5" />} label="Forward" onClick={() => { setForwarding(m); setPickerFor(null); }} />
                      {mine ? (
                        <IconAction
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          label="Delete"
                          onClick={async () => {
                            await deleteMessage(m.id);
                            qc.invalidateQueries({ queryKey: ["chat", id] });
                            setPickerFor(null);
                          }}
                        />
                      ) : (
                        <IconAction
                          icon={<Flag className="h-3.5 w-3.5" />}
                          label="Report"
                          onClick={() => {
                            setReporting({ type: "message", id: m.id });
                            setPickerFor(null);
                          }}
                        />
                      )}
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

        <div className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 md:left-80">
          <div className="mx-auto max-w-2xl px-4">
            {blocked ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Messaging is unavailable — one of you blocked the other.
              </p>
            ) : needsAccept ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-xs text-muted-foreground">Message request from @{peer?.username}</p>
                <button
                  onClick={async () => {
                    await acceptConversation(id, user.id);
                    qc.invalidateQueries({ queryKey: ["chat", id] });
                    qc.invalidateQueries({ queryKey: ["conversations"] });
                  }}
                  className="tap rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
                >
                  Accept
                </button>
                <button
                  onClick={async () => {
                    await deleteConversation(id, user.id);
                    navigate({ to: "/inbox" });
                  }}
                  className="tap rounded-full border border-border px-4 py-2 text-sm"
                >
                  Delete
                </button>
                {peer && (
                  <>
                    <button
                      onClick={async () => {
                        await toggleBlock(user.id, peer.id, false);
                        qc.invalidateQueries({ queryKey: ["block"] });
                        toast.success("Blocked");
                      }}
                      className="tap rounded-full border border-border px-4 py-2 text-sm"
                    >
                      Block
                    </button>
                    <button
                      onClick={() => setReporting({ type: "user", id: peer.id })}
                      className="tap rounded-full border border-border px-4 py-2 text-sm"
                    >
                      Report
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {replyTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-primary bg-card px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-primary">
                        @{replyTo.sender_id === user.id ? (profile?.username ?? "you") : (peer?.username ?? "comrade")}
                      </p>
                      <p className="truncate text-muted-foreground">
                        {replyTo.body || (replyTo.image_url ? "📷 Photo" : "🎙️ Voice note")}
                      </p>
                    </div>
                    <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="tap">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                )}

                {pendingImage && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                    <img src={pendingImage.preview} alt="Preview" className="h-16 w-16 rounded-lg object-cover" />
                    <p className="flex-1 text-xs text-muted-foreground">Ready to send</p>
                    <button onClick={() => setPendingImage(null)} className="tap rounded-full border border-border px-3 py-1.5 text-xs">
                      Cancel
                    </button>
                    <button
                      disabled={uploading}
                      onClick={sendStagedImage}
                      className="tap rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                    >
                      {uploading ? "Uploading…" : "Send"}
                    </button>
                  </div>
                )}

                {recording && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-primary/40 bg-card p-2 text-xs">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                    <span className="font-mono">{formatDuration(seconds)}</span>
                    <div className="flex flex-1 items-center gap-0.5">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <span
                          key={i}
                          className="w-1 rounded bg-primary/60"
                          style={{ height: `${6 + ((i * 7 + seconds * 3) % 16)}px` }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        if (paused) recorder.current?.resume();
                        else recorder.current?.pause();
                        setPaused((p) => !p);
                      }}
                      className="tap rounded-full border border-border p-1.5"
                      aria-label={paused ? "Resume recording" : "Pause recording"}
                    >
                      {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => stopRecording(true)} className="tap rounded-full border border-border px-3 py-1">
                      Cancel
                    </button>
                    <button
                      onClick={() => stopRecording(false)}
                      className="tap rounded-full bg-primary px-3 py-1 font-bold text-primary-foreground"
                    >
                      Send
                    </button>
                  </div>
                )}

                {showEmoji && (
                  <div className="surface mb-2 flex flex-wrap gap-1 p-2">
                    {QUICK_EMOJIS.map((e) => (
                      <button key={e} onClick={() => onType(draft + e)} className="tap px-1.5 text-xl">
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {canImage && (
                    <label className="tap flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      <input
                        type="file"
                        accept="image/*"
                        capture={undefined}
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && stageImage(e.target.files[0])}
                      />
                    </label>
                  )}
                  {canVoice && (
                    <button
                      onClick={() => (recording ? stopRecording(false) : startRecording())}
                      aria-label={recording ? "Stop recording" : "Record voice note"}
                      className={cn(
                        "tap flex h-11 w-11 items-center justify-center rounded-full border",
                        recording ? "border-primary text-primary" : "border-border text-muted-foreground",
                      )}
                    >
                      {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => setShowEmoji((s) => !s)}
                    aria-label="Emoji"
                    className="tap hidden h-11 w-11 items-center justify-center rounded-full border border-border text-lg sm:flex"
                  >
                    😊
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
              </>
            )}
          </div>
        </div>
      </div>

      {viewer && (
        <div
          onClick={() => setViewer(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
        >
          <img src={viewer} alt="Full size" className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}

      {forwarding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
          <div className="surface max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-3xl p-4 sm:rounded-3xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Forward to</h2>
              <button onClick={() => setForwarding(null)} className="tap">
                <X className="h-4 w-4" />
              </button>
            </div>
            {(conversations.data ?? [])
              .filter((c) => c.id !== id && c.accepted)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    await forwardMessage({
                      message: forwarding,
                      toConversationId: c.id,
                      senderId: user.id,
                      peerId: c.peer?.id ?? null,
                    });
                    setForwarding(null);
                    toast.success(`Forwarded to @${c.peer?.username ?? "comrade"}`);
                  }}
                  className="tap flex w-full items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-elevated"
                >
                  <UserAvatar username={c.peer?.username ?? "?"} avatarPath={c.peer?.avatar_url} />
                  <span className="font-display text-sm font-bold">@{c.peer?.username ?? "comrade"}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      <ReportDialog
        open={!!reporting}
        onClose={() => setReporting(null)}
        targetType={reporting?.type ?? "user"}
        targetId={reporting?.id ?? ""}
        reporterId={user.id}
        label={reporting?.type === "message" ? "this message" : `@${peer?.username ?? "comrade"}`}
      />
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="tap flex items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-elevated">
      {icon}
      {label}
    </button>
  );
}

function IconAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="tap flex items-center gap-1 rounded-full px-2 py-1 text-[11px] hover:bg-elevated">
      {icon}
      {label}
    </button>
  );
}

function Highlighted({ text, needle }: { text: string; needle: string }) {
  if (!needle.trim()) return <p className="whitespace-pre-wrap break-words">{text}</p>;
  const parts = text.split(new RegExp(`(${needle.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.toLowerCase() === needle.trim().toLowerCase() ? (
          <mark key={i} className="rounded bg-primary/40 text-inherit">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function VoiceNote({ src, mine }: { src: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  return (
    <div className={cn("mb-1.5 flex w-56 max-w-full items-center gap-2 rounded-xl px-2 py-1.5", mine ? "bg-black/15" : "bg-elevated")}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          const a = audioRef.current;
          if (!a) return;
          if (playing) a.pause();
          else a.play();
          setPlaying(!playing);
        }}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="tap flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div className="flex flex-1 items-center gap-0.5">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className={cn("w-1 rounded", i / 20 <= progress ? "bg-primary" : "bg-muted-foreground/40")}
            style={{ height: `${6 + ((i * 5) % 14)}px` }}
          />
        ))}
      </div>
      <span className="text-[10px] tabular-nums opacity-70">{formatDuration(Math.round(duration || 0))}</span>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        className="hidden"
      />
    </div>
  );
}

function formatDuration(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

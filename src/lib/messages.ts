import { supabase } from "@/integrations/supabase/client";
import { notify } from "./social";

export type MessagePrivacy = "everyone" | "followers" | "following" | "nobody";

export type ChatProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  open_to_chat: boolean;
  msg_privacy: MessagePrivacy;
  show_online: boolean;
  show_read_receipts: boolean;
  allow_images: boolean;
  allow_voice: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  audio_url: string | null;
  reply_to_id: string | null;
  read_at: string | null;
  delivered_at: string | null;
  created_at: string;
  /** client-only, used for optimistic UI */
  pending?: boolean;
};

export type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

export type ConversationSummary = {
  id: string;
  last_message_at: string;
  peer: ChatProfile | null;
  lastMessage: Message | null;
  unread: number;
  accepted: boolean;
  muted: boolean;
  archived: boolean;
};

const PROFILE_COLS =
  "id, username, display_name, avatar_url, bio, location, open_to_chat, msg_privacy, show_online, show_read_receipts, allow_images, allow_voice";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Simple client-side flood guard: no more than 10 messages per 10 seconds. */
const SEND_WINDOW_MS = 10_000;
const SEND_LIMIT = 10;
let sendTimestamps: number[] = [];

/** Signed URLs for the private avatars bucket, cached per path. */
const signedCache = new Map<string, string>();

export async function resolveAvatar(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const cached = signedCache.get(path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24);
  if (!data?.signedUrl) return null;
  signedCache.set(path, data.signedUrl);
  return data.signedUrl;
}

/** Downscales an image in-browser before upload to keep storage & bandwidth low. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadImage(userId: string, file: File | Blob, folder: "avatar" | "chat" | "voice") {
  const ext =
    (file instanceof File ? file.name.split(".").pop()?.toLowerCase() : null) ?? (folder === "voice" ? "webm" : "jpg");
  const path = `${userId}/${folder}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function fetchProfileByUsername(username: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data as ChatProfile) ?? null;
}

export async function fetchProfileById(id: string) {
  const { data } = await supabase.from("profiles").select(PROFILE_COLS).eq("id", id).maybeSingle();
  return (data as ChatProfile) ?? null;
}

export async function updateProfile(userId: string, patch: Partial<ChatProfile>) {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_COLS)
    .single();
  if (error) throw error;
  return data as ChatProfile;
}

export async function searchProfiles(term: string) {
  const q = term.trim().replace(/^@/, "");
  let query = supabase.from("profiles").select(PROFILE_COLS).limit(20);
  if (q) query = query.ilike("username", `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChatProfile[];
}

/* --------------------------- messaging permissions -------------------------- */

/** Enforces the recipient's "Who can message me?" setting plus blocks. */
export async function canMessage(viewerId: string, peer: ChatProfile) {
  if (viewerId === peer.id) return { allowed: false, reason: "That's you." };

  const { data: blocks } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${viewerId},blocked_id.eq.${peer.id}),and(blocker_id.eq.${peer.id},blocked_id.eq.${viewerId})`,
    );
  if ((blocks ?? []).length > 0) return { allowed: false, reason: "Messaging is unavailable between you two." };

  const privacy = (peer.msg_privacy ?? "everyone") as MessagePrivacy;
  if (privacy === "nobody" || peer.open_to_chat === false)
    return { allowed: false, reason: `@${peer.username} isn't accepting messages.` };

  if (privacy === "followers") {
    const { data } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", viewerId)
      .eq("following_id", peer.id)
      .maybeSingle();
    if (!data) return { allowed: false, reason: `@${peer.username} only accepts messages from followers.` };
  }
  if (privacy === "following") {
    const { data } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", peer.id)
      .eq("following_id", viewerId)
      .maybeSingle();
    if (!data) return { allowed: false, reason: `@${peer.username} only accepts messages from people they follow.` };
  }
  return { allowed: true, reason: "" };
}

/** Returns an existing 1:1 conversation with `peerId`, or creates one. */
export async function getOrCreateConversation(userId: string, peerId: string) {
  const { data: mine, error } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);
  if (error) throw error;
  const ids = (mine ?? []).map((m) => m.conversation_id);

  if (ids.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", peerId)
      .in("conversation_id", ids);
    const existing = shared?.[0]?.conversation_id;
    if (existing) return existing;
  }

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .insert({})
    .select("id")
    .single();
  if (convError) throw convError;

  // Unknown senders land in the recipient's Message Requests until accepted.
  const { data: follow } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", peerId)
    .eq("following_id", userId)
    .maybeSingle();

  const { error: memberError } = await supabase.from("conversation_members").insert([
    { conversation_id: conv.id, user_id: userId, accepted: true },
    { conversation_id: conv.id, user_id: peerId, accepted: !!follow },
  ]);
  if (memberError) throw memberError;
  return conv.id as string;
}

export async function fetchConversations(userId: string): Promise<ConversationSummary[]> {
  const { data: memberships, error } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at, accepted, muted, archived, cleared_at")
    .eq("user_id", userId);
  if (error) throw error;
  const ids = (memberships ?? []).map((m) => m.conversation_id);
  if (ids.length === 0) return [];

  const [{ data: convs }, { data: peersRows }, { data: msgs }] = await Promise.all([
    supabase.from("conversations").select("id, last_message_at").in("id", ids),
    supabase.from("conversation_members").select("conversation_id, user_id").in("conversation_id", ids),
    supabase
      .from("messages")
      .select("*")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const peerIds = [...new Set((peersRows ?? []).filter((p) => p.user_id !== userId).map((p) => p.user_id))];
  const { data: profiles } = peerIds.length
    ? await supabase.from("profiles").select(PROFILE_COLS).in("id", peerIds)
    : { data: [] as ChatProfile[] };

  return (convs ?? [])
    .map((c) => {
      const peerId = (peersRows ?? []).find((p) => p.conversation_id === c.id && p.user_id !== userId)?.user_id;
      const membership = memberships?.find((m) => m.conversation_id === c.id);
      const lastRead = membership?.last_read_at ?? null;
      const cleared = membership?.cleared_at ?? null;
      const convMsgs = (msgs ?? [])
        .filter((m) => m.conversation_id === c.id)
        .filter((m) => !cleared || new Date(m.created_at) > new Date(cleared)) as Message[];
      return {
        id: c.id,
        last_message_at: c.last_message_at,
        peer: ((profiles ?? []) as ChatProfile[]).find((p) => p.id === peerId) ?? null,
        lastMessage: convMsgs[0] ?? null,
        accepted: membership?.accepted ?? true,
        muted: membership?.muted ?? false,
        archived: membership?.archived ?? false,
        unread: convMsgs.filter(
          (m) => m.sender_id !== userId && (!lastRead || new Date(m.created_at) > new Date(lastRead)),
        ).length,
      };
    })
    .sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
}

export async function fetchConversation(conversationId: string, userId: string) {
  const [{ data: members }, { data: messages }, { data: me }] = await Promise.all([
    supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId),
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("conversation_members")
      .select("accepted, muted, archived, cleared_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const peerId = (members ?? []).find((m) => m.user_id !== userId)?.user_id ?? null;
  const { data: peer } = peerId
    ? await supabase.from("profiles").select(PROFILE_COLS).eq("id", peerId).maybeSingle()
    : { data: null };
  const cleared = me?.cleared_at ?? null;
  const visible = ((messages ?? []) as Message[]).filter(
    (m) => !cleared || new Date(m.created_at) > new Date(cleared),
  );
  return {
    peer: (peer as ChatProfile) ?? null,
    messages: visible,
    membership: me ?? { accepted: true, muted: false, archived: false, cleared_at: null },
  };
}

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  imageUrl?: string | null | undefined;
  audioUrl?: string | null | undefined;
  peerId?: string | null | undefined;
  replyToId?: string | null | undefined;
  muted?: boolean | undefined;
}) {
  const now = Date.now();
  sendTimestamps = sendTimestamps.filter((t) => now - t < SEND_WINDOW_MS);
  if (sendTimestamps.length >= SEND_LIMIT) throw new Error("Slow down a little — too many messages at once.");
  sendTimestamps.push(now);

  const body = input.body.slice(0, 4000);
  const { error } = await supabase.from("messages").insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body,
    image_url: input.imageUrl ?? null,
    audio_url: input.audioUrl ?? null,
    reply_to_id: input.replyToId ?? null,
  });
  if (error) throw error;
  if (input.peerId) {
    await notify({
      userId: input.peerId,
      actorId: input.senderId,
      kind: "message",
      body: "sent you a message",
      link: `/chat/${input.conversationId}`,
    });
  }
}

/** Copies a message into another conversation, keeping the original untouched. */
export async function forwardMessage(input: {
  message: Message;
  toConversationId: string;
  senderId: string;
  peerId: string | null;
}) {
  await sendMessage({
    conversationId: input.toConversationId,
    senderId: input.senderId,
    body: input.message.body,
    imageUrl: input.message.image_url,
    audioUrl: input.message.audio_url,
    peerId: input.peerId,
  });
}

/** A chat stays in the recipient's "Requests" tab until they accept it. */
export async function acceptConversation(conversationId: string, userId: string) {
  const { error } = await supabase
    .from("conversation_members")
    .update({ accepted: true })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setConversationPrefs(
  conversationId: string,
  userId: string,
  patch: { muted?: boolean; archived?: boolean; cleared_at?: string | null },
) {
  const { error } = await supabase
    .from("conversation_members")
    .update(patch)
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Leaves (removes) the conversation for this user only. */
export async function deleteConversation(conversationId: string, userId: string) {
  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function fetchMessageReactions(conversationId: string) {
  const { data } = await supabase
    .from("message_reactions")
    .select("id, message_id, user_id, emoji")
    .eq("conversation_id", conversationId);
  return (data ?? []) as MessageReaction[];
}

export async function toggleMessageReaction(input: {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
  active: boolean;
}) {
  if (input.active) {
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", input.messageId)
      .eq("user_id", input.userId)
      .eq("emoji", input.emoji);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("message_reactions").insert({
    message_id: input.messageId,
    conversation_id: input.conversationId,
    user_id: input.userId,
    emoji: input.emoji,
  });
  if (error) throw error;
}

export async function deleteMessage(messageId: string) {
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw error;
}

/** Marks incoming messages as delivered as soon as this member's client sees them. */
export async function markDelivered(conversationId: string, userId: string) {
  await supabase
    .from("messages")
    .update({ delivered_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("delivered_at", null);
}

/**
 * Marks the peer's messages as read and moves this member's read cursor.
 * When the reader has read receipts switched off, only the private cursor moves.
 */
export async function markRead(conversationId: string, userId: string, shareReceipts = true) {
  const now = new Date().toISOString();
  if (shareReceipts) {
    await supabase
      .from("messages")
      .update({ read_at: now, delivered_at: now })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("read_at", null);
  }
  await supabase
    .from("conversation_members")
    .update({ last_read_at: now })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

import { supabase } from "@/integrations/supabase/client";

export type ChatProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  open_to_chat: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type ConversationSummary = {
  id: string;
  last_message_at: string;
  peer: ChatProfile | null;
  lastMessage: Message | null;
  unread: number;
};

const PROFILE_COLS = "id, username, display_name, avatar_url, bio, location, open_to_chat";

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

export async function uploadImage(userId: string, file: File, folder: "avatar" | "chat") {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
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

  const { error: memberError } = await supabase.from("conversation_members").insert([
    { conversation_id: conv.id, user_id: userId },
    { conversation_id: conv.id, user_id: peerId },
  ]);
  if (memberError) throw memberError;
  return conv.id as string;
}

export async function fetchConversations(userId: string): Promise<ConversationSummary[]> {
  const { data: memberships, error } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at")
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
      const lastRead = memberships?.find((m) => m.conversation_id === c.id)?.last_read_at ?? null;
      const convMsgs = (msgs ?? []).filter((m) => m.conversation_id === c.id) as Message[];
      return {
        id: c.id,
        last_message_at: c.last_message_at,
        peer: ((profiles ?? []) as ChatProfile[]).find((p) => p.id === peerId) ?? null,
        lastMessage: convMsgs[0] ?? null,
        unread: convMsgs.filter(
          (m) => m.sender_id !== userId && (!lastRead || new Date(m.created_at) > new Date(lastRead)),
        ).length,
      };
    })
    .sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
}

export async function fetchConversation(conversationId: string, userId: string) {
  const [{ data: members }, { data: messages }] = await Promise.all([
    supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId),
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);
  const peerId = (members ?? []).find((m) => m.user_id !== userId)?.user_id ?? null;
  const { data: peer } = peerId
    ? await supabase.from("profiles").select(PROFILE_COLS).eq("id", peerId).maybeSingle()
    : { data: null };
  return { peer: (peer as ChatProfile) ?? null, messages: (messages ?? []) as Message[] };
}

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  imageUrl?: string | null | undefined;
}) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body,
    image_url: input.imageUrl ?? null,
  });
  if (error) throw error;
}

/** Marks the peer's messages as read and moves this member's read cursor. */
export async function markRead(conversationId: string, userId: string) {
  const now = new Date().toISOString();
  await supabase
    .from("messages")
    .update({ read_at: now })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("read_at", null);
  await supabase
    .from("conversation_members")
    .update({ last_read_at: now })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

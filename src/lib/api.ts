import { supabase } from "@/integrations/supabase/client";
import type { ReactionKind } from "./confessions";
import { getDeviceKey } from "./confessions";

export type Confession = {
  id: string;
  number: number;
  body: string;
  category: string;
  community_id: string | null;
  parent_number: number | null;
  views: number;
  is_pinned: boolean;
  created_at: string;
};

export type ConfessionWithMeta = Confession & {
  reactions: Record<ReactionKind, number>;
  mine: ReactionKind[];
  commentCount: number;
  threadCount: number;
};

const EMPTY: Record<ReactionKind, number> = {
  relatable: 0,
  funny: 0,
  sad: 0,
  shocking: 0,
  crazy: 0,
  support: 0,
};

async function decorate(rows: Confession[]): Promise<ConfessionWithMeta[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const numbers = rows.map((r) => r.number);
  const device = getDeviceKey();

  const [reactions, comments, threads] = await Promise.all([
    supabase.from("confession_reactions").select("confession_id, kind, device_key").in("confession_id", ids),
    supabase.from("comments").select("confession_id").in("confession_id", ids),
    supabase.from("confessions").select("parent_number").in("parent_number", numbers),
  ]);

  return rows.map((row) => {
    const counts = { ...EMPTY };
    const mine: ReactionKind[] = [];
    for (const r of reactions.data ?? []) {
      if (r.confession_id !== row.id) continue;
      counts[r.kind as ReactionKind] += 1;
      if (r.device_key === device) mine.push(r.kind as ReactionKind);
    }
    return {
      ...row,
      reactions: counts,
      mine,
      commentCount: (comments.data ?? []).filter((c) => c.confession_id === row.id).length,
      threadCount: (threads.data ?? []).filter((t) => t.parent_number === row.number).length,
    };
  });
}

export type FeedSort = "recent" | "trending" | "featured";

export async function fetchFeed(opts: {
  sort: FeedSort;
  communityId?: string;
  search?: string;
  limit?: number;
}): Promise<ConfessionWithMeta[]> {
  let query = supabase.from("confessions").select("*").limit(opts.limit ?? 30);
  if (opts.communityId) query = query.eq("community_id", opts.communityId);
  if (opts.search) query = query.ilike("body", `%${opts.search}%`);
  query =
    opts.sort === "trending"
      ? query.order("views", { ascending: false })
      : query.order("is_pinned", { ascending: false }).order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return decorate((data ?? []) as Confession[]);
}

export async function fetchConfession(number: number) {
  const { data, error } = await supabase.from("confessions").select("*").eq("number", number).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [decorated] = await decorate([data as Confession]);
  return decorated ?? null;
}

export async function fetchThread(number: number) {
  const { data, error } = await supabase
    .from("confessions")
    .select("*")
    .eq("parent_number", number)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return decorate((data ?? []) as Confession[]);
}

export async function toggleReaction(confessionId: string, kind: ReactionKind, active: boolean) {
  const device_key = getDeviceKey();
  if (active) {
    const { error } = await supabase
      .from("confession_reactions")
      .delete()
      .eq("confession_id", confessionId)
      .eq("kind", kind)
      .eq("device_key", device_key);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("confession_reactions")
      .insert({ confession_id: confessionId, kind, device_key });
    if (error) throw error;
  }
}

export async function createConfession(input: {
  body: string;
  category: string;
  communityId: string | null;
  parentNumber: number | null;
}) {
  const { data, error } = await supabase
    .from("confessions")
    .insert({
      body: input.body,
      category: input.category,
      community_id: input.communityId,
      parent_number: input.parentNumber,
    })
    .select("number")
    .single();
  if (error) throw error;
  return data.number as number;
}

export async function fetchCommunities() {
  const [{ data: communities, error }, { data: members }] = await Promise.all([
    supabase.from("communities").select("*").order("name"),
    supabase.from("community_members").select("community_id, user_id"),
  ]);
  if (error) throw error;
  return (communities ?? []).map((c) => ({
    ...c,
    memberCount: (members ?? []).filter((m) => m.community_id === c.id).length,
    memberIds: (members ?? []).filter((m) => m.community_id === c.id).map((m) => m.user_id),
  }));
}

export type CommentNode = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  depth: number;
  username: string;
  avatar_url: string | null;
  likes: number;
  likedByMe: boolean;
  children: CommentNode[];
};

export async function fetchComments(confessionId: string, viewerId: string | null): Promise<CommentNode[]> {
  const { data: rows, error } = await supabase
    .from("comments")
    .select("id, body, created_at, user_id, parent_id, depth")
    .eq("confession_id", confessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const comments = rows ?? [];
  if (comments.length === 0) return [];

  const [{ data: profiles }, { data: likes }] = await Promise.all([
    supabase.from("profiles").select("id, username, avatar_url").in("id", [...new Set(comments.map((c) => c.user_id))]),
    supabase.from("comment_likes").select("comment_id, user_id").in("comment_id", comments.map((c) => c.id)),
  ]);

  const byId = new Map<string, CommentNode>();
  for (const c of comments) {
    byId.set(c.id, {
      ...c,
      username: profiles?.find((p) => p.id === c.user_id)?.username ?? "member",
      avatar_url: profiles?.find((p) => p.id === c.user_id)?.avatar_url ?? null,
      likes: (likes ?? []).filter((l) => l.comment_id === c.id).length,
      likedByMe: (likes ?? []).some((l) => l.comment_id === c.id && l.user_id === viewerId),
      children: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function addComment(input: {
  confessionId: string;
  userId: string;
  body: string;
  parentId: string | null;
  depth: number;
}) {
  const { error } = await supabase.from("comments").insert({
    confession_id: input.confessionId,
    user_id: input.userId,
    body: input.body,
    parent_id: input.parentId,
    depth: input.depth,
  });
  if (error) throw error;
}

export async function toggleCommentLike(commentId: string, userId: string, liked: boolean) {
  if (liked) {
    const { error } = await supabase
      .from("comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: userId });
    if (error) throw error;
  }
}

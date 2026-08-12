import { supabase } from "@/integrations/supabase/client";
import type { ReactionKind } from "./confessions";
import { extractMentions, getDeviceKey } from "./confessions";
import { notify } from "./social";


export type Confession = {
  id: string;
  number: number;
  body: string;
  category: string;
  community_id: string | null;
  parent_number: number | null;
  views: number;
  is_pinned: boolean;
  is_featured: boolean;
  status: string;
  created_at: string;

};

export type ConfessionWithMeta = Confession & {
  reactions: Record<ReactionKind, number>;
  mine: ReactionKind[];
  commentCount: number;
  threadCount: number;
  repostCount: number;
  repostedByMe: boolean;
};


const EMPTY: Record<ReactionKind, number> = {
  relatable: 0,
  funny: 0,
  sad: 0,
  shocking: 0,
  crazy: 0,
  support: 0,
};

async function decorate(rows: Confession[], viewerId: string | null): Promise<ConfessionWithMeta[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const numbers = rows.map((r) => r.number);
  const device = getDeviceKey();

  const [reactions, comments, threads, reposts] = await Promise.all([
    supabase.from("confession_reactions").select("confession_id, kind, device_key").in("confession_id", ids),
    supabase.from("comments").select("confession_id").in("confession_id", ids),
    supabase.from("confessions").select("parent_number").in("parent_number", numbers),
    supabase.from("reposts").select("confession_id, user_id").in("confession_id", ids),
  ]);

  return rows.map((row) => {
    const counts = { ...EMPTY };
    const mine: ReactionKind[] = [];
    for (const r of reactions.data ?? []) {
      if (r.confession_id !== row.id) continue;
      counts[r.kind as ReactionKind] += 1;
      if (r.device_key === device) mine.push(r.kind as ReactionKind);
    }
    const rowReposts = (reposts.data ?? []).filter((r) => r.confession_id === row.id);
    return {
      ...row,
      reactions: counts,
      mine,
      commentCount: (comments.data ?? []).filter((c) => c.confession_id === row.id).length,
      threadCount: (threads.data ?? []).filter((t) => t.parent_number === row.number).length,
      repostCount: rowReposts.length,
      repostedByMe: !!viewerId && rowReposts.some((r) => r.user_id === viewerId),
    };
  });
}

export type FeedSort = "foryou" | "latest" | "trending";

export const FEED_PAGE_SIZE = 20;

/** Engagement score with time decay so fresh, good confessions can rise. */
function trendScore(c: ConfessionWithMeta): number {
  const hours = (Date.now() - new Date(c.created_at).getTime()) / 3_600_000;
  const reactions = Object.values(c.reactions).reduce((a, b) => a + b, 0);
  const raw = reactions * 2 + c.commentCount * 3 + c.threadCount * 4 + c.repostCount * 3 + c.views * 0.15;
  return raw / Math.pow(hours + 2, 0.8);
}

export async function fetchFeed(opts: {
  sort: FeedSort;
  communityId?: string;
  search?: string;
  viewerId?: string | null;
  page?: number;
  limit?: number;
}): Promise<ConfessionWithMeta[]> {
  const limit = opts.limit ?? FEED_PAGE_SIZE;
  const page = opts.page ?? 0;
  // Trending & For You rank a recent window client-side, so pull a wider slice.
  const ranked = opts.sort !== "latest" && !opts.search;
  const from = ranked ? 0 : page * limit;
  const to = ranked ? Math.max(120, (page + 1) * limit) - 1 : from + limit - 1;

  let query = supabase.from("confessions").select("*").eq("status", "published");
  if (opts.communityId) query = query.eq("community_id", opts.communityId);
  if (opts.search) query = query.ilike("body", `%${opts.search}%`);
  query = query.order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).range(from, to);

  const { data, error } = await query;
  if (error) throw error;
  const rows = await decorate((data ?? []) as Confession[], opts.viewerId ?? null);

  if (!ranked) return rows;
  const scored = [...rows].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (opts.sort === "trending") return trendScore(b) - trendScore(a);
    // For You blends freshness with engagement.
    return trendScore(b) * 0.7 + freshness(b) - (trendScore(a) * 0.7 + freshness(a));
  });
  return scored.slice(page * limit, (page + 1) * limit);
}

function freshness(c: ConfessionWithMeta): number {
  const hours = (Date.now() - new Date(c.created_at).getTime()) / 3_600_000;
  return 6 / (hours + 6);
}


export async function fetchConfession(number: number, viewerId: string | null = null) {
  const { data, error } = await supabase.from("confessions").select("*").eq("number", number).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [decorated] = await decorate([data as Confession], viewerId);
  return decorated ?? null;
}

export async function fetchThread(number: number, viewerId: string | null = null) {
  const { data, error } = await supabase
    .from("confessions")
    .select("*")
    .eq("parent_number", number)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return decorate((data ?? []) as Confession[], viewerId);
}

/** Counted once per device per confession. */
export async function bumpViews(number: number) {
  if (typeof window === "undefined") return;
  const key = `cc_seen_${number}`;
  if (window.sessionStorage.getItem(key)) return;
  window.sessionStorage.setItem(key, "1");
  await supabase.rpc("bump_confession_views", { _number: number });
}

export async function toggleRepost(confessionId: string, userId: string, reposted: boolean) {
  if (reposted) {
    const { error } = await supabase.from("reposts").delete().eq("confession_id", confessionId).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("reposts").insert({ confession_id: confessionId, user_id: userId });
  if (error) throw error;
}

/** Confessions a user has reposted — shown on their public profile. */
export async function fetchReposts(userId: string, viewerId: string | null = null) {
  const { data } = await supabase
    .from("reposts")
    .select("confession_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  const ids = (data ?? []).map((r) => r.confession_id);
  if (ids.length === 0) return [];
  const { data: rows } = await supabase.from("confessions").select("*").in("id", ids).eq("status", "published");
  return decorate((rows ?? []) as Confession[], viewerId);
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
  helpful: number;
  funny: number;
  myVotes: VoteKind[];
  replyCount: number;
  children: CommentNode[];
};

export type VoteKind = "helpful" | "funny";
export type CommentSort = "top" | "newest" | "helpful" | "funny" | "controversial";

export const COMMENT_SORTS: { key: CommentSort; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "newest", label: "Newest" },
  { key: "helpful", label: "Most Helpful" },
  { key: "funny", label: "Most Funny" },
  { key: "controversial", label: "Most Controversial" },
];

/** Smart ranking: likes + replies + helpful votes, decayed by age. */
function score(node: CommentNode): number {
  const hours = (Date.now() - new Date(node.created_at).getTime()) / 3_600_000;
  const raw = node.likes + node.replyCount * 2 + node.helpful * 3 + node.funny;
  return raw / Math.pow(hours + 2, 0.6);
}

function sortNodes(nodes: CommentNode[], sort: CommentSort): CommentNode[] {
  const sorted = [...nodes].sort((a, b) => {
    switch (sort) {
      case "newest":
        return +new Date(b.created_at) - +new Date(a.created_at);
      case "helpful":
        return b.helpful - a.helpful || b.likes - a.likes;
      case "funny":
        return b.funny - a.funny || b.likes - a.likes;
      case "controversial":
        return (
          Math.min(b.likes, b.replyCount) * (b.likes + b.replyCount) -
          Math.min(a.likes, a.replyCount) * (a.likes + a.replyCount)
        );
      default:
        return score(b) - score(a);
    }
  });
  for (const n of sorted) n.children = sortNodes(n.children, sort);
  return sorted;
}

export async function fetchComments(
  confessionId: string,
  viewerId: string | null,
  sort: CommentSort = "top",
): Promise<CommentNode[]> {
  const { data: rows, error } = await supabase
    .from("comments")
    .select("id, body, created_at, user_id, parent_id, depth")
    .eq("confession_id", confessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const comments = rows ?? [];
  if (comments.length === 0) return [];

  const commentIds = comments.map((c) => c.id);
  const [{ data: profiles }, { data: likes }, { data: votes }] = await Promise.all([
    supabase.from("profiles").select("id, username, avatar_url").in("id", [...new Set(comments.map((c) => c.user_id))]),
    supabase.from("comment_likes").select("comment_id, user_id").in("comment_id", commentIds),
    supabase.from("comment_votes").select("comment_id, user_id, kind").in("comment_id", commentIds),
  ]);

  const byId = new Map<string, CommentNode>();
  for (const c of comments) {
    const mine = (votes ?? []).filter((v) => v.comment_id === c.id && v.user_id === viewerId);
    byId.set(c.id, {
      ...c,
      username: profiles?.find((p) => p.id === c.user_id)?.username ?? "member",
      avatar_url: profiles?.find((p) => p.id === c.user_id)?.avatar_url ?? null,
      likes: (likes ?? []).filter((l) => l.comment_id === c.id).length,
      likedByMe: (likes ?? []).some((l) => l.comment_id === c.id && l.user_id === viewerId),
      helpful: (votes ?? []).filter((v) => v.comment_id === c.id && v.kind === "helpful").length,
      funny: (votes ?? []).filter((v) => v.comment_id === c.id && v.kind === "funny").length,
      myVotes: mine.map((v) => v.kind as VoteKind),
      replyCount: comments.filter((r) => r.parent_id === c.id).length,
      children: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return sortNodes(roots, sort);
}

export async function addComment(input: {
  confessionId: string;
  confessionNumber?: number | undefined;
  userId: string;
  username?: string | undefined;
  body: string;
  parentId: string | null;
  parentUserId?: string | null | undefined;
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

  const link = input.confessionNumber ? `/confession/${input.confessionNumber}` : null;
  const who = input.username ? `@${input.username}` : "A comrade";

  if (input.parentUserId) {
    await notify({ userId: input.parentUserId, actorId: input.userId, kind: "reply", body: `${who} replied to you`, link });
  }
  const mentions = extractMentions(input.body);
  if (mentions.length > 0) {
    const { data: mentioned } = await supabase.from("profiles").select("id, username").in("username", mentions);
    for (const m of mentioned ?? []) {
      if (m.id === input.parentUserId) continue;
      await notify({ userId: m.id, actorId: input.userId, kind: "mention", body: `${who} mentioned you`, link });
    }
  }
}

export async function editComment(commentId: string, body: string) {
  const { error } = await supabase.from("comments").update({ body }).eq("id", commentId);
  if (error) throw error;
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function toggleCommentLike(commentId: string, userId: string, liked: boolean, ownerId?: string) {
  if (liked) {
    const { error } = await supabase
      .from("comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: userId });
  if (error) throw error;
  if (ownerId) {
    await notify({ userId: ownerId, actorId: userId, kind: "like", body: "liked your comment", link: null });
  }
}

export async function toggleCommentVote(commentId: string, userId: string, kind: VoteKind, active: boolean) {
  if (active) {
    const { error } = await supabase
      .from("comment_votes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .eq("kind", kind);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("comment_votes").insert({ comment_id: commentId, user_id: userId, kind });
  if (error) throw error;
}


/* ---------------------------------- search --------------------------------- */

export async function searchUsers(q: string) {
  const term = q.trim().replace(/^@/, "").toLowerCase();
  if (term.length < 2) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .ilike("username", `%${term}%`)
    .limit(10);
  return data ?? [];
}

/* ---------------------------------- admin ---------------------------------- */

export async function isAdmin(userId: string | null | undefined) {
  if (!userId) return false;
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

export async function fetchAdminConfessions(status: string) {
  const { data, error } = await supabase
    .from("confessions")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as Confession[];
}

export async function moderateConfession(
  id: string,
  patch: Partial<{ status: string; is_pinned: boolean; is_featured: boolean; body: string; category: string }>,
) {
  const { error } = await supabase.from("confessions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteConfession(id: string) {
  const { error } = await supabase.from("confessions").delete().eq("id", id);
  if (error) throw error;
}

export type AdminReport = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
};

export async function fetchReports(status: string) {
  const { data, error } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, status, created_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as AdminReport[];
}

export async function resolveReport(id: string, status: "resolved" | "dismissed") {
  const { error } = await supabase.from("reports").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function moderateUser(userId: string, patch: { banned?: boolean; suspended_until?: string | null }) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

export async function adminStats() {
  const [confessions, comments, users, reports] = await Promise.all([
    supabase.from("confessions").select("id", { count: "exact", head: true }),
    supabase.from("comments").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  return {
    confessions: confessions.count ?? 0,
    comments: comments.count ?? 0,
    users: users.count ?? 0,
    openReports: reports.count ?? 0,
  };
}

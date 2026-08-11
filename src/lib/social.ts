import { supabase } from "@/integrations/supabase/client";

export type NotificationKind =
  | "reply"
  | "mention"
  | "like"
  | "follow"
  | "message"
  | "community";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  body: string;
  link: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
  actor?: { username: string; avatar_url: string | null } | null;
};

/* ---------------------------------- follows --------------------------------- */

export async function fetchFollowStats(userId: string, viewerId: string | null) {
  const [{ data: followers }, { data: following }] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", userId),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
  ]);
  return {
    followers: followers?.length ?? 0,
    following: following?.length ?? 0,
    followedByMe: !!viewerId && (followers ?? []).some((f) => f.follower_id === viewerId),
  };
}

export async function toggleFollow(viewerId: string, targetId: string, following: boolean) {
  if (following) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", viewerId)
      .eq("following_id", targetId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("follows").insert({ follower_id: viewerId, following_id: targetId });
  if (error) throw error;
  await notify({ userId: targetId, actorId: viewerId, kind: "follow", body: "started following you", link: null });
}

/** Reputation = comment likes + 2x helpful votes + followers. */
export async function fetchReputation(userId: string) {
  const { data: comments } = await supabase.from("comments").select("id").eq("user_id", userId);
  const ids = (comments ?? []).map((c) => c.id);
  if (ids.length === 0) {
    const { data: followers } = await supabase.from("follows").select("id").eq("following_id", userId);
    return followers?.length ?? 0;
  }
  const [{ data: likes }, { data: votes }, { data: followers }] = await Promise.all([
    supabase.from("comment_likes").select("id").in("comment_id", ids),
    supabase.from("comment_votes").select("kind").in("comment_id", ids),
    supabase.from("follows").select("id").eq("following_id", userId),
  ]);
  const helpful = (votes ?? []).filter((v) => v.kind === "helpful").length;
  return (likes?.length ?? 0) + helpful * 2 + (followers?.length ?? 0);
}

/* ------------------------------- notifications ------------------------------ */

export async function notify(input: {
  userId: string;
  actorId: string | null;
  kind: NotificationKind;
  body: string;
  link: string | null;
}) {
  if (!input.actorId || input.userId === input.actorId) return;
  await supabase.from("notifications").insert({
    user_id: input.userId,
    actor_id: input.actorId,
    kind: input.kind,
    body: input.body,
    link: input.link,
  });
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, body, link, actor_id, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  const rows = (data ?? []) as AppNotification[];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  if (actorIds.length === 0) return rows;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", actorIds);
  return rows.map((r) => ({
    ...r,
    actor: (profiles ?? []).find((p) => p.id === r.actor_id) ?? null,
  }));
}

export async function markNotificationsRead(userId: string) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
}

/* ---------------------------- blocking & reporting --------------------------- */

export async function fetchBlock(viewerId: string, targetId: string) {
  const { data } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`and(blocker_id.eq.${viewerId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${viewerId})`);
  return {
    iBlocked: (data ?? []).some((b) => b.blocker_id === viewerId),
    blockedMe: (data ?? []).some((b) => b.blocker_id === targetId),
  };
}

export async function toggleBlock(viewerId: string, targetId: string, blocked: boolean) {
  if (blocked) {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", viewerId)
      .eq("blocked_id", targetId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("blocks").insert({ blocker_id: viewerId, blocked_id: targetId });
  if (error) throw error;
}

export async function reportContent(input: {
  targetType: "confession" | "comment" | "message" | "user";
  targetId: string;
  reason: string;
  reporterId: string | null;
}) {
  if (!input.reporterId) throw new Error("Please sign in to submit a report.");
  const { error } = await supabase.from("reports").insert({
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    reporter_id: input.reporterId,
  });
  if (error) throw error;
}

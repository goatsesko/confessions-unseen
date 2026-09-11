import { supabase } from "@/integrations/supabase/client";
import campus from "@/assets/communities/campus.jpg";
import secrets from "@/assets/communities/secrets.jpg";
import family from "@/assets/communities/family.jpg";
import funny from "@/assets/communities/funny.jpg";
import relationships from "@/assets/communities/relationships.jpg";
import marriage from "@/assets/communities/marriage.jpg";
import mentalHealth from "@/assets/communities/mental-health.jpg";
import work from "@/assets/communities/work.jpg";
import storyTime from "@/assets/communities/story-time.jpg";
import fallbackCover from "@/assets/communities/default.jpg";

export const COMMUNITY_CATEGORIES = [
  "Campus",
  "Relationships",
  "Confessions",
  "Work",
  "Funny",
  "Lifestyle",
  "Family",
  "Sports",
  "Gaming",
  "Music",
  "Local",
  "General",
] as const;

const SLUG_COVERS: Record<string, string> = {
  campus,
  secrets,
  family,
  funny,
  relationships,
  marriage,
  "mental-health": mentalHealth,
  work,
  "story-time": storyTime,
};

const CATEGORY_COVERS: Record<string, string> = {
  Campus: campus,
  Relationships: relationships,
  Confessions: secrets,
  Work: work,
  Funny: funny,
  Lifestyle: mentalHealth,
  Family: family,
};

/** Signed URLs for the private community-media bucket, cached per path. */
const signedCovers = new Map<string, string>();

export async function resolveCommunityMedia(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const cached = signedCovers.get(path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("community-media").createSignedUrl(path, 60 * 60 * 24);
  if (!data?.signedUrl) return null;
  signedCovers.set(path, data.signedUrl);
  return data.signedUrl;
}

export function defaultCover(slug: string, category: string): string {
  return SLUG_COVERS[slug] ?? CATEGORY_COVERS[category] ?? fallbackCover;
}

export type CommunityRich = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  rules: string[];
  category: string;
  privacy: string;
  cover_url: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  memberCount: number;
  memberIds: string[];
  postCount: number;
  recentPosts: number;
  lastActivity: string | null;
  joined: boolean;
  /** Ready-to-render cover: uploaded image when present, else a themed default. */
  cover: string;
};

const WEEK = 7 * 24 * 60 * 60 * 1000;

export async function fetchCommunitiesRich(viewerId: string | null): Promise<CommunityRich[]> {
  const [{ data: rows, error }, { data: members }, { data: posts }] = await Promise.all([
    supabase.from("communities").select("*").order("name"),
    supabase.from("community_members").select("community_id, user_id"),
    supabase
      .from("confessions")
      .select("community_id, created_at")
      .eq("status", "published")
      .not("community_id", "is", null),
  ]);
  if (error) throw error;

  const since = Date.now() - WEEK;
  const list = await Promise.all(
    (rows ?? []).map(async (c) => {
      const mem = (members ?? []).filter((m) => m.community_id === c.id);
      const p = (posts ?? []).filter((x) => x.community_id === c.id);
      const times = p.map((x) => new Date(x.created_at).getTime());
      const uploaded = await resolveCommunityMedia(c.cover_url);
      return {
        ...c,
        rules: (c.rules ?? []) as string[],
        memberCount: mem.length,
        memberIds: mem.map((m) => m.user_id),
        postCount: p.length,
        recentPosts: times.filter((t) => t >= since).length,
        lastActivity: times.length ? new Date(Math.max(...times)).toISOString() : null,
        joined: !!viewerId && mem.some((m) => m.user_id === viewerId),
        cover: uploaded ?? defaultCover(c.slug, c.category ?? "General"),
      } as CommunityRich;
    }),
  );
  return list;
}

/** Personalization score: joined communities first, then activity and freshness. */
export function recommendScore(c: CommunityRich): number {
  const hours = c.lastActivity ? (Date.now() - new Date(c.lastActivity).getTime()) / 3_600_000 : 999;
  return c.recentPosts * 6 + c.memberCount * 1.5 + c.postCount + 48 / (hours + 12);
}

export async function setMembership(communityId: string, userId: string, join: boolean) {
  if (join) {
    const { error } = await supabase.from("community_members").insert({ community_id: communityId, user_id: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("community_members")
      .delete()
      .eq("community_id", communityId)
      .eq("user_id", userId);
    if (error) throw error;
  }
}

export async function uploadCommunityMedia(userId: string, file: File | Blob, kind: "cover" | "avatar") {
  const ext = (file instanceof File ? file.name.split(".").pop()?.toLowerCase() : null) ?? "jpg";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("community-media").upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function createCommunity(input: {
  name: string;
  description: string;
  emoji: string;
  category: string;
  privacy: string;
  rules: string[];
  coverPath: string | null;
  avatarPath: string | null;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("communities")
    .insert({
      slug: slugify(input.name),
      name: input.name,
      emoji: input.emoji || "🖤",
      description: input.description,
      rules: input.rules,
      category: input.category,
      privacy: input.privacy,
      cover_url: input.coverPath,
      avatar_url: input.avatarPath,
      created_by: input.userId,
    })
    .select("id, slug")
    .single();
  if (error) throw error;
  await setMembership(data.id, input.userId, true);
  return data.slug as string;
}

export async function fetchCommunityMembers(communityId: string) {
  const { data, error } = await supabase
    .from("community_members")
    .select("user_id, created_at")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  const ids = (data ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids);
  return (data ?? []).map((m) => {
    const p = (profiles ?? []).find((x) => x.id === m.user_id);
    return { userId: m.user_id, username: p?.username ?? null, avatar: p?.avatar_url ?? null, joinedAt: m.created_at };
  });
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, LogOut, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchCommunities } from "@/lib/api";
import { updateProfile, uploadImage } from "@/lib/messages";
import { fetchFollowStats, fetchReputation } from "@/lib/social";


export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — Comrades Confessions" },
      {
        name: "description",
        content: "Set your username, photo, bio and town. Your confessions stay anonymous forever.",
      },
      { property: "og:title", content: "Your profile — Comrades Confessions" },
      { property: "og:description", content: "Your comrade profile. Confessions are never linked to you." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, setProfile } = useAuth();
  const qc = useQueryClient();
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [openToChat, setOpenToChat] = useState(true);
  const [privacy, setPrivacy] = useState<"everyone" | "followers" | "following" | "nobody">("everyone");
  const [showOnline, setShowOnline] = useState(true);
  const [showReceipts, setShowReceipts] = useState(true);
  const [allowImages, setAllowImages] = useState(true);
  const [allowVoice, setAllowVoice] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setBio(profile.bio ?? "");
    setDisplayName(profile.display_name ?? "");
    setLocation(profile.location ?? "");
    setOpenToChat(profile.open_to_chat ?? true);
    setPrivacy(profile.msg_privacy ?? "everyone");
    setShowOnline(profile.show_online ?? true);
    setShowReceipts(profile.show_read_receipts ?? true);
    setAllowImages(profile.allow_images ?? true);
    setAllowVoice(profile.allow_voice ?? true);
  }, [profile?.id]);

  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });
  const mine = (communities.data ?? []).filter((c) => user && c.memberIds.includes(user.id));

  const stats = useQuery({
    queryKey: ["follow-stats", user?.id ?? null, user?.id ?? null],
    enabled: !!user,
    queryFn: () => fetchFollowStats(user!.id, user!.id),
  });

  const reputation = useQuery({
    queryKey: ["reputation", user?.id ?? null],
    enabled: !!user,
    queryFn: () => fetchReputation(user!.id),
  });


  const comments = useQuery({
    queryKey: ["my-comments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, body, created_at, confession_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: () =>
      updateProfile(user!.id, {
        bio: bio.trim() || null,
        display_name: displayName.trim() || null,
        location: location.trim() || null,
        open_to_chat: openToChat,
      }),
    onSuccess: (data) => {
      setProfile(data);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: () => toast.error("Couldn't save profile"),
  });

  async function pickAvatar(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const path = await uploadImage(user.id, file, "avatar");
      const data = await updateProfile(user.id, { avatar_url: path });
      setProfile(data);
      toast.success("Photo updated");
    } catch {
      toast.error("Couldn't upload that photo");
    } finally {
      setUploading(false);
    }
  }

  if (!user) {
    return (
      <AppShell>
        <div className="surface mt-10 flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-4xl">🎭</p>
          <p className="font-display text-lg font-bold">You're browsing anonymously</p>
          <p className="text-sm text-muted-foreground">Sign in to comment, join communities and message comrades.</p>
          <Link
            to="/auth"
            className="tap rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="surface p-5 text-center">
        <div className="relative mx-auto w-20">
          <UserAvatar username={profile?.username ?? "me"} avatarPath={profile?.avatar_url} size="lg" />
          <label className="tap absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
            ) : (
              <Camera className="h-4 w-4 text-primary-foreground" />
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickAvatar(e.target.files[0])}
            />
          </label>
        </div>
        <h1 className="mt-3 font-display text-xl font-extrabold">@{profile?.username ?? "comrade"}</h1>
        {profile?.username && (
          <Link
            to="/u/$username"
            params={{ username: profile.username }}
            className="tap text-xs text-primary"
          >
            View public profile
          </Link>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm">
          <Stat label="Followers" value={stats.data?.followers ?? 0} />
          <Stat label="Following" value={stats.data?.following ?? 0} />
          <Stat label="Reputation" value={reputation.data ?? 0} />
          <Stat label="Communities" value={mine.length} />
          <Stat label="Comments" value={comments.data?.length ?? 0} />
        </div>

        <button
          onClick={() => supabase.auth.signOut()}
          className="tap mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      <div className="surface mt-4 space-y-3 p-4">
        <h2 className="font-display text-sm font-bold">Edit profile</h2>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What people call you"
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Say something real about you"
            className="w-full resize-none rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Town">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Kisii town"
              className="h-11 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </Field>
        <label className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3 text-sm">
          <span>
            Open to private chats
            <span className="block text-xs text-muted-foreground">Let comrades message you directly</span>
          </span>
          <input
            type="checkbox"
            checked={openToChat}
            onChange={(e) => setOpenToChat(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>

        <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-left">
          <p className="text-xs text-muted-foreground">Who can message me?</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["everyone", "Everyone"],
                ["followers", "Followers only"],
                ["following", "People I follow"],
                ["nobody", "Nobody"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPrivacy(value)}
                className={
                  "tap rounded-full border px-3 py-1.5 text-xs " +
                  (privacy === value ? "border-primary text-primary" : "border-border text-muted-foreground")
                }
              >
                {label}
              </button>
            ))}
          </div>
          <Toggle label="Show online status" checked={showOnline} onChange={setShowOnline} />
          <Toggle label="Show read receipts" checked={showReceipts} onChange={setShowReceipts} />
          <Toggle label="Allow image messages" checked={allowImages} onChange={setAllowImages} />
          <Toggle label="Allow voice messages" checked={allowVoice} onChange={setAllowVoice} />
        </div>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="tap flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save profile"}
        </button>
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Confessions you post never appear here. Only comments, reposts and communities do.
      </p>

      <h2 className="mt-5 font-display text-sm font-bold">Your comments</h2>
      <div className="mt-2 space-y-2">
        {(comments.data ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        )}
        {(comments.data ?? []).map((c) => (
          <div key={c.id} className="surface p-3 text-sm">
            {c.body}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-left">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

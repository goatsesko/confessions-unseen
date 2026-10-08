import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, LogOut, MapPin, Phone, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CALL_COMING_SOON } from "@/lib/calls";
import { updateProfile, uploadImage } from "@/lib/messages";
import { NotificationSettings } from "@/components/NotificationSettings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Whispr" },
      {
        name: "description",
        content: "Private settings: your photo, bio, town, who can message you, online status and read receipts.",
      },
      { property: "og:title", content: "Settings — Whispr" },
      { property: "og:description", content: "Manage your comrade account privately. Confessions stay anonymous." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, setProfile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
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

  const save = useMutation({
    mutationFn: () =>
      updateProfile(user!.id, {
        bio: bio.trim() || null,
        display_name: displayName.trim() || null,
        location: location.trim() || null,
        open_to_chat: openToChat,
        msg_privacy: privacy,
        show_online: showOnline,
        show_read_receipts: showReceipts,
        allow_images: allowImages,
        allow_voice: allowVoice,
      }),
    onSuccess: (data) => {
      setProfile(data);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Settings saved");
    },
    onError: () => toast.error("Couldn't save your settings"),
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

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!user) {
    return (
      <AppShell>
        <div className="surface mt-10 flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-4xl">🎭</p>
          <p className="font-display text-lg font-bold">Sign in to manage settings</p>
          <Link to="/auth" className="tap rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-3 flex items-center gap-2">
        <Link to="/profile" aria-label="Back to profile" className="tap rounded-full p-2 hover:bg-elevated">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-lg font-extrabold">Settings</h1>
      </div>

      <section className="surface p-4">
        <h2 className="font-display text-sm font-bold">Your photo</h2>
        <div className="mt-3 flex items-center gap-4">
          <div className="relative">
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
          <div>
            <p className="font-display text-base font-extrabold">@{profile?.username ?? "comrade"}</p>
            <p className="text-[11px] text-muted-foreground">Your username can't be changed.</p>
          </div>
        </div>
      </section>

      <section className="surface mt-4 space-y-3 p-4">
        <h2 className="font-display text-sm font-bold">Public details</h2>
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
      </section>

      <section className="surface mt-4 space-y-3 p-4">
        <h2 className="font-display text-sm font-bold">Privacy & messages</h2>
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

        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
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
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </button>
      </section>

      {user && <NotificationSettings userId={user.id} />}

      <section className="surface mt-4 divide-y divide-border p-1">
        <button
          onClick={() => toast.info(CALL_COMING_SOON)}
          className="tap flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-elevated"
        >
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span>
            <span className="block font-medium">Voice & video calls</span>
            <span className="block text-[11px] text-muted-foreground">Premium — coming soon</span>
          </span>
        </button>
        <div className="flex items-start gap-3 px-3 py-3 text-sm">
          <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <span>
            <span className="block font-medium">Anonymity</span>
            <span className="block text-[11px] text-muted-foreground">
              Confessions you post anonymously are never linked to this account.
            </span>
          </span>
        </div>
        <button
          onClick={signOut}
          className="tap flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-destructive hover:bg-elevated"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </section>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-primary"
      />
    </label>
  );
}

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  display_name: string | null;
  location: string | null;
  open_to_chat: boolean;
  msg_privacy: "everyone" | "followers" | "following" | "nobody";
  show_online: boolean;
  show_read_receipts: boolean;
  allow_images: boolean;
  allow_voice: boolean;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const user: User | undefined = session?.user;
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select(
        "id, username, bio, avatar_url, display_name, location, open_to_chat, msg_privacy, show_online, show_read_receipts, allow_images, allow_voice",
      )
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  return { session, user: session?.user ?? null, profile, setProfile, loading };
}

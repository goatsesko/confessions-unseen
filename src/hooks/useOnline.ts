import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global presence channel. Anyone with "show online status" enabled tracks
 * themselves here; everyone else simply never appears online.
 */
export function useOnlineUsers(userId: string | null | undefined, share: boolean) {
  const [online, setOnline] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("presence:online", { config: { presence: { key: userId } } });
    channel
      .on("presence", { event: "sync" }, () => setOnline(Object.keys(channel.presenceState())))
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && share) channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, share]);

  return online;
}

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

/** Sends a push for a notification the caller just created (caller must be its actor). */
export const sendPushForNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { notificationId: string }) => {
    if (typeof d?.notificationId !== "string" || d.notificationId.length > 64) throw new Error("bad input");
    return d;
  })
  .handler(async ({ data, context }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const fcmKey = process.env["FIREBASE_MESSAGING_API_KEY"];
    if (!lovableKey || !fcmKey) return { sent: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: n } = await supabaseAdmin
      .from("notifications")
      .select("user_id, actor_id, body, link, kind")
      .eq("id", data.notificationId)
      .maybeSingle();
    if (!n || n.actor_id !== context.userId) return { sent: 0 };
    const { data: actor } = await supabaseAdmin.from("profiles").select("username").eq("id", n.actor_id).maybeSingle();
    const { data: tokens } = await supabaseAdmin.from("push_tokens").select("token").eq("user_id", n.user_id);
    let sent = 0;
    for (const { token } of tokens ?? []) {
      const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": fcmKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: "Whispr", body: `${actor?.username ? "@" + actor.username + " " : ""}${n.body}` },
            data: { path: n.link ?? "/notifications" },
            webpush: { fcm_options: { link: n.link ?? "/notifications" } },
          },
        }),
      });
      if (res.ok) sent++;
      else {
        const txt = await res.text();
        console.error(`FCM send failed [${res.status}]: ${txt}`);
        if (res.status === 404 || res.status === 400) {
          await supabaseAdmin.from("push_tokens").delete().eq("token", token);
        }
      }
    }
    return { sent };
  });

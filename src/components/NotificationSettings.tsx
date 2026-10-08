import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const KINDS = [
  { id: "reply", label: "Replies to my comments" },
  { id: "mention", label: "@mentions" },
  { id: "like", label: "Likes" },
  { id: "follow", label: "New followers" },
  { id: "message", label: "Messages" },
  { id: "community", label: "Community announcements" },
] as const;

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function NotificationSettings({ userId }: { userId: string }) {
  const [kinds, setKinds] = useState<string[]>(KINDS.map((k) => k.id));
  const [quiet, setQuiet] = useState(false);
  const [start, setStart] = useState(22);
  const [end, setEnd] = useState(7);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("notification_prefs")
      .select("kinds, quiet_enabled, quiet_start, quiet_end")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setKinds(data.kinds);
        setQuiet(data.quiet_enabled);
        setStart(data.quiet_start);
        setEnd(data.quiet_end);
      });
  }, [userId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("notification_prefs").upsert({
      user_id: userId,
      kinds,
      quiet_enabled: quiet,
      quiet_start: start,
      quiet_end: end,
      tz_offset_min: -new Date().getTimezoneOffset(),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    error ? toast.error("Couldn't save notification settings.") : toast.success("Notification settings saved.");
  };

  const toggle = (id: string) => setKinds((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));

  return (
    <section className="surface mt-4 space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-display font-bold">
        <Bell className="h-4 w-4 text-primary" /> Push alerts
      </h2>
      <p className="text-xs text-muted-foreground">Choose what buzzes your phone. In-app notifications still show.</p>
      <div className="space-y-1">
        {KINDS.map((k) => (
          <label key={k.id} className="flex items-center justify-between rounded-xl px-1 py-2 text-sm">
            {k.label}
            <input type="checkbox" checked={kinds.includes(k.id)} onChange={() => toggle(k.id)} className="h-4 w-4 accent-primary" />
          </label>
        ))}
      </div>
      <div className="border-t border-border pt-3">
        <label className="flex items-center justify-between text-sm font-semibold">
          Quiet hours
          <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} className="h-4 w-4 accent-primary" />
        </label>
        <div className={cn("mt-2 flex items-center gap-2 text-sm", !quiet && "opacity-40")}>
          <span className="text-muted-foreground">From</span>
          <select disabled={!quiet} value={start} onChange={(e) => setStart(+e.target.value)} className="rounded-lg border border-border bg-elevated px-2 py-1">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <span className="text-muted-foreground">to</span>
          <select disabled={!quiet} value={end} onChange={(e) => setEnd(+e.target.value)} className="rounded-lg border border-border bg-elevated px-2 py-1">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="tap flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save alerts"}
      </button>
    </section>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { reportContent } from "@/lib/social";

export const REPORT_CATEGORIES = [
  "Harassment",
  "Spam",
  "Sexual harassment",
  "Threats",
  "Hate speech",
  "Scams",
  "Other",
] as const;

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  reporterId,
  label,
}: {
  open: boolean;
  onClose: () => void;
  targetType: "confession" | "comment" | "message" | "user";
  targetId: string;
  reporterId: string | null;
  label: string;
}) {
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="surface w-full max-w-md space-y-3 rounded-t-3xl p-5 sm:rounded-3xl">
        <h2 className="font-display text-base font-bold">Report {label}</h2>
        <div className="flex flex-wrap gap-2">
          {REPORT_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={
                "tap rounded-full border px-3 py-1.5 text-xs " +
                (category === c ? "border-primary text-primary" : "border-border text-muted-foreground")
              }
            >
              {c}
            </button>
          ))}
        </div>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Anything else moderators should know? (optional)"
          className="w-full resize-none rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="tap h-11 flex-1 rounded-full border border-border text-sm">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await reportContent({
                  targetType,
                  targetId,
                  reason: `${category}${details.trim() ? ` — ${details.trim()}` : ""}`,
                  reporterId,
                });
                toast.success("Report sent to moderators");
                onClose();
              } catch {
                toast.error("Couldn't send that report");
              } finally {
                setBusy(false);
              }
            }}
            className="tap h-11 flex-1 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            Send report
          </button>
        </div>
      </div>
    </div>
  );
}

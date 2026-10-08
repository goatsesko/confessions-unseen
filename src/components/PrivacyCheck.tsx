import { useState } from "react";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { reviewConfessionPrivacy, type PrivacyReview } from "@/lib/privacy.functions";

export function PrivacyCheck({ text, onApply }: { text: string; onApply: (t: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<PrivacyReview | null>(null);

  const run = async () => {
    setLoading(true);
    setReview(null);
    try {
      setReview(await reviewConfessionPrivacy({ data: { text } }));
    } catch (e) {
      toast.error((e as Error).message || "Privacy check failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={run}
        disabled={loading || text.trim().length < 3}
        className="tap flex items-center gap-2 rounded-full border border-primary/50 px-4 py-2 text-xs font-bold text-primary disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Checking your draft…" : "Check my draft for identifying details"}
      </button>

      {review && (
        <div className="surface mt-3 space-y-3 p-4">
          {review.findings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-primary" /> Looks safe — nothing obviously points to you.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold">These details could give you away:</p>
              <ul className="space-y-1.5">
                {review.findings.map((f, i) => (
                  <li key={i} className="text-xs">
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">{f.text}</span>{" "}
                    <span className="text-muted-foreground">— {f.reason}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-elevated p-3 text-sm leading-relaxed whitespace-pre-wrap">{review.rewrite}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApply(review.rewrite);
                    setReview(null);
                    toast.success("Safer version applied. Review it before posting.");
                  }}
                  className="tap rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                >
                  Use safer version
                </button>
                <button type="button" onClick={() => setReview(null)} className="tap rounded-full px-4 py-2 text-xs text-muted-foreground">
                  Keep mine
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

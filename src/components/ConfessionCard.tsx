import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Eye, MessageCircle, Repeat2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ShareSheet } from "@/components/ShareSheet";
import { ReportDialog } from "@/components/ReportDialog";
import { useAuth } from "@/hooks/useAuth";
import { REACTIONS, type ReactionKind, formatConfessionId, formatCount, timeAgo } from "@/lib/confessions";
import type { ConfessionWithMeta } from "@/lib/api";
import { toggleReaction, toggleRepost } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ReactionRow({
  confession,
  size = "sm",
  onChanged,
}: {
  confession: ConfessionWithMeta;
  size?: "sm" | "lg";
  onChanged?: () => void;
}) {
  const [counts, setCounts] = useState(confession.reactions);
  const [mine, setMine] = useState<ReactionKind[]>(confession.mine);

  async function react(kind: ReactionKind) {
    const active = mine.includes(kind);
    setMine(active ? mine.filter((k) => k !== kind) : [...mine, kind]);
    setCounts({ ...counts, [kind]: Math.max(0, counts[kind] + (active ? -1 : 1)) });
    try {
      await toggleReaction(confession.id, kind, active);
      onChanged?.();
    } catch {
      setMine(mine);
      setCounts(counts);
      toast.error("Couldn't save that reaction");
    }
  }

  const shown = size === "lg" ? REACTIONS : REACTIONS.slice(0, 5);

  return (
    <div className={cn("flex flex-wrap items-center", size === "lg" ? "justify-between gap-2" : "gap-3")}>
      {shown.map((r) => {
        const active = mine.includes(r.kind);
        return (
          <motion.button
            key={r.kind}
            whileTap={{ scale: 0.82 }}
            onClick={() => react(r.kind)}
            aria-label={`${r.label}${active ? " (added)" : ""}`}
            aria-pressed={active}
            className={cn(
              "tap flex items-center rounded-full",
              size === "lg" ? "flex-col gap-1 px-3 py-1.5 text-sm" : "gap-1.5 py-0.5 text-[13px] font-semibold",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span className={size === "lg" ? "text-2xl" : "text-base"}>{r.emoji}</span>
            <span>{formatCount(counts[r.kind])}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function RepostButton({
  confession,
  className,
}: {
  confession: ConfessionWithMeta;
  className?: string | undefined;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(confession.repostCount);
  const [mine, setMine] = useState(confession.repostedByMe);

  async function toggle() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    const next = !mine;
    setMine(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      await toggleRepost(confession.id, user.id, !next);
      toast.success(next ? "Reposted to your profile" : "Repost removed");
    } catch {
      setMine(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      toast.error("Couldn't repost that");
    }
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={mine}
      aria-label="Repost this confession"
      className={cn("tap flex items-center gap-1.5", mine ? "text-primary" : "", className)}
    >
      <Repeat2 className="h-4 w-4" />
      {formatCount(count)}
    </button>
  );
}

export function ConfessionCard({ confession }: { confession: ConfessionWithMeta }) {
  const [share, setShare] = useState(false);
  const [report, setReport] = useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      className="surface mb-3 p-4"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {confession.is_pinned && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">PINNED</span>
        )}
        {confession.is_featured && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">FEATURED</span>
        )}
        <span className="font-medium text-foreground/70">{confession.category}</span>
        <span aria-hidden>•</span>
        <span>{timeAgo(confession.created_at)}</span>
        <Link
          to="/confession/$number"
          params={{ number: String(confession.number) }}
          className="tap font-mono font-semibold text-primary"
        >
          {formatConfessionId(confession.number)}
        </Link>
      </div>

      {confession.parent_number && (
        <Link
          to="/confession/$number"
          params={{ number: String(confession.parent_number) }}
          className="tap mt-2 inline-block rounded-full bg-elevated px-2.5 py-1 text-[11px] text-muted-foreground"
        >
          Adding to confession {formatConfessionId(confession.parent_number)}
        </Link>
      )}

      <Link to="/confession/$number" params={{ number: String(confession.number) }} className="block">
        <p className="mt-2 whitespace-pre-wrap break-words font-display text-[17px] font-semibold leading-snug">
          {confession.body}
        </p>
      </Link>

      <div className="mt-3">
        <ReactionRow confession={confession} />
      </div>

      <div className="mt-3 flex items-center gap-5 border-t border-border pt-3 text-[12px] text-muted-foreground">
        <Link
          to="/confession/$number"
          params={{ number: String(confession.number) }}
          className="tap flex items-center gap-1.5"
          aria-label="Read comments"
        >
          <MessageCircle className="h-4 w-4" />
          {formatCount(confession.commentCount)}
        </Link>
        <RepostButton confession={confession} />
        <button onClick={() => setShare(true)} className="tap flex items-center gap-1.5" aria-label="Share confession">
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <span className="ml-auto flex items-center gap-1.5">
          <Eye className="h-4 w-4" aria-hidden />
          <span className="sr-only">Views:</span>
          {formatCount(confession.views)}
        </span>
      </div>

      <ShareSheet
        open={share}
        onClose={() => setShare(false)}
        number={confession.number}
        body={confession.body}
        category={confession.category}
        onReport={() => setReport(true)}
      />
      <ReportDialog
        open={report}
        onClose={() => setReport(false)}
        targetType="confession"
        targetId={confession.id}
      />
    </motion.article>
  );
}

export function ConfessionSkeleton() {
  return (
    <div className="surface mb-3 animate-pulse p-4" aria-hidden>
      <div className="h-3 w-32 rounded bg-elevated" />
      <div className="mt-3 h-4 w-full rounded bg-elevated" />
      <div className="mt-2 h-4 w-3/4 rounded bg-elevated" />
      <div className="mt-4 h-4 w-2/3 rounded bg-elevated" />
    </div>
  );
}

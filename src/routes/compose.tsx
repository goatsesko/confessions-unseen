import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Check, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BottomNav } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { CATEGORIES, extractParentNumber, maskIdentifiers } from "@/lib/confessions";
import { createConfession, fetchCommunities } from "@/lib/api";
import { checkContent, hasBlockingIssue, isDuplicate, rateLimit } from "@/lib/moderation";
import { cn } from "@/lib/utils";

type ComposeSearch = { addTo?: number | undefined };

export const Route = createFileRoute("/compose")({
  validateSearch: (search: Record<string, unknown>): ComposeSearch => ({
    addTo: search['addTo'] ? Number(search['addTo']) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Post anonymously — Comrades Confessions" },
      { name: "description", content: "Write your confession. No name, no account, no trace." },
      { property: "og:title", content: "Post anonymously" },
      { property: "og:description", content: "Write your confession. No name, no account, no trace." },
    ],
  }),
  component: Compose,
});

function Compose() {
  const { addTo } = Route.useSearch();
  const navigate = useNavigate();
  const [body, setBody] = useState(addTo ? `Adding to confession #${addTo} — ` : "");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [posted, setPosted] = useState<number | null>(null);
  const { user, profile } = useAuth();
  const [asProfile, setAsProfile] = useState(false);
  const signedIn = !!user && !!profile;

  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });

  const issues = checkContent(body);
  const blocked = hasBlockingIssue(issues);

  const post = useMutation({
    mutationFn: async () => {
      const limited = rateLimit("confession", 3, 10 * 60 * 1000);
      if (limited) throw new Error(limited);
      if (isDuplicate("confession", body.trim())) throw new Error("You already posted this confession.");
      return createConfession({
        body: maskIdentifiers(body.trim()),
        category,
        communityId,
        parentNumber: addTo ?? extractParentNumber(body),
        authorId: asProfile && signedIn ? user!.id : null,
      });
    },
    onSuccess: (number) => {
      setPosted(number);
      setTimeout(() => navigate({ to: "/confession/$number", params: { number: String(number) } }), 1400);
    },
    onError: (err: Error) => toast.error(err.message || "Couldn't post that. Try again."),
  });

  if (posted !== null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 14 }}
          className="pink-glow flex h-20 w-20 items-center justify-center rounded-full bg-primary"
        >
          <Check className="h-10 w-10 text-primary-foreground" />
        </motion.div>
        <h1 className="font-display text-2xl font-extrabold">Confession #{posted} is live</h1>
        <p className="text-sm text-muted-foreground">
          {asProfile && signedIn
            ? `Posted publicly as @${profile!.username}. Share the number to add to it later.`
            : "Nobody will ever know it was you. Share the number to add to it later."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <button onClick={() => navigate({ to: "/" })} className="tap p-1" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-base font-bold">New confession</h1>
          <button
            disabled={body.trim().length < 3 || blocked || post.isPending}
            onClick={() => post.mutate()}
            className="tap ml-auto flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-40"
          >
            {post.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {asProfile && signedIn ? "Post as @" + profile!.username : "Post anonymously"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        {addTo && (
          <p className="mb-3 rounded-full bg-elevated px-3 py-1.5 text-xs text-muted-foreground">
            Threading onto confession #{addTo}
          </p>
        )}
        <textarea
          autoFocus
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Say the thing you can't say out loud…"
          className="min-h-52 w-full resize-none bg-transparent font-display text-xl font-semibold leading-snug outline-none placeholder:text-muted-foreground/60"
        />
        <div className="mb-3 text-right text-xs text-muted-foreground">{body.length}/5000</div>

        {issues.length > 0 && (
          <div className="mb-6 space-y-2" role="status">
            {issues.map((issue, i) => (
              <p
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
                  issue.level === "block" ? "bg-destructive/15 text-destructive" : "bg-elevated text-muted-foreground",
                )}
              >
                {issue.level === "block" ? (
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                {issue.message}
              </p>
            ))}
          </div>
        )}

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Post as</p>
        <div className="mb-6 grid grid-cols-2 gap-2">
          <button
            onClick={() => setAsProfile(false)}
            className={cn(
              "tap rounded-2xl border p-3 text-left",
              !asProfile ? "border-primary bg-primary/10" : "border-border",
            )}
          >
            <span className="block text-sm font-bold">Anonymous</span>
            <span className="block text-[11px] text-muted-foreground">Nobody sees who posted</span>
          </button>
          <button
            onClick={() => {
              if (!signedIn) {
                navigate({ to: "/auth" });
                return;
              }
              setAsProfile(true);
            }}
            className={cn(
              "tap rounded-2xl border p-3 text-left",
              asProfile ? "border-primary bg-primary/10" : "border-border",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              {signedIn && <UserAvatar path={profile!.avatar_url} name={profile!.username} size={20} />}
              {signedIn ? "@" + profile!.username : "My profile"}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {signedIn ? "Your username shows on this post" : "Sign in to post with your username"}
            </span>
          </button>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</p>
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "tap rounded-full border px-3 py-1.5 text-sm",
                category === c
                  ? "border-primary bg-primary/15 font-semibold text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Community (optional)</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCommunityId(null)}
            className={cn(
              "tap rounded-full border px-3 py-1.5 text-sm",
              communityId === null ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            None
          </button>
          {(communities.data ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setCommunityId(c.id)}
              className={cn(
                "tap rounded-full border px-3 py-1.5 text-sm",
                communityId === c.id ? "border-primary text-primary" : "border-border text-muted-foreground",
              )}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          We never store your identity. Names, numbers, emails and links are masked automatically.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}

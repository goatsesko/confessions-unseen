import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, Flag, Repeat2, Share2 } from "lucide-react";
import { ReactionRow, RepostButton } from "@/components/ConfessionCard";
import { CommentThread } from "@/components/CommentThread";
import { ReportDialog } from "@/components/ReportDialog";
import { ShareSheet } from "@/components/ShareSheet";
import { useAuth } from "@/hooks/useAuth";
import { bumpViews, fetchConfession, fetchThread } from "@/lib/api";
import { formatConfessionId, formatCount, timeAgo } from "@/lib/confessions";

export const Route = createFileRoute("/confession/$number")({
  head: ({ params }) => ({
    meta: [
      { title: `Confession #${params.number} — Whispr` },
      { name: "description", content: `Read anonymous confession #${params.number} and join the conversation.` },
      { property: "og:title", content: `Confession #${params.number}` },
      { property: "og:description", content: "Anonymous confession on Whispr." },
    ],
  }),
  component: ConfessionDetail,
  errorComponent: () => <Centered text="This confession didn't load." />,
  notFoundComponent: () => <Centered text="Confession not found." />,
});

function Centered({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ConfessionDetail() {
  const { number } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const n = Number(number);
  const [share, setShare] = useState(false);
  const [report, setReport] = useState(false);

  const confession = useQuery({
    queryKey: ["confession", n, user?.id ?? null],
    queryFn: () => fetchConfession(n, user?.id ?? null),
  });
  const thread = useQuery({ queryKey: ["thread", n], queryFn: () => fetchThread(n) });

  useEffect(() => {
    if (Number.isFinite(n)) void bumpViews(n);
  }, [n]);


  const c = confession.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <button onClick={() => navigate({ to: "/" })} className="tap p-1" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-mono text-sm font-bold text-primary">{formatConfessionId(n)}</span>
          <div className="ml-auto flex items-center gap-1 text-muted-foreground">
            <button onClick={() => setShare(true)} className="tap p-2" aria-label="Share confession">
              <Share2 className="h-5 w-5" />
            </button>
            <button onClick={() => setReport(true)} className="tap p-2" aria-label="Report confession">
              <Flag className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-4">
        {confession.isLoading || !c ? (
          <div className="h-32 animate-pulse rounded-2xl bg-card" />
        ) : (
          <>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {timeAgo(c.created_at)}
              <span aria-hidden>•</span>
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {formatCount(c.views)} views
            </p>
            {c.parent_number && (
              <Link
                to="/confession/$number"
                params={{ number: String(c.parent_number) }}
                className="tap mt-2 inline-block rounded-full bg-elevated px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                Adding to confession {formatConfessionId(c.parent_number)}
              </Link>
            )}
            <h1 className="mt-2 whitespace-pre-wrap font-display text-2xl font-extrabold leading-tight">{c.body}</h1>
            <span className="mt-3 inline-block rounded-full bg-elevated px-3 py-1 text-xs text-muted-foreground">
              {c.category}
            </span>

            <div className="mt-4 border-y border-border py-3">
              <ReactionRow confession={c} size="lg" />
            </div>

            <div className="flex items-center justify-between py-3 text-sm text-muted-foreground">
              <Link
                to="/compose"
                search={{ addTo: c.number }}
                className="tap flex items-center gap-2 font-semibold text-primary"
              >
                <Repeat2 className="h-4 w-4" /> Add to {formatConfessionId(c.number)}
              </Link>
              <RepostButton confession={c} className="font-semibold" />
              <button onClick={() => setShare(true)} className="tap flex items-center gap-2">
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>

            {(thread.data ?? []).length > 0 && (
              <section className="mb-4">
                <h2 className="mb-2 font-display text-sm font-bold">Thread</h2>
                <div className="space-y-2">
                  {(thread.data ?? []).map((t) => (
                    <Link
                      key={t.id}
                      to="/confession/$number"
                      params={{ number: String(t.number) }}
                      className="surface tap block p-3"
                    >
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono font-semibold text-primary">{formatConfessionId(t.number)}</span> ·{" "}
                        {timeAgo(t.created_at)}
                      </p>
                      <p className="mt-1 text-sm">{t.body}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <CommentThread confessionId={c.id} confessionNumber={c.number} />

            <ShareSheet
              open={share}
              onClose={() => setShare(false)}
              number={c.number}
              body={c.body}
              category={c.category}
              onReport={() => setReport(true)}
            />
            <ReportDialog
              open={report}
              onClose={() => setReport(false)}
              targetType="confession"
              targetId={c.id}
              reporterId={user?.id ?? null}
              label={`Confession ${formatConfessionId(c.number)}`}
            />
          </>
        )}
      </main>
    </div>
  );
}

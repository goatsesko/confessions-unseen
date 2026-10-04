import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { BottomNav } from "@/components/AppShell";
import { ConfessionCard, ConfessionSkeleton } from "@/components/ConfessionCard";
import { fetchCommunities, fetchFeed } from "@/lib/api";
import { formatCount } from "@/lib/confessions";

export const Route = createFileRoute("/communities/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} community — Whispr` },
      { name: "description", content: `Anonymous confessions from the ${params.slug.replace(/-/g, " ")} community.` },
      { property: "og:title", content: `${params.slug.replace(/-/g, " ")} — Whispr` },
      { property: "og:description", content: "Anonymous confessions from this community." },
    ],
  }),
  component: CommunityPage,
  errorComponent: () => <p className="p-10 text-center text-sm text-muted-foreground">Couldn't load community.</p>,
  notFoundComponent: () => <p className="p-10 text-center text-sm text-muted-foreground">Community not found.</p>,
});

function CommunityPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });
  const community = (communities.data ?? []).find((c) => c.slug === slug);

  const feed = useQuery({
    queryKey: ["feed", "community", community?.id],
    queryFn: () => fetchFeed({ sort: "latest", communityId: community!.id }),
    enabled: !!community,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <button onClick={() => navigate({ to: "/communities" })} className="tap p-1" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-base font-bold">{community?.name ?? "Community"}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        {community && (
          <section className="surface mb-4 overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />
            <div className="p-4">
              <div className="-mt-10 mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-2xl">
                {community.emoji}
              </div>
              <h2 className="font-display text-xl font-extrabold">{community.name}</h2>
              <p className="text-sm text-muted-foreground">{community.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatCount(community.memberCount)} members</p>
              {community.rules.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {community.rules.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {feed.isLoading ? (
          <>
            <ConfessionSkeleton />
            <ConfessionSkeleton />
          </>
        ) : (feed.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No confessions here yet.</p>
        ) : (
          (feed.data ?? []).map((c) => <ConfessionCard key={c.id} confession={c} />)
        )}
      </main>
      <BottomNav />
    </div>
  );
}

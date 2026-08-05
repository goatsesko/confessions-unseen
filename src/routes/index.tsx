import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ConfessionCard, ConfessionSkeleton } from "@/components/ConfessionCard";
import { fetchCommunities, fetchFeed, type FeedSort } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Comrades Confessions — Speak freely. Stay anonymous." },
      {
        name: "description",
        content:
          "Anonymous confessions with real conversation. Every confession gets a number so you can add to it, thread it and follow the story.",
      },
      { property: "og:title", content: "Comrades Confessions" },
      { property: "og:description", content: "Speak freely. Stay anonymous. Every confession has a number." },
    ],
  }),
  component: Feed,
});

const TABS: { key: FeedSort | "communities"; label: string }[] = [
  { key: "recent", label: "For You" },
  { key: "trending", label: "Trending" },
  { key: "communities", label: "Communities" },
];

function Feed() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("recent");
  const sort: FeedSort = tab === "trending" ? "trending" : "recent";

  const feed = useQuery({
    queryKey: ["feed", sort],
    queryFn: () => fetchFeed({ sort }),
  });
  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities, enabled: tab === "communities" });

  return (
    <AppShell>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-1 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "tap relative shrink-0 px-3 pb-2 pt-1 text-sm font-semibold",
              tab === t.key ? "text-primary" : "text-muted-foreground",
            )}
          >
            {t.label}
            {tab === t.key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "communities" ? (
        <div className="grid gap-3">
          {(communities.data ?? []).map((c) => (
            <Link key={c.id} to="/communities/$slug" params={{ slug: c.slug }} className="surface tap flex gap-3 p-4">
              <span className="text-2xl">{c.emoji}</span>
              <div>
                <p className="font-display font-bold">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.description}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : feed.isLoading ? (
        <>
          <ConfessionSkeleton />
          <ConfessionSkeleton />
          <ConfessionSkeleton />
        </>
      ) : (feed.data ?? []).length === 0 ? (
        <EmptyFeed />
      ) : (
        (feed.data ?? []).map((c) => <ConfessionCard key={c.id} confession={c} />)
      )}
    </AppShell>
  );
}

function EmptyFeed() {
  return (
    <div className="surface flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-4xl">🤫</p>
      <p className="font-display text-lg font-bold">Nothing confessed yet</p>
      <p className="text-sm text-muted-foreground">Be the first. No name, no trace.</p>
      <Link to="/compose" className="tap rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
        Post anonymously
      </Link>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfessionCard, ConfessionSkeleton } from "@/components/ConfessionCard";
import { useAuth } from "@/hooks/useAuth";
import { FEED_PAGE_SIZE, fetchCommunities, fetchFeed, type FeedSort } from "@/lib/api";
import { formatCount } from "@/lib/confessions";
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
  { key: "foryou", label: "For You" },
  { key: "trending", label: "Trending" },
  { key: "latest", label: "Latest" },
  { key: "communities", label: "Communities" },
];

function Feed() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("foryou");
  const isCommunities = tab === "communities";
  const sort = (isCommunities ? "foryou" : tab) as FeedSort;
  const sentinel = useRef<HTMLDivElement | null>(null);

  const feed = useInfiniteQuery({
    queryKey: ["feed", sort, user?.id ?? null],
    enabled: !isCommunities,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchFeed({ sort, page: pageParam, viewerId: user?.id ?? null }),
    getNextPageParam: (last, pages) => (last.length < FEED_PAGE_SIZE ? undefined : pages.length),
  });

  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities, enabled: isCommunities });

  useEffect(() => {
    const node = sentinel.current;
    if (!node || isCommunities) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
    });
    io.observe(node);
    return () => io.disconnect();
  }, [isCommunities, feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  const items = (feed.data?.pages ?? []).flat();

  return (
    <AppShell>
      <div
        role="tablist"
        aria-label="Feed filters"
        className="no-scrollbar -mx-4 mb-3 flex gap-1 overflow-x-auto px-4"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
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

      {isCommunities ? (
        communities.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {(communities.data ?? []).map((c) => (
              <Link key={c.id} to="/communities/$slug" params={{ slug: c.slug }} className="surface tap flex gap-3 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevated text-xl">
                  {c.emoji}
                </span>
                <div className="min-w-0">
                  <p className="font-display font-bold">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                  <p className="text-[11px] text-muted-foreground">{formatCount(c.memberCount)} members</p>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : feed.isError ? (
        <ErrorState onRetry={() => feed.refetch()} />
      ) : feed.isLoading ? (
        <>
          <ConfessionSkeleton />
          <ConfessionSkeleton />
          <ConfessionSkeleton />
        </>
      ) : items.length === 0 ? (
        <EmptyFeed />
      ) : (
        <>
          {items.map((c) => (
            <ConfessionCard key={c.id} confession={c} />
          ))}
          <div ref={sentinel} className="flex justify-center py-6">
            {feed.isFetchingNextPage ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : !feed.hasNextPage ? (
              <p className="text-xs text-muted-foreground">You've reached the end.</p>
            ) : null}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="surface flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-3xl">📡</p>
      <p className="font-display text-lg font-bold">Couldn't load the feed</p>
      <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
      <button
        onClick={onRetry}
        className="tap rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
      >
        Try again
      </button>
    </div>
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

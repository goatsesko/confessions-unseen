import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ConfessionCard } from "@/components/ConfessionCard";
import { fetchCommunities, fetchFeed } from "@/lib/api";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — Comrades Confessions" },
      { name: "description", content: "Search anonymous confessions, communities and categories." },
      { property: "og:title", content: "Search — Comrades Confessions" },
      { property: "og:description", content: "Find confessions, communities and categories." },
    ],
  }),
  component: SearchPage,
});

const TRENDING = ["heartbreak", "hostel", "boss", "in-laws", "therapy", "crush"];

function SearchPage() {
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["search", q],
    queryFn: () => fetchFeed({ sort: "recent", search: q }),
    enabled: q.trim().length > 1,
  });
  const communities = useQuery({ queryKey: ["communities"], queryFn: fetchCommunities });

  const matchedCommunities = (communities.data ?? []).filter(
    (c) => q.trim().length > 1 && c.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-2 rounded-full border border-border bg-card px-4">
        <SearchIcon className="h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search confessions, communities…"
          className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {q.trim().length < 2 ? (
        <>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Trending searches</p>
          <div className="flex flex-wrap gap-2">
            {TRENDING.map((t) => (
              <button
                key={t}
                onClick={() => setQ(t)}
                className="tap rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
              >
                #{t}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {matchedCommunities.map((c) => (
            <Link
              key={c.id}
              to="/communities/$slug"
              params={{ slug: c.slug }}
              className="surface tap mb-3 flex items-center gap-3 p-4"
            >
              <span className="text-xl">{c.emoji}</span>
              <span className="font-display font-bold">{c.name}</span>
            </Link>
          ))}
          {results.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>}
          {(results.data ?? []).map((c) => (
            <ConfessionCard key={c.id} confession={c} />
          ))}
          {!results.isLoading && (results.data ?? []).length === 0 && matchedCommunities.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing found for "{q}".</p>
          )}
        </>
      )}
    </AppShell>
  );
}

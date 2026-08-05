import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Comrades Confessions" },
      { name: "description", content: "Replies, mentions, likes and community announcements." },
      { property: "og:title", content: "Notifications — Comrades Confessions" },
      { property: "og:description", content: "Replies, mentions and community announcements." },
    ],
  }),
  component: () => (
    <AppShell>
      <h1 className="mb-4 font-display text-xl font-extrabold">Notifications</h1>
      <div className="surface flex flex-col items-center gap-2 p-10 text-center">
        <p className="text-4xl">🔔</p>
        <p className="font-display font-bold">All quiet</p>
        <p className="text-sm text-muted-foreground">
          Replies, mentions and community announcements will land here.
        </p>
      </div>
    </AppShell>
  ),
});

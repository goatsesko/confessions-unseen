import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone, Search, Video } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Comrades Confessions" },
      { name: "description", content: "Private chats, voice notes and calls with the comrades you connect with." },
      { property: "og:title", content: "Inbox — Comrades Confessions" },
      { property: "og:description", content: "Private chats and calls with comrades you connect with." },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const { user } = useAuth();

  return (
    <AppShell>
      <h1 className="mb-3 font-display text-xl font-extrabold">Inbox</h1>

      <div className="mb-4 flex items-center gap-2 rounded-full border border-border bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          placeholder="Search messages"
          className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {!user ? (
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-4xl">💬</p>
          <p className="font-display font-bold">Sign in to message</p>
          <p className="text-sm text-muted-foreground">
            Chats, voice notes and calls are for signed-in comrades only.
          </p>
          <Link
            to="/auth"
            className="tap rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex gap-3 text-primary">
            <Phone className="h-6 w-6" />
            <Video className="h-6 w-6" />
          </div>
          <p className="font-display font-bold">No conversations yet</p>
          <p className="text-sm text-muted-foreground">
            Reply to someone's comment to start a private chat. Voice and video calls arrive in the next drop.
          </p>
        </div>
      )}
    </AppShell>
  );
}

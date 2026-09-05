import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Bookmark,
  Home,
  Inbox,
  LogOut,
  Menu,
  MessageSquareLock,
  PenSquare,
  Phone,
  Search,
  Shield,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin } from "@/lib/api";
import { CALL_COMING_SOON } from "@/lib/calls";

const LINKS = [
  { to: "/", label: "Home feed", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/communities", label: "Communities", icon: Users },
  { to: "/compose", label: "New confession", icon: PenSquare },
  { to: "/inbox", label: "Messages", icon: Inbox },
  { to: "/notifications", label: "Notifications", icon: Bell },
] as const;

const SETTINGS = [
  { to: "/profile", label: "Profile & photo", icon: User, hint: "Username, picture, bio, town" },
  { to: "/profile", label: "Privacy & messages", icon: MessageSquareLock, hint: "Who can message you, online status, receipts" },
  { to: "/profile", label: "My comments & reposts", icon: Bookmark, hint: "Everything you've joined in on" },
] as const;

export function MainMenu() {
  const [open, setOpen] = useState(false);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const admin = useQuery({
    queryKey: ["is-admin", user?.id ?? null],
    enabled: !!user,
    queryFn: () => isAdmin(user!.id),
  });

  const close = () => setOpen(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    close();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="tap rounded-full p-2 text-foreground/80 hover:bg-elevated"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[86vw] max-w-sm overflow-y-auto border-border bg-background p-0">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="font-display text-base font-extrabold">Menu</SheetTitle>
          {user && profile ? (
            <Link to="/u/$username" params={{ username: profile.username }} onClick={close} className="mt-2 flex items-center gap-3">
              <UserAvatar username={profile.username} avatarPath={profile.avatar_url} size="md" />
              <span>
                <span className="block text-sm font-bold">@{profile.username}</span>
                <span className="block text-[11px] text-muted-foreground">View public profile</span>
              </span>
            </Link>
          ) : (
            <Link
              to="/auth"
              onClick={close}
              className="mt-2 inline-flex w-fit rounded-full bg-primary px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-foreground"
            >
              Sign in
            </Link>
          )}
        </SheetHeader>

        <nav className="p-2">
          <Group label="Browse" />
          {LINKS.map((l) => (
            <Row key={l.label} to={l.to} label={l.label} icon={l.icon} onClick={close} />
          ))}

          <Group label="Settings" />
          {SETTINGS.map((s) => (
            <Row key={s.label} to={s.to} label={s.label} hint={s.hint} icon={s.icon} onClick={close} />
          ))}

          {admin.data && (
            <>
              <Group label="Staff" />
              <Row to="/admin" label="Admin dashboard" hint="Moderation, reports, audit logs" icon={Shield} onClick={close} />
            </>
          )}

          <Group label="More" />
          <button
            onClick={() => toast.info(CALL_COMING_SOON)}
            className="tap flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-elevated"
          >
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>
              <span className="block font-medium">Voice & video calls</span>
              <span className="block text-[11px] text-muted-foreground">Premium — coming soon</span>
            </span>
          </button>

          {user && (
            <button
              onClick={signOut}
              className="tap mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-destructive hover:bg-elevated"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          )}

          <p className="px-3 py-4 text-[11px] leading-relaxed text-muted-foreground">
            Confessions you post anonymously are never linked to this account.
          </p>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function Group({ label }: { label: string }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
  );
}

function Row({
  to,
  label,
  hint,
  icon: Icon,
  onClick,
}: {
  to: string;
  label: string;
  hint?: string | undefined;
  icon: typeof Home;
  onClick: () => void;
}) {
  return (
    <Link to={to} onClick={onClick} className="tap flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-elevated">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </Link>
  );
}

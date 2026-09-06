import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Home, Inbox, Plus, Search, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import logo from "@/assets/mask-logo.png";
import { MainMenu } from "@/components/MainMenu";
import { cn } from "@/lib/utils";


const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/communities", label: "Communities", icon: Users },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function TopBar({ title }: { title?: ReactNode }) {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
        <Link to="/" className="tap flex items-center gap-2">
          <img src={logo} alt="Comrades Confessions" className="h-7 w-7" />
          {title ?? (
            <span className="font-display text-[13px] font-extrabold leading-3 tracking-tight">
              COMRADES
              <br />
              <span className="text-primary">CONFESSIONS</span>
            </span>
          )}
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <Link to="/search" className="tap rounded-full p-2 text-foreground/80 hover:bg-elevated">
            <Search className="h-5 w-5" />
          </Link>
          <Link to="/notifications" className="tap relative rounded-full p-2 text-foreground/80 hover:bg-elevated">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
          </Link>
          <MainMenu />
        </div>

      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
      <div className="mx-auto grid max-w-2xl grid-cols-5 items-center px-2">
        {NAV.slice(0, 2).map((item) => (
          <NavItem key={item.to} {...item} active={pathname === item.to} />
        ))}
        <div className="flex justify-center">
          <Link
            to="/compose"
            aria-label="Post a confession"
            className="tap pink-glow -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary"
          >
            <Plus className="h-7 w-7 text-primary-foreground" />
          </Link>
        </div>
        {NAV.slice(2).map((item) => (
          <NavItem key={item.to} {...item} active={pathname === item.to} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "tap flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
      {label}
    </Link>
  );
}

export function AppShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {header ?? <TopBar />}
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-3">{children}</main>
      <BottomNav />
    </div>
  );
}

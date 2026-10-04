import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/mask-logo.png";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Whispr" },
      { name: "description", content: "Sign in with Google to comment, join communities and message comrades." },
      { property: "og:title", content: "Sign in — Whispr" },
      { property: "og:description", content: "Your email stays private forever." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [isAdult, setIsAdult] = useState(false);

  async function signIn() {
    if (!isAdult) {
      toast.error("You must confirm you're 18 or older");
      return;
    }
    setBusy(true);
    window.localStorage.setItem("cc_age_confirmed", new Date().toISOString());
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (result.error) {
      toast.error("Sign in failed. Try again.");
      setBusy(false);
      return;
    }
    if (!result.redirected) setBusy(false);
  }

  async function saveUsername() {
    if (!user) return;
    const handle = username.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      toast.error("3-20 letters, numbers or underscores");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      username: handle,
      age_confirmed_at: window.localStorage.getItem("cc_age_confirmed") ?? new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "That username is taken" : "Couldn't save username");
      return;
    }
    navigate({ to: "/" });
  }


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <img src={logo} alt="Whispr" width={512} height={512} className="mb-4 h-20 w-20" />
      <h1 className="font-display text-3xl font-extrabold leading-none">
        WHISP<span className="text-primary">R</span>
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">Speak freely. Stay anonymous.</p>

      {!user ? (
        <>
          <label className="tap mt-8 flex w-full max-w-xs items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left">
            <input
              type="checkbox"
              checked={isAdult}
              onChange={(e) => setIsAdult(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            />
            <span className="text-sm">
              I'm 18 years or older
              <span className="mt-0.5 block text-xs text-muted-foreground">
                This community discusses adult topics. You must be 18+ to join.
              </span>
            </span>
          </label>
          <button
            onClick={signIn}
            disabled={busy || !isAdult}
            className="tap pink-glow mt-4 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue with Google
          </button>
          <p className="mt-4 max-w-xs text-xs text-muted-foreground">
            Your email and real name stay private forever. You never need an account to confess — only to comment and
            message.
          </p>
        </>
      ) : profile ? (

        <>
          <p className="mt-8 text-sm">You're signed in as @{profile.username}</p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="tap mt-4 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Go to feed
          </button>
        </>
      ) : (
        <div className="mt-8 w-full max-w-xs">
          <p className="mb-2 text-sm font-semibold">Pick your username</p>
          <div className="flex h-12 items-center rounded-full border border-border bg-card px-4">
            <span className="text-muted-foreground">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ghost254"
              className="ml-1 h-full flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <button
            onClick={saveUsername}
            disabled={busy}
            className="tap mt-3 h-12 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

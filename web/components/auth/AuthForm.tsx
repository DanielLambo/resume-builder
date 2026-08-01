"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

function AuthFormInner({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || (mode === "signup" ? "/onboarding" : "/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "auth_callback" ? "Sign-in failed. Try again." : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error: signError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signError) {
          setError(signError.message);
          toast.error(signError.message);
          return;
        }
        toast.success("Welcome back");
        // Always land on the product; server gates (shouldForceOnboarding)
        // grandfather existing users who already have resumes.
        router.replace(next);
        router.refresh();
        return;
      }

      const origin = window.location.origin;
      const { data, error: signError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (signError) {
        setError(signError.message);
        toast.error(signError.message);
        return;
      }
      if (data.session) {
        toast.success("Account created");
        router.replace("/onboarding");
        router.refresh();
        return;
      }
      setInfo("Check your email to confirm, then sign in.");
      toast.message("Confirmation email sent");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        toast.error(oauthError.message);
        setPending(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setError(message);
      toast.error(message);
      setPending(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <main className="grid min-h-dvh place-items-center bg-studio-bg px-4 py-10">
      <div className="w-full max-w-md border border-studio-border bg-studio-paper p-6 shadow-paper-sheet sm:p-8">
        <p className="font-mono text-xs tracking-wide text-studio-muted">
          TYPESETTER / RESUME ENGINE
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-studio-ink sm:text-3xl">
          {isLogin ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-studio-muted">
          {isLogin
            ? "Return to your drafting table."
            : "Open a studio desk. Tailor a version for each job."}
        </p>

        <button
          type="button"
          onClick={onGoogle}
          disabled={pending}
          className="mt-6 w-full border border-studio-border bg-white px-4 py-2.5 text-sm font-medium text-studio-ink transition hover:bg-studio-canvas disabled:opacity-60"
        >
          Continue with Google
        </button>

        <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 font-mono text-[0.65rem] text-studio-muted">
          <span className="h-px bg-studio-border" />
          <span>or email</span>
          <span className="h-px bg-studio-border" />
        </div>

        <form className="grid gap-3.5" onSubmit={onSubmit}>
          <label className="grid gap-1.5 text-xs text-studio-muted">
            Email
            <input
              className="border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-xs text-studio-muted">
            Password
            <input
              className="border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-studio-vermilion">{error}</p> : null}
          {info ? <p className="text-sm text-emerald-700">{info}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60"
          >
            {pending ? (isLogin ? "Signing in…" : "Creating…") : isLogin ? "Sign in" : "Sign up"}
          </button>
        </form>

        <p className="mt-5 text-sm text-studio-muted">
          {isLogin ? (
            <>
              No account?{" "}
              <Link className="text-studio-ink underline underline-offset-2" href="/signup">
                Create one
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link className="text-studio-ink underline underline-offset-2" href="/login">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-studio-bg text-studio-muted">
          Loading…
        </main>
      }
    >
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}

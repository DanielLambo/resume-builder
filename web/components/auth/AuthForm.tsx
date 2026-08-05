"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { toast } from "sonner";

import {
  confirmEmailForLoginAction,
  signUpConfirmedAction,
} from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Wrong email or password.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "That email isn’t confirmed yet — fixing that now…";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute, or try you+demo@gmail.com.";
  }
  return message;
}

function AuthFormInner({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || (mode === "signup" ? "/onboarding" : "/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "auth_callback"
      ? "That confirmation link can’t finish. Create the account again here — no email needed."
      : null,
  );

  async function finishLogin(supabase: ReturnType<typeof createClient>) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const needsSetup = user?.user_metadata?.onboarding_completed !== true;
    router.replace(needsSetup ? "/onboarding" : next === "/onboarding" ? "/dashboard" : next);
    router.refresh();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();

      if (mode === "signup") {
        const created = await signUpConfirmedAction(email, password);
        if (!created.ok) {
          setError(created.error);
          toast.error(created.error);
          return;
        }

        const { error: signError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signError) {
          const msg = friendlyAuthError(signError.message);
          setError(msg);
          toast.error(msg);
          return;
        }

        toast.success("Account ready");
        await finishLogin(supabase);
        return;
      }

      let { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signError && /not confirmed|email not confirmed/i.test(signError.message)) {
        const repaired = await confirmEmailForLoginAction(email);
        if (!repaired.ok) {
          setError(repaired.error);
          toast.error(repaired.error);
          return;
        }
        ({ error: signError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }));
      }

      if (signError) {
        const msg = friendlyAuthError(signError.message);
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success("Welcome back");
      await finishLogin(supabase);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <main className="grid min-h-dvh place-items-center bg-studio-bg px-3 py-8 sm:px-4 sm:py-10">
      <div className="w-full max-w-md border border-studio-border bg-studio-paper p-5 shadow-paper-sheet sm:p-8">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-studio-ink hover:opacity-80"
        >
          Resumate
        </Link>
        <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-studio-muted">
          {isLogin ? "Welcome back" : "New desk"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-studio-ink sm:text-3xl">
          {isLogin ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-studio-muted">
          {isLogin
            ? "Return to your library and keep drafting."
            : "Email + password — you’re in immediately. No confirmation email."}
        </p>

        <form className="mt-6 grid gap-3.5" onSubmit={onSubmit}>
          <label className="grid gap-1.5 text-xs text-studio-muted">
            Email
            <input
              className="border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion disabled:opacity-60"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={pending}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
            />
          </label>
          <label className="grid gap-1.5 text-xs text-studio-muted">
            Password
            <input
              className="border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion disabled:opacity-60"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              disabled={pending}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? (
            <p
              className="border border-studio-vermilion/25 bg-red-50/80 px-3 py-2 text-sm text-studio-vermilion"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 min-h-11 bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60"
          >
            {pending
              ? isLogin
                ? "Signing in…"
                : "Creating…"
              : isLogin
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-sm text-studio-muted">
          {isLogin ? (
            <>
              No account?{" "}
              <Link
                className="text-studio-ink underline underline-offset-2"
                href={next && next !== "/dashboard" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
              >
                Create one
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                className="text-studio-ink underline underline-offset-2"
                href={next && next !== "/onboarding" ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              >
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

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { toast } from "sonner";

import {
  confirmEmailForLoginAction,
  signUpConfirmedAction,
} from "@/app/actions/auth";
import {
  AFTER_SETUP_STORAGE_KEY,
  isSetupDestination,
  onboardingPathWithNext,
  safeNextPath,
} from "@/lib/auth-next";
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

function rememberAfterSetup(next: string) {
  try {
    if (!isSetupDestination(next) && next !== "/dashboard") {
      window.sessionStorage.setItem(AFTER_SETUP_STORAGE_KEY, next);
    }
  } catch {
    /* ignore */
  }
}

function go(path: string) {
  window.location.assign(path);
}

function AuthFormInner({ mode }: { mode: AuthMode }) {
  const params = useSearchParams();
  const next = safeNextPath(
    params.get("next"),
    mode === "signup" ? "/onboarding" : "/dashboard",
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "auth_callback"
      ? "That confirmation link can’t finish. Create the account again here — no email needed."
      : null,
  );

  async function destinationAfterSignIn(
    supabase: ReturnType<typeof createClient>,
  ): Promise<string> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const needsSetup = user?.user_metadata?.onboarding_completed !== true;
    if (needsSetup) {
      rememberAfterSetup(next);
      return onboardingPathWithNext(next);
    }
    if (isSetupDestination(next)) return "/dashboard";
    return next;
  }

  async function signInWithPassword(supabase: ReturnType<typeof createClient>) {
    return supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
  }

  async function signInWithRetry(supabase: ReturnType<typeof createClient>) {
    let lastMessage = "Could not sign in.";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { error } = await signInWithPassword(supabase);
      if (!error) {
        await supabase.auth.getSession();
        return null;
      }
      lastMessage = error.message;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    return lastMessage;
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
          if (created.code === "already_exists") {
            const { error: existingSignError } = await signInWithPassword(supabase);
            if (!existingSignError) {
              toast.success("Welcome back");
              go(await destinationAfterSignIn(supabase));
              return;
            }
            const msg =
              "An account with this email already exists. Sign in with your password.";
            setError(msg);
            toast.error(msg);
            return;
          }
          setError(created.error);
          toast.error(created.error);
          return;
        }

        const signError = await signInWithRetry(supabase);
        if (signError) {
          const msg = friendlyAuthError(signError);
          setError(msg);
          toast.error(msg);
          return;
        }

        toast.success("Account ready");
        rememberAfterSetup(next);
        go(onboardingPathWithNext(next));
        return;
      }

      let { error: signError } = await signInWithPassword(supabase);

      if (signError && /not confirmed|email not confirmed/i.test(signError.message)) {
        const repaired = await confirmEmailForLoginAction(email);
        if (!repaired.ok) {
          setError(repaired.error);
          toast.error(repaired.error);
          return;
        }
        ({ error: signError } = await signInWithPassword(supabase));
      }

      if (signError) {
        const msg = friendlyAuthError(signError.message);
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success("Welcome back");
      go(await destinationAfterSignIn(supabase));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const isLogin = mode === "login";
  const crossHref = isLogin
    ? next && next !== "/dashboard"
      ? `/signup?next=${encodeURIComponent(next)}`
      : "/signup"
    : next && next !== "/onboarding"
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login";

  return (
    <main className="grid min-h-dvh place-items-center bg-studio-bg px-3 py-8 sm:px-4 sm:py-10">
      <div className="w-full max-w-md rounded-2xl border border-studio-border bg-studio-paper p-5 shadow-paper-sheet sm:p-8">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-studio-ink hover:opacity-80"
        >
          Resumate
        </Link>
        <p className="mt-3 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-studio-muted">
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
              className="rounded-lg border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion disabled:opacity-60"
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
              className="rounded-lg border border-studio-border bg-white px-3 py-2.5 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion disabled:opacity-60"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              disabled={pending}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? undefined : "At least 6 characters"}
            />
          </label>

          {error ? (
            <p
              className="rounded-lg border border-studio-vermilion/25 bg-red-50/80 px-3 py-2 text-sm text-studio-vermilion"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 min-h-11 rounded-xl bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60"
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
              <Link className="text-studio-ink underline underline-offset-2" href={crossHref}>
                Create one
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link className="text-studio-ink underline underline-offset-2" href={crossHref}>
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

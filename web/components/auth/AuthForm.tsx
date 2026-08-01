"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { toast } from "sonner";

import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";
type PendingAction = "idle" | "email" | "google";

function switchHref(mode: AuthMode, rawNext: string | null): string {
  const target = mode === "login" ? "/signup" : "/login";
  if (!rawNext) return target;
  const preserved = safeNextPath(
    rawNext,
    mode === "login" ? "/onboarding" : "/dashboard",
  );
  return `${target}?next=${encodeURIComponent(preserved)}`;
}

function AuthFormInner({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  const next = safeNextPath(
    rawNext,
    mode === "signup" ? "/onboarding" : "/dashboard",
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>("idle");
  const [error, setError] = useState<string | null>(
    params.get("error") === "auth_callback"
      ? "Sign-in failed. Try again."
      : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  const pending = pendingAction !== "idle";
  const isLogin = mode === "login";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPendingAction("email");
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Enter a valid email.");
      setPendingAction("idle");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setPendingAction("idle");
      return;
    }

    try {
      const supabase = createClient();
      if (isLogin) {
        const { error: signError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signError) {
          setError(signError.message);
          toast.error(signError.message);
          return;
        }
        toast.success("Welcome back");
        router.replace(next);
        router.refresh();
        return;
      }

      const origin = window.location.origin;
      const { data, error: signError } = await supabase.auth.signUp({
        email: trimmedEmail,
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

      // Supabase returns a user with empty identities when the email is taken.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setError("An account with this email already exists. Sign in instead.");
        return;
      }

      if (data.session) {
        toast.success("Account created");
        router.replace("/onboarding");
        router.refresh();
        return;
      }

      setInfo("Check your email to confirm your account, then sign in.");
      toast.message("Confirmation email sent");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      const friendly = /Missing NEXT_PUBLIC_SUPABASE/i.test(message)
        ? "Sign-in isn’t configured in this environment yet."
        : message;
      setError(friendly);
      toast.error(friendly);
    } finally {
      setPendingAction("idle");
    }
  }

  async function onGoogle() {
    setPendingAction("google");
    setError(null);
    setInfo(null);
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
        setPendingAction("idle");
      }
      // On success the browser navigates away; keep pending until then.
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Google sign-in failed";
      const friendly = /Missing NEXT_PUBLIC_SUPABASE/i.test(message)
        ? "Sign-in isn’t configured in this environment yet."
        : message;
      setError(friendly);
      toast.error(friendly);
      setPendingAction("idle");
    }
  }

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-studio-bg">
      <div className="absolute inset-0" aria-hidden="true">
        <Image
          src="/images/landing-hero-typist.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[72%_34%] opacity-40 sm:opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#FAF8F5] via-[#FAF8F5]/92 to-[#FAF8F5]/55 sm:via-[#FAF8F5]/88 sm:to-[#FAF8F5]/40" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#FAF8F5] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:gap-20 lg:px-10 lg:py-16">
        <div className="mb-8 max-w-md animate-hero-rise lg:mb-0 lg:flex-1">
          <Link
            href="/"
            className="inline-block font-semibold tracking-tight text-studio-ink text-[clamp(2.4rem,7vw,3.75rem)] leading-[0.95] transition hover:opacity-80"
          >
            Resumate
          </Link>
          <p className="mt-4 max-w-[22ch] text-[1.35rem] font-semibold leading-snug tracking-tight text-studio-ink sm:text-[1.65rem]">
            {isLogin
              ? "Welcome back to your resume desk."
              : "Start a sharper resume for every job."}
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-studio-muted sm:text-base">
            {isLogin
              ? "Pick up where you left off — honest AI edits, reviews, and a one-page lock."
              : "Create an account to tailor honestly, get hiring-manager feedback, and export a clean PDF."}
          </p>
        </div>

        <div className="w-full max-w-md animate-hero-rise border border-studio-ink/10 bg-studio-paper/95 p-5 shadow-paper-sheet backdrop-blur-sm sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-studio-ink sm:text-2xl">
            {isLogin ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-studio-muted">
            {isLogin ? "Use Google or email." : "Free to start — no card required."}
          </p>

          <button
            type="button"
            onClick={onGoogle}
            disabled={pending}
            data-testid="auth-google"
            className="mt-6 flex min-h-12 w-full items-center justify-center gap-2.5 border border-studio-border bg-white px-4 py-2.5 text-sm font-medium text-studio-ink transition hover:bg-studio-canvas disabled:opacity-60"
          >
            <GoogleMark />
            {pendingAction === "google"
              ? "Redirecting…"
              : "Continue with Google"}
          </button>

          <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[0.7rem] uppercase tracking-[0.14em] text-studio-muted">
            <span className="h-px bg-studio-border" />
            <span>or email</span>
            <span className="h-px bg-studio-border" />
          </div>

          <form className="grid gap-4" onSubmit={onSubmit} noValidate>
            <label className="grid gap-1.5 text-sm font-medium text-studio-ink">
              Email
              <input
                className="min-h-12 border border-studio-border bg-white px-3 py-2.5 text-base text-studio-ink outline-none transition placeholder:text-studio-muted/60 focus:border-studio-ink/30 focus:ring-2 focus:ring-studio-vermilion/30 disabled:opacity-60"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                disabled={pending}
                value={email}
                placeholder="you@email.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-studio-ink">
              <span className="flex items-center justify-between gap-2">
                Password
                {isLogin ? (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-normal text-studio-muted underline underline-offset-2 transition hover:text-studio-ink"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </span>
              <input
                className="min-h-12 border border-studio-border bg-white px-3 py-2.5 text-base text-studio-ink outline-none transition placeholder:text-studio-muted/60 focus:border-studio-ink/30 focus:ring-2 focus:ring-studio-vermilion/30 disabled:opacity-60"
                type="password"
                name="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={6}
                disabled={pending}
                value={password}
                placeholder={isLogin ? "Your password" : "At least 6 characters"}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error ? (
              <p
                className="text-sm leading-relaxed text-studio-vermilion"
                role="alert"
                data-testid="auth-error"
              >
                {error}
              </p>
            ) : null}
            {info ? (
              <p
                className="text-sm leading-relaxed text-emerald-700"
                data-testid="auth-info"
              >
                {info}{" "}
                <Link
                  className="font-medium text-studio-ink underline underline-offset-2"
                  href={switchHref("signup", rawNext)}
                >
                  Sign in
                </Link>
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              data-testid="auth-submit"
              className="mt-1 min-h-12 bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60"
            >
              {pendingAction === "email"
                ? isLogin
                  ? "Signing in…"
                  : "Creating…"
                : isLogin
                  ? "Sign in"
                  : "Sign up"}
            </button>
          </form>

          <p className="mt-5 text-sm text-studio-muted">
            {isLogin ? (
              <>
                No account?{" "}
                <Link
                  className="font-medium text-studio-ink underline underline-offset-2"
                  href={switchHref("login", rawNext)}
                >
                  Create one
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link
                  className="font-medium text-studio-ink underline underline-offset-2"
                  href={switchHref("signup", rawNext)}
                >
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-studio-bg px-5">
          <div className="w-full max-w-md animate-pulse">
            <div className="h-10 w-40 bg-studio-border/70" />
            <div className="mt-4 h-6 w-64 bg-studio-border/50" />
            <div className="mt-8 h-72 border border-studio-border bg-studio-paper" />
          </div>
        </main>
      }
    >
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}

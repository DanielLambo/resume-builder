"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter a valid email.");
      setPending(false);
      return;
    }
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmed,
        {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
        },
      );
      if (resetError) {
        setError(resetError.message);
        toast.error(resetError.message);
        return;
      }
      setSent(true);
      toast.message("Check your email for a reset link");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not send reset email";
      const friendly = /Missing NEXT_PUBLIC_SUPABASE/i.test(message)
        ? "Password reset isn’t configured in this environment yet."
        : message;
      setError(friendly);
      toast.error(friendly);
    } finally {
      setPending(false);
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
          className="object-cover object-[72%_34%] opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#FAF8F5] via-[#FAF8F5]/92 to-[#FAF8F5]/55" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
        <Link
          href="/"
          className="font-semibold tracking-tight text-studio-ink text-3xl leading-none"
        >
          Resumate
        </Link>
        <div className="mt-8 border border-studio-ink/10 bg-studio-paper/95 p-5 shadow-paper-sheet sm:p-7">
          <h1 className="text-xl font-semibold text-studio-ink">
            Reset password
          </h1>
          <p className="mt-1 text-sm text-studio-muted">
            We’ll email you a secure link to choose a new password.
          </p>

          {sent ? (
            <p className="mt-6 text-sm leading-relaxed text-emerald-700">
              If an account exists for that email, a reset link is on the way.
              Check your inbox, then return to{" "}
              <Link className="underline underline-offset-2" href="/login">
                sign in
              </Link>
              .
            </p>
          ) : (
            <form className="mt-6 grid gap-4" onSubmit={onSubmit} noValidate>
              <label className="grid gap-1.5 text-sm font-medium text-studio-ink">
                Email
                <input
                  className="min-h-12 border border-studio-border bg-white px-3 py-2.5 text-base text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion/30"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={pending}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {error ? (
                <p className="text-sm text-studio-vermilion" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="min-h-12 bg-studio-vermilion px-4 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-5 text-sm text-studio-muted">
            <Link
              className="font-medium text-studio-ink underline underline-offset-2"
              href="/login"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setPending(false);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
        toast.error(updateError.message);
        return;
      }
      toast.success("Password updated");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update password";
      setError(message);
      toast.error(message);
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
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-studio-muted">
            Use at least 6 characters.
          </p>
          <form className="mt-6 grid gap-4" onSubmit={onSubmit} noValidate>
            <label className="grid gap-1.5 text-sm font-medium text-studio-ink">
              New password
              <input
                className="min-h-12 border border-studio-border bg-white px-3 py-2.5 text-base text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion/30"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                disabled={pending}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-studio-ink">
              Confirm password
              <input
                className="min-h-12 border border-studio-border bg-white px-3 py-2.5 text-base text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion/30"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                disabled={pending}
                onChange={(e) => setConfirm(e.target.value)}
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
              {pending ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

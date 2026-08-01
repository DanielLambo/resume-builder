"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-studio-bg px-5 py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-semibold tracking-tight text-studio-ink text-3xl">
          Resumate
        </p>
        <h1 className="mt-4 text-xl font-semibold text-studio-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-studio-muted">
          Your drafts are safe. Try again, or return to your library.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 bg-studio-vermilion px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center border border-studio-border bg-studio-paper px-4 py-2.5 text-sm font-semibold text-studio-ink transition hover:bg-studio-canvas"
          >
            Library
          </Link>
        </div>
      </div>
    </main>
  );
}

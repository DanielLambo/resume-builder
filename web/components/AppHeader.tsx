"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { signOutAction } from "@/app/actions/resumes";
import { TokenMeter } from "@/components/TokenMeter";
import { createClient } from "@/lib/supabase/client";

type AppHeaderProps = {
  email?: string | null;
  showMeter?: boolean;
};

export function AppHeader({ email, showMeter = true }: AppHeaderProps) {
  const [pending, startTransition] = useTransition();

  function onSignOut() {
    startTransition(async () => {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
        await signOutAction();
      } catch {
        /* still leave the session cookies behind via a hard nav */
      }
      toast.message("Signed out");
      window.location.assign("/login");
    });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-studio-border bg-studio-bg/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-none items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-semibold tracking-tight text-studio-ink"
          >
            Resumate
          </Link>
          <nav className="hidden items-center gap-3 text-xs text-studio-muted sm:flex">
            <Link href="/dashboard" className="hover:text-studio-ink">
              Library
            </Link>
            <Link href="/import" className="hover:text-studio-ink">
              Import
            </Link>
          </nav>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {showMeter ? (
            <div data-tour="ai-quota">
              <div className="md:hidden">
                <TokenMeter compact />
              </div>
              <div className="hidden md:block">
                <TokenMeter />
              </div>
            </div>
          ) : null}
          {email ? (
            <span className="hidden max-w-[160px] truncate font-mono text-[0.65rem] text-studio-muted lg:inline">
              {email}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            disabled={pending}
            className="min-h-9 shrink-0 rounded-lg border border-studio-border bg-studio-paper px-2.5 py-1.5 text-xs font-medium text-studio-ink hover:bg-studio-canvas disabled:opacity-60 sm:px-3"
          >
            {pending ? "…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}

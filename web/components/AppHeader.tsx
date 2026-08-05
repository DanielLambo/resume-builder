"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { signOutAction } from "@/app/actions/resumes";
import { TokenMeter } from "@/components/TokenMeter";

type AppHeaderProps = {
  email?: string | null;
  showMeter?: boolean;
};

export function AppHeader({ email, showMeter = true }: AppHeaderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSignOut() {
    startTransition(async () => {
      try {
        await signOutAction();
      } catch (err) {
        if (isRedirectError(err)) {
          toast.message("Signed out");
          return;
        }
        router.replace("/login");
      }
      toast.message("Signed out");
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
          <nav className="hidden items-center gap-1 font-mono text-xs text-studio-muted sm:flex">
            <Link href="/dashboard" className="hover:text-studio-ink">
              Library
            </Link>
            <span aria-hidden="true" className="px-1">
              |
            </span>
            <span className="text-studio-muted/80">Typesetter Studio</span>
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
            className="min-h-9 shrink-0 border border-studio-border bg-studio-paper px-2.5 py-1.5 text-xs font-medium text-studio-ink hover:bg-studio-canvas disabled:opacity-60 sm:px-3"
          >
            {pending ? "…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}

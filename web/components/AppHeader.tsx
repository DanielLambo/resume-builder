"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { signOutAction } from "@/app/actions/resumes";
import { TokenMeter } from "@/components/TokenMeter";
import { createClient } from "@/lib/supabase/client";

type AppHeaderProps = {
  email?: string | null;
  showMeter?: boolean;
};

function initialFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() || "U";
  return local.slice(0, 1).toUpperCase();
}

export function AppHeader({ email, showMeter = true }: AppHeaderProps) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const onResumes = pathname.startsWith("/dashboard") || pathname.startsWith("/editor");

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
    <header className="sticky top-0 z-40 border-b border-studio-border/80 bg-[#fbfbfa]/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-5 sm:gap-8">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-semibold tracking-tight text-[#1a1a1a]"
          >
            Resumate
          </Link>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <Link
              href="/dashboard"
              className={`rounded-full px-3 py-1.5 transition ${
                onResumes && !pathname.startsWith("/import")
                  ? "bg-white text-[#1a1a1a] shadow-sm"
                  : "text-studio-muted hover:text-[#1a1a1a]"
              }`}
            >
              Resumes
            </Link>
            <Link
              href="/dashboard?new=1"
              className="rounded-full px-3 py-1.5 text-studio-muted transition hover:text-[#1a1a1a]"
            >
              Templates
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
          <div className="flex min-h-9 items-center gap-2 rounded-full border border-slate-200/80 bg-white py-0.5 pl-0.5 pr-1 shadow-sm">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-[0.7rem] font-semibold text-white"
              aria-hidden="true"
            >
              {email ? initialFromEmail(email) : "?"}
            </span>
            {email ? (
              <span className="hidden max-w-[9rem] truncate text-xs text-[#1a1a1a] lg:inline">
                {email}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSignOut}
              disabled={pending}
              className="min-h-8 shrink-0 rounded-full px-2.5 text-xs font-medium text-studio-muted transition hover:bg-studio-canvas hover:text-[#1a1a1a] disabled:opacity-60"
            >
              {pending ? "Signing out" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

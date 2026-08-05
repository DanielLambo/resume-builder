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
  /** Slim chrome for the editor — keeps vertical space for source + preview. */
  dense?: boolean;
  /** Dark IDE chrome used on the resume editor. */
  variant?: "default" | "ide";
};

function initialFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() || "U";
  return local.slice(0, 1).toUpperCase();
}

export function AppHeader({
  email,
  showMeter = true,
  dense = false,
  variant = "default",
}: AppHeaderProps) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const onResumes =
    pathname.startsWith("/dashboard") || pathname.startsWith("/editor");
  const ide = variant === "ide";

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
    <header
      className={[
        "sticky top-0 z-40 shrink-0 border-b",
        ide
          ? "border-ide-border bg-ide-panel"
          : "border-studio-border/80 bg-[#fbfbfa]/95 backdrop-blur-sm",
      ].join(" ")}
    >
      <div
        className={[
          "mx-auto flex w-full items-center justify-between gap-2 sm:px-6",
          dense ? "h-9 px-3 sm:px-4" : "gap-3 px-3 py-2.5",
        ].join(" ")}
      >
        <div
          className={[
            "flex min-w-0 items-center",
            dense ? "gap-3 sm:gap-4" : "gap-5 sm:gap-8",
          ].join(" ")}
        >
          <Link
            href="/dashboard"
            className={[
              "shrink-0 font-semibold tracking-tight",
              dense ? "text-[0.8rem]" : "text-sm",
              ide ? "text-ide-ink" : "text-[#1a1a1a]",
            ].join(" ")}
          >
            Resumate
          </Link>
          {!dense ? (
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
          ) : (
            <Link
              href="/dashboard"
              className={[
                "hidden text-[0.72rem] transition sm:inline",
                ide
                  ? "text-ide-muted hover:text-ide-ink"
                  : "text-studio-muted hover:text-[#1a1a1a]",
              ].join(" ")}
            >
              ← Resumes
            </Link>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {showMeter ? (
            <div data-tour="ai-quota">
              <TokenMeter compact variant={ide ? "ide" : "default"} />
            </div>
          ) : null}
          <div
            className={[
              "flex items-center gap-1.5",
              dense ? "min-h-7 py-0" : "min-h-9 gap-2 py-0.5 pl-0.5 pr-1",
              ide
                ? "rounded border border-ide-border bg-ide-raised pl-0.5 pr-0.5"
                : "rounded-full border border-slate-200/80 bg-white shadow-sm pl-0.5 pr-1",
            ].join(" ")}
          >
            <span
              className={[
                "grid shrink-0 place-items-center font-semibold",
                dense ? "h-6 w-6 text-[0.65rem]" : "h-7 w-7 text-[0.7rem]",
                ide
                  ? "rounded bg-ide-hover text-ide-ink"
                  : "rounded-full bg-[#1a1a1a] text-white",
              ].join(" ")}
              aria-hidden="true"
            >
              {email ? initialFromEmail(email) : "?"}
            </span>
            {!dense && email ? (
              <span className="hidden max-w-[9rem] truncate text-xs text-[#1a1a1a] lg:inline">
                {email}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSignOut}
              disabled={pending}
              className={[
                "shrink-0 font-medium transition disabled:opacity-60",
                dense ? "min-h-6 px-2 text-[0.65rem]" : "min-h-8 px-2.5 text-xs",
                ide
                  ? "rounded text-ide-muted hover:bg-ide-hover hover:text-ide-ink"
                  : "rounded-full text-studio-muted hover:bg-studio-canvas hover:text-[#1a1a1a]",
              ].join(" ")}
            >
              {pending ? "…" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

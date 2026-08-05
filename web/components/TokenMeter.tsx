"use client";

import { useTokenUsage } from "@/lib/token-usage";

type TokenMeterProps = {
  /** Dense single-line meter for narrow headers. */
  compact?: boolean;
};

export function TokenMeter({ compact = false }: TokenMeterProps) {
  const { used, limit, loading, warning } = useTokenUsage();
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const pct = Math.round(ratio * 100);
  const nearLimit = ratio >= 0.75;

  if (compact) {
    return (
      <div
        className="min-w-0 max-w-[11rem] rounded-md border border-studio-border bg-white px-2.5 py-1.5"
        aria-live="polite"
        title={
          warning
            ? `Quota meter soft-failed: ${warning}`
            : "Daily Groq token usage (UTC day)"
        }
        data-quota-warning={warning ? "true" : "false"}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-wide text-studio-muted">
            AI{warning ? " · off" : ""}
          </span>
          <span className="truncate font-mono text-[0.65rem] text-studio-ink">
            {loading ? "…" : `${used.toLocaleString()}/${limit.toLocaleString()}`}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-studio-canvas">
          {loading || pct > 0 ? (
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                loading
                  ? "w-1/5 animate-pulse bg-studio-border"
                  : nearLimit || warning
                    ? "bg-studio-vermilion"
                    : "bg-studio-ink"
              }`}
              style={loading ? undefined : { width: `${pct}%` }}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full min-w-0 max-w-sm rounded-md border border-studio-border bg-white p-2.5 sm:min-w-[240px] sm:p-3"
      aria-live="polite"
      title={
        warning
          ? `Quota meter soft-failed: ${warning}`
          : "Daily Groq token usage (UTC day)"
      }
      data-quota-warning={warning ? "true" : "false"}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 sm:gap-3">
        <span className="shrink-0 font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          AI quota{warning ? " · offline" : ""}
        </span>
        <span className="min-w-0 truncate text-right font-mono text-[0.7rem] text-studio-ink sm:text-[0.72rem]">
          {loading ? (
            <span className="inline-block h-3 w-24 animate-pulse rounded bg-studio-canvas sm:w-36" />
          ) : (
            <>
              <span className="sm:hidden">
                {used.toLocaleString()} / {limit.toLocaleString()}
              </span>
              <span className="hidden sm:inline">
                {used.toLocaleString()} / {limit.toLocaleString()} Tokens Used Today
              </span>
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-studio-canvas">
        {loading || pct > 0 ? (
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              loading
                ? "w-1/5 animate-pulse bg-studio-border"
                : nearLimit || warning
                  ? "bg-studio-vermilion"
                  : "bg-studio-ink"
            }`}
            style={loading ? undefined : { width: `${pct}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

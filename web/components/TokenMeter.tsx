"use client";

import { useTokenUsage } from "@/lib/token-usage";

export function TokenMeter() {
  const { used, limit, loading, warning } = useTokenUsage();
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const pct = Math.round(ratio * 100);
  const nearLimit = ratio >= 0.75;

  return (
    <div
      className="min-w-[240px] max-w-sm rounded-md border border-studio-border bg-white p-3"
      aria-live="polite"
      title={
        warning
          ? `Quota meter soft-failed: ${warning}`
          : "Daily Groq token usage (UTC day)"
      }
      data-quota-warning={warning ? "true" : "false"}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          AI quota{warning ? " · offline" : ""}
        </span>
        <span className="font-mono text-[0.72rem] text-studio-ink">
          {loading ? (
            <span className="inline-block h-3 w-36 animate-pulse rounded bg-studio-canvas" />
          ) : (
            <>
              {used.toLocaleString()} / {limit.toLocaleString()} Tokens Used Today
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-studio-canvas">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            nearLimit || warning ? "bg-studio-vermilion" : "bg-studio-ink"
          }`}
          style={{ width: `${loading ? 8 : pct}%` }}
        />
      </div>
    </div>
  );
}

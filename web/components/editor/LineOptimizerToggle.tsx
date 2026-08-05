"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "resumate_line_overflow_heatmap";

type LineOptimizerToggleProps = {
  enabled: boolean;
  orphanCount?: number;
  onChange: (enabled: boolean) => void;
  /** Avoid flashing the wrong ON/OFF before localStorage hydrates. */
  ready?: boolean;
  /** Shorter label for narrow preview toolbars. */
  compact?: boolean;
  variant?: "default" | "ide";
};

export function LineOptimizerToggle({
  enabled,
  orphanCount = 0,
  onChange,
  ready = true,
  compact = false,
  variant = "default",
}: LineOptimizerToggleProps) {
  const ide = variant === "ide";

  return (
    <div
      className="inline-flex items-center gap-1.5 select-none"
      data-testid="line-optimizer-toggle"
    >
      <span
        id="line-optimizer-label"
        className={[
          "font-mono text-[0.6rem] uppercase tracking-wide",
          ide ? "text-ide-muted" : "text-studio-muted",
        ].join(" ")}
      >
        {compact ? (
          <>
            <span className="sm:hidden">Lines</span>
            <span className="hidden sm:inline">Line fit</span>
          </>
        ) : (
          "Line fit"
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={ready ? enabled : false}
        aria-labelledby="line-optimizer-label"
        disabled={!ready}
        onClick={() => onChange(!enabled)}
        className={[
          "relative h-5 w-8 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50",
          ide ? "focus-visible:ring-ide-accent" : "focus-visible:ring-amber-500",
          ready && enabled
            ? ide
              ? "bg-ide-accent"
              : "bg-amber-500"
            : ide
              ? "bg-ide-border"
              : "bg-slate-200",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            ready && enabled ? "translate-x-3.5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
      <span
        className={`font-mono text-[0.62rem] ${
          ready && enabled
            ? ide
              ? "text-ide-accent"
              : "text-amber-700"
            : ide
              ? "text-ide-faint"
              : "text-studio-muted"
        }`}
        aria-live="polite"
      >
        {!ready ? "…" : enabled ? "On" : "Off"}
        {ready && enabled && orphanCount > 0 ? ` · ${orphanCount}` : ""}
      </span>
    </div>
  );
}

/** Persist heatmap preference in localStorage. */
export function useLineOptimizerPreference(
  defaultEnabled = false,
): [boolean, (value: boolean) => void, boolean] {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setEnabled(true);
      if (raw === "0") setEnabled(false);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [enabled, hydrated]);

  return [enabled, setEnabled, hydrated];
}

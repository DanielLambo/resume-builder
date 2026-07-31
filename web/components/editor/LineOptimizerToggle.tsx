"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "resumate_line_overflow_heatmap";

type LineOptimizerToggleProps = {
  enabled: boolean;
  orphanCount?: number;
  onChange: (enabled: boolean) => void;
  /** Avoid flashing the wrong ON/OFF before localStorage hydrates. */
  ready?: boolean;
};

export function LineOptimizerToggle({
  enabled,
  orphanCount = 0,
  onChange,
  ready = true,
}: LineOptimizerToggleProps) {
  return (
    <div
      className="inline-flex items-center gap-2 select-none"
      data-testid="line-optimizer-toggle"
    >
      <span
        id="line-optimizer-label"
        className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted"
      >
        Line overflow heatmap
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={ready ? enabled : false}
        aria-labelledby="line-optimizer-label"
        disabled={!ready}
        onClick={() => onChange(!enabled)}
        className={[
          "relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-vermilion disabled:opacity-50",
          ready && enabled ? "bg-amber-500" : "bg-studio-border",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            ready && enabled ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
      <span className="font-mono text-[0.65rem] text-studio-muted" aria-live="polite">
        {!ready ? "…" : enabled ? "ON" : "OFF"}
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

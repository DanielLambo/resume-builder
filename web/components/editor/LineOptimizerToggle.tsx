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
};

export function LineOptimizerToggle({
  enabled,
  orphanCount = 0,
  onChange,
  ready = true,
  compact = false,
}: LineOptimizerToggleProps) {
  const label = compact ? "Lines" : "Line fit";

  return (
    <div
      className="inline-flex items-center gap-2 select-none"
      data-testid="line-optimizer-toggle"
    >
      <span
        id="line-optimizer-label"
        className="text-xs text-studio-muted"
      >
        {label}
      </span>
      <div
        className="inline-flex border border-studio-border bg-studio-paper p-0.5"
        role="group"
        aria-labelledby="line-optimizer-label"
      >
        <button
          type="button"
          role="switch"
          aria-checked={ready ? enabled : false}
          disabled={!ready}
          onClick={() => onChange(!enabled)}
          className={[
            "min-h-7 px-2.5 text-[0.7rem] font-medium transition disabled:opacity-50",
            ready && enabled
              ? "bg-studio-ink text-white"
              : "text-studio-muted hover:text-studio-ink",
          ].join(" ")}
        >
          {!ready ? "…" : enabled ? "On" : "Off"}
          {ready && enabled && orphanCount > 0 ? ` · ${orphanCount}` : ""}
        </button>
      </div>
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

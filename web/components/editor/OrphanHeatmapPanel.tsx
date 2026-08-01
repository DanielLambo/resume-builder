"use client";

import { useMemo } from "react";

import {
  DEFAULT_LINE_WIDTH,
  analyzeOrphans,
  type OrphanBullet,
} from "@/lib/analyzer/orphanDetector";

type OrphanHeatmapPanelProps = {
  latex: string;
  enabled: boolean;
  shorteningIndex: number | null;
  onShorten: (bullet: OrphanBullet) => void;
};

export function OrphanHeatmapPanel({
  latex,
  enabled,
  shorteningIndex,
  onShorten,
}: OrphanHeatmapPanelProps) {
  const analysis = useMemo(() => {
    if (!enabled) {
      return {
        bullets: [] as OrphanBullet[],
        orphanCount: 0,
        lineWidth: DEFAULT_LINE_WIDTH,
      };
    }
    return analyzeOrphans(latex);
  }, [enabled, latex]);

  if (!enabled) return null;

  const orphans = analysis.bullets.filter((b) => b.orphanRisk);

  return (
    <aside
      className="w-full max-w-[8.5in] space-y-3"
      data-testid="orphan-heatmap-panel"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Line overflow
        </p>
        <p className="text-xs text-studio-muted">
          {orphans.length === 0 ? "Clear" : `${orphans.length} to trim`}
        </p>
      </div>

      {orphans.length === 0 ? (
        <p className="text-sm text-studio-muted">
          No short overflow lines at ~{analysis.lineWidth} chars.
        </p>
      ) : (
        <ul className="space-y-3">
          {orphans.map((bullet) => {
            const busy = shorteningIndex === bullet.index;
            return (
              <li
                key={`${bullet.kind}-${bullet.index}-${bullet.start}`}
                className="border-l-2 border-studio-ink/20 pl-3"
                data-testid="orphan-bullet"
              >
                <p className="line-clamp-3 text-sm leading-relaxed text-studio-ink">
                  {bullet.text}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-studio-muted">
                    ~{bullet.trailingWords} word
                    {bullet.trailingWords === 1 ? "" : "s"} over
                  </span>
                  <button
                    type="button"
                    disabled={busy || shorteningIndex !== null}
                    onClick={() => onShorten(bullet)}
                    className="min-h-9 border border-studio-border bg-studio-paper px-3 py-1.5 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30 disabled:opacity-45"
                    data-testid="orphan-shorten"
                  >
                    {busy ? "Shortening…" : "Shorten"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

"use client";

import { Loader2, Sparkles } from "lucide-react";
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
        <p className="text-xs font-medium text-studio-ink">Line overflow</p>
        <p className="text-[0.7rem] text-studio-muted">
          {orphans.length === 0 ? "Clear" : `${orphans.length} to trim`}
        </p>
      </div>

      {orphans.length === 0 ? (
        <p className="text-xs text-studio-muted">
          No short overflow lines at ~{analysis.lineWidth} chars.
        </p>
      ) : (
        <ul className="space-y-3">
          {orphans.map((bullet) => {
            const busy = shorteningIndex === bullet.index;
            return (
              <li
                key={`${bullet.kind}-${bullet.index}-${bullet.start}`}
                className="border-l-2 border-amber-500 pl-3"
                data-testid="orphan-bullet"
              >
                <p className="line-clamp-3 text-[0.8rem] leading-relaxed text-studio-ink">
                  {bullet.text}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.7rem] text-studio-muted">
                    ~{bullet.trailingWords} word
                    {bullet.trailingWords === 1 ? "" : "s"} over
                  </span>
                  <button
                    type="button"
                    disabled={busy || shorteningIndex !== null}
                    onClick={() => onShorten(bullet)}
                    className="inline-flex items-center gap-1.5 border border-studio-border bg-studio-paper px-2.5 py-1 text-[0.7rem] font-medium text-studio-ink transition hover:border-studio-ink/30 disabled:opacity-60"
                    data-testid="orphan-shorten"
                  >
                    {busy ? (
                      <Loader2
                        className="h-3 w-3 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                    )}
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

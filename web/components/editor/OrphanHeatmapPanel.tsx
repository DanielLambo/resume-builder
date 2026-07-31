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
      className="w-full max-w-[8.5in] space-y-2"
      data-testid="orphan-heatmap-panel"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Orphan risk bullets
        </p>
        <p className="font-mono text-[0.65rem] text-studio-muted">
          {orphans.length === 0
            ? "None flagged"
            : `${orphans.length} need a trim`}
        </p>
      </div>

      {orphans.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          No 1–3 word overflow orphans detected at ~{analysis.lineWidth}{" "}
          chars/line.
        </div>
      ) : (
        <ul className="space-y-2">
          {orphans.map((bullet) => {
            const busy = shorteningIndex === bullet.index;
            return (
              <li
                key={`${bullet.kind}-${bullet.index}-${bullet.start}`}
                className="rounded-lg border border-amber-500/40 border-l-2 border-l-amber-500 bg-amber-500/10 px-3 py-2.5"
                data-testid="orphan-bullet"
              >
                <p className="line-clamp-3 font-mono text-[0.7rem] leading-relaxed text-studio-ink">
                  {bullet.text}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[0.65rem] text-amber-800/80">
                    ~{bullet.trailingWords} word
                    {bullet.trailingWords === 1 ? "" : "s"} /{" "}
                    {bullet.trailingChars} chars on last line ·{" "}
                    {bullet.estimatedLines} lines
                  </span>
                  <button
                    type="button"
                    disabled={busy || shorteningIndex !== null}
                    onClick={() => onShorten(bullet)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/40 bg-white px-2.5 py-1 text-[0.7rem] font-medium text-amber-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-50 disabled:opacity-60"
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
                    {busy ? "Shortening…" : "Shorten by ~3 words"}
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

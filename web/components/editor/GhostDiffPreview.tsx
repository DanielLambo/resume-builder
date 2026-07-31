"use client";

import { useMemo } from "react";

type GhostDiffPreviewProps = {
  latex: string;
  previousLatex: string | null;
  ghostActive: boolean;
};

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

export function GhostDiffPreview({
  latex,
  previousLatex,
  ghostActive,
}: GhostDiffPreviewProps) {
  const lines = useMemo(() => {
    const next = splitLines(latex);
    const prev = previousLatex ? splitLines(previousLatex) : [];
    return next.map((line, i) => {
      const changed = ghostActive && prev[i] !== line;
      return { line, changed };
    });
  }, [ghostActive, latex, previousLatex]);

  return (
    <article
      className="w-full max-w-[8.5in] aspect-[1/1.29] overflow-hidden border border-studio-border bg-studio-paper shadow-paper-sheet"
      aria-label="Resume paper preview"
      data-testid="pdf-preview-canvas"
      data-page-count="1"
    >
      <pre className="h-full overflow-auto p-8 font-mono text-[0.68rem] leading-relaxed text-studio-ink sm:p-10 sm:text-[0.72rem]">
        {lines.map((row, i) => (
          <span
            key={i}
            className={`block whitespace-pre-wrap transition-colors duration-700 ${
              row.changed ? "bg-emerald-50" : "bg-transparent"
            }`}
          >
            {row.line || " "}
          </span>
        ))}
      </pre>
    </article>
  );
}

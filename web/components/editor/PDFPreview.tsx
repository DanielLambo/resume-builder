"use client";

import { useEffect, useMemo, useState } from "react";

type PDFPreviewProps = {
  pdfBase64: string | null;
  pageCount: number | null;
  ghostActive?: boolean;
  /** Fallback LaTeX shown only while waiting for first PDF (never as the final preview). */
  pendingLatex?: string;
  compiling?: boolean;
};

/**
 * Floating paper sheet — real PDF via blob URL iframe.
 * Ghost overlay flashes emerald during vibe-edit updates.
 * Orphan heatmap is a sibling panel (OrphanHeatmapPanel) so toggle never
 * recreates this blob URL.
 */
export function PDFPreview({
  pdfBase64,
  pageCount,
  ghostActive = false,
  pendingLatex,
  compiling = false,
}: PDFPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfBase64) {
      setObjectUrl(null);
      return;
    }

    try {
      const binary = atob(pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
      );
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setObjectUrl(null);
    }
  }, [pdfBase64]);

  const ready = Boolean(objectUrl && pdfBase64);
  const measuredPages = pageCount ?? (ready ? 1 : null);

  const statusLabel = useMemo(() => {
    if (compiling) return "Compiling…";
    if (!ready) return "Waiting for PDF…";
    return null;
  }, [compiling, ready]);

  return (
    <article
      className="relative w-full max-w-[8.5in] aspect-[1/1.29] overflow-hidden border border-studio-border bg-studio-paper shadow-paper-sheet"
      aria-label="Resume paper preview"
      data-testid="pdf-preview-canvas"
      data-page-count={measuredPages != null ? String(measuredPages) : undefined}
      data-pdf-ready={ready ? "true" : "false"}
    >
      {ready && objectUrl ? (
        <iframe
          title="Compiled resume PDF"
          src={`${objectUrl}#toolbar=0&navpanes=0&scrollbar=0`}
          className="h-full w-full border-0 bg-white"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-studio-muted">
            {statusLabel ?? "No PDF yet"}
          </p>
          <p className="max-w-sm text-sm text-studio-muted">
            Run Compile or a vibe edit to typeset the floating paper sheet.
          </p>
          {pendingLatex ? (
            <p className="mt-4 max-h-24 overflow-hidden font-mono text-[0.65rem] text-studio-muted/50">
              {pendingLatex.slice(0, 180)}…
            </p>
          ) : null}
        </div>
      )}

      {ghostActive ? (
        <div
          className="pointer-events-none absolute inset-0 bg-emerald-50/50 transition-opacity duration-700"
          data-testid="ghost-diff-overlay"
          aria-hidden="true"
        />
      ) : null}
    </article>
  );
}

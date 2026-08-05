"use client";

import { useEffect, useMemo, useState } from "react";

type PDFPreviewProps = {
  pdfBase64: string | null;
  pageCount: number | null;
  ghostActive?: boolean;
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
      className="relative h-full min-h-0 w-full max-w-[min(100%,8.5in)] overflow-hidden border border-studio-border bg-white shadow-paper-sheet"
      aria-label="Resume paper preview"
      data-testid="pdf-preview-canvas"
      data-page-count={measuredPages != null ? String(measuredPages) : undefined}
      data-pdf-ready={ready ? "true" : "false"}
    >
      {ready && objectUrl ? (
        <iframe
          title="Compiled resume PDF"
          src={`${objectUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-width`}
          className="absolute inset-0 h-full w-full border-0 bg-white"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center sm:p-8">
          <p className="font-mono text-xs uppercase tracking-wide text-studio-muted">
            {statusLabel ?? "No PDF yet"}
          </p>
          <p className="max-w-sm text-sm text-studio-muted">
            Hit Recompile to typeset a PDF preview. Source stays on the left.
          </p>
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

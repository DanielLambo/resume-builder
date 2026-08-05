"use client";

import { useEffect, useMemo, useState } from "react";

type PDFPreviewProps = {
  pdfBase64: string | null;
  pageCount: number | null;
  ghostActive?: boolean;
  compiling?: boolean;
  zoom?: number | "fit";
};

/**
 * Floating paper sheet — real PDF via blob URL iframe.
 * Ghost overlay flashes emerald during vibe-edit updates.
 */
export function PDFPreview({
  pdfBase64,
  pageCount,
  ghostActive = false,
  compiling = false,
  zoom = "fit",
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
  const hash =
    zoom === "fit"
      ? "#toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-width"
      : `#toolbar=0&navpanes=0&scrollbar=0&zoom=${zoom}`;

  const statusLabel = useMemo(() => {
    if (compiling) return "Updating preview…";
    if (!ready) return "Preparing your sheet…";
    return null;
  }, [compiling, ready]);

  return (
    <article
      className="relative h-full min-h-0 w-full max-w-[min(100%,8.5in)] overflow-hidden rounded-sm border border-slate-200/60 bg-white shadow-2xl"
      aria-label="Resume paper preview"
      data-testid="pdf-preview-canvas"
      data-page-count={measuredPages != null ? String(measuredPages) : undefined}
      data-pdf-ready={ready ? "true" : "false"}
    >
      {ready && objectUrl ? (
        <iframe
          title="Compiled resume PDF"
          src={`${objectUrl}${hash}`}
          className="absolute inset-0 h-full w-full border-0 bg-white"
        />
      ) : (
        <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="h-40 w-[70%] max-w-sm animate-pulse rounded-sm bg-slate-100" />
          <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
          <p className="mt-2 text-sm text-studio-muted">{statusLabel}</p>
        </div>
      )}

      {compiling || ghostActive ? (
        <div
          className="pointer-events-none absolute inset-0 bg-amber-50/40"
          data-testid="ghost-diff-overlay"
          aria-hidden="true"
        >
          <div className="absolute inset-x-8 top-8 space-y-3">
            <div className="h-3 w-1/3 animate-pulse rounded bg-white/80" />
            <div className="h-3 w-full animate-pulse rounded bg-white/70" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-white/70" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/60" />
          </div>
        </div>
      ) : null}
    </article>
  );
}

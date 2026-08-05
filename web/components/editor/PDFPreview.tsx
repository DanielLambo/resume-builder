"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PDFPreviewProps = {
  pdfBase64: string | null;
  pageCount: number | null;
  ghostActive?: boolean;
  compiling?: boolean;
  zoom?: number | "fit";
};

const PAGE_WIDTH_PX = 816;
const PAGE_HEIGHT_PX = 1056;

/**
 * Floating paper sheet — real PDF via blob URL iframe.
 * Zoom is CSS scale (Chrome ignores #zoom= on blob PDFs).
 */
export function PDFPreview({
  pdfBase64,
  pageCount,
  ghostActive = false,
  compiling = false,
  zoom = "fit",
}: PDFPreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(PAGE_WIDTH_PX);

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

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setContainerWidth(width);
    });
    observer.observe(node);
    setContainerWidth(node.clientWidth || PAGE_WIDTH_PX);
    return () => observer.disconnect();
  }, []);

  const ready = Boolean(objectUrl && pdfBase64);
  const measuredPages = pageCount ?? (ready ? 1 : null);
  const pages = Math.max(1, measuredPages ?? 1);
  const fitScale = Math.max(0.35, (containerWidth - 8) / PAGE_WIDTH_PX);
  const scale = zoom === "fit" ? Math.min(fitScale, 1) : zoom / 100;
  const paperWidth = PAGE_WIDTH_PX;
  const paperHeight = PAGE_HEIGHT_PX * pages;

  const statusLabel = useMemo(() => {
    if (compiling) return "Updating preview…";
    if (!ready) return "Preparing your sheet…";
    return null;
  }, [compiling, ready]);

  return (
    <article
      ref={scrollerRef}
      className="relative h-full min-h-0 w-full overflow-auto rounded-sm border border-ide-border/80 bg-ide-gutter"
      aria-label="Resume paper preview"
      data-testid="pdf-preview-canvas"
      data-page-count={measuredPages != null ? String(measuredPages) : undefined}
      data-pdf-ready={ready ? "true" : "false"}
      data-zoom={zoom === "fit" ? "fit" : String(zoom)}
    >
      {ready && objectUrl ? (
        <div
          className="mx-auto my-3"
          style={{
            width: paperWidth * scale,
            height: paperHeight * scale,
          }}
        >
          <iframe
            title="Compiled resume PDF"
            src={`${objectUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="block border border-black/80 bg-white shadow-2xl"
            style={{
              width: paperWidth,
              height: paperHeight,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      ) : (
        <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="h-40 w-[70%] max-w-sm animate-pulse rounded-sm border border-black/10 bg-white shadow-lg" />
          <div className="h-3 w-40 animate-pulse rounded bg-ide-raised" />
          <div className="h-3 w-56 animate-pulse rounded bg-ide-raised" />
          <p className="mt-2 text-sm text-ide-muted">{statusLabel}</p>
        </div>
      )}

      {compiling || ghostActive ? (
        <div
          className="pointer-events-none absolute inset-0 bg-ide-bg/30"
          data-testid="ghost-diff-overlay"
          aria-hidden="true"
        >
          <div className="absolute inset-x-8 top-8 space-y-3">
            <div className="h-3 w-1/3 animate-pulse rounded bg-white/20" />
            <div className="h-3 w-full animate-pulse rounded bg-white/15" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-white/15" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      ) : null}
    </article>
  );
}

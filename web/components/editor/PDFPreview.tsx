"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { toast } from "sonner";

import {
  buildPdfSearchPhrase,
  nearestPdfTextItem,
  type PdfTextItem,
} from "@/lib/pdf-locate-in-source";

type PDFPreviewProps = {
  pdfBase64: string | null;
  pageCount: number | null;
  ghostActive?: boolean;
  compiling?: boolean;
  zoom?: number | "fit";
  /** Double-click a spot on the PDF → jump to matching LaTeX. */
  onLocateInSource?: (pdfText: string) => void;
};

const PAGE_WIDTH_PX = 816;

type RenderedPage = {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
  textItems: PdfTextItem[];
  phraseItems: Array<{ str: string; x: number; y: number }>;
};

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  return pdfjs;
}

/**
 * Floating paper sheet — PDF.js canvases so double-click can map to source.
 * Zoom is CSS scale on the page stack.
 */
export function PDFPreview({
  pdfBase64,
  pageCount,
  ghostActive = false,
  compiling = false,
  zoom = "fit",
  onLocateInSource,
}: PDFPreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(PAGE_WIDTH_PX);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderToken = useRef(0);

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

  useEffect(() => {
    if (!pdfBase64) {
      setPages([]);
      setRenderError(null);
      return;
    }

    const token = ++renderToken.current;
    let cancelled = false;

    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const binary = atob(pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled || token !== renderToken.current) {
          await doc.destroy();
          return;
        }

        const scale = 1.5;
        const nextPages: RenderedPage[] = [];

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const page = await doc.getPage(pageNumber);
          if (cancelled || token !== renderToken.current) {
            await doc.destroy();
            return;
          }

          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport }).promise;

          const unscaled = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const textItems: PdfTextItem[] = [];
          const phraseItems: Array<{ str: string; x: number; y: number }> = [];

          for (const raw of content.items) {
            if (!("str" in raw) || typeof raw.str !== "string") continue;
            const str = raw.str;
            if (!str.trim()) continue;
            const transform = raw.transform;
            const x = transform[4] ?? 0;
            const yPdf = transform[5] ?? 0;
            const yFromTop = unscaled.height - yPdf;
            textItems.push({ str, x, yFromTop });
            phraseItems.push({ str, x, y: yFromTop });
          }

          nextPages.push({
            pageNumber,
            width: unscaled.width,
            height: unscaled.height,
            dataUrl: canvas.toDataURL("image/png"),
            textItems,
            phraseItems,
          });
        }

        await doc.destroy();
        if (cancelled || token !== renderToken.current) return;
        setPages(nextPages);
        setRenderError(null);
      } catch (err) {
        if (cancelled || token !== renderToken.current) return;
        setPages([]);
        setRenderError(
          err instanceof Error ? err.message : "Couldn’t render PDF preview",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfBase64]);

  const ready = pages.length > 0;
  const measuredPages = pageCount ?? (ready ? pages.length : null);
  const fitScale = Math.max(0.35, (containerWidth - 8) / PAGE_WIDTH_PX);
  const scale = zoom === "fit" ? Math.min(fitScale, 1) : zoom / 100;

  const statusLabel = useMemo(() => {
    if (compiling) return "Updating preview…";
    if (renderError) return renderError;
    if (!pdfBase64) return "Preparing your sheet…";
    if (!ready) return "Rendering preview…";
    return null;
  }, [compiling, pdfBase64, ready, renderError]);

  const handleDoubleClick = useCallback(
    (page: RenderedPage, event: MouseEvent<HTMLImageElement>) => {
      if (!onLocateInSource) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const pdfX = ((event.clientX - rect.left) / rect.width) * page.width;
      const pdfY = ((event.clientY - rect.top) / rect.height) * page.height;
      const idx = nearestPdfTextItem(page.textItems, pdfX, pdfY);
      if (idx == null) {
        toast.message("Couldn’t map that spot", {
          description: "Try double-clicking a heading or bullet.",
        });
        return;
      }
      const phrase = buildPdfSearchPhrase(page.phraseItems, idx);
      if (!phrase.trim()) {
        toast.message("Couldn’t map that spot", {
          description: "Try double-clicking a heading or bullet.",
        });
        return;
      }
      onLocateInSource(phrase);
    },
    [onLocateInSource],
  );

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
      {ready ? (
        <div className="mx-auto my-3 flex flex-col items-center gap-3">
          {pages.map((page) => {
            const displayW = page.width * scale;
            const displayH = page.height * scale;
            return (
              // eslint-disable-next-line @next/next/no-img-element -- PDF page bitmap from pdf.js
              <img
                key={page.pageNumber}
                src={page.dataUrl}
                alt={`Resume PDF page ${page.pageNumber}`}
                title={
                  onLocateInSource
                    ? "Double-click to jump to this text in the LaTeX source"
                    : "Compiled resume PDF"
                }
                data-page={page.pageNumber}
                draggable={false}
                className={`block border border-black/80 bg-white shadow-2xl ${
                  onLocateInSource ? "cursor-text" : ""
                }`}
                style={{
                  width: displayW,
                  height: displayH,
                }}
                onDoubleClick={(event) => {
                  handleDoubleClick(page, event);
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="h-40 w-[70%] max-w-sm animate-pulse rounded-sm border border-black/10 bg-white shadow-lg" />
          <div className="h-3 w-40 animate-pulse rounded bg-ide-raised" />
          <div className="h-3 w-56 animate-pulse rounded bg-ide-raised" />
          <p className="mt-2 text-sm text-ide-muted">{statusLabel}</p>
        </div>
      )}

      {compiling ? (
        <div
          className="pointer-events-none absolute inset-0 bg-ide-bg/25"
          data-testid="ghost-diff-overlay"
          aria-hidden="true"
        >
          {!ready ? (
            <div className="absolute inset-x-8 top-8 space-y-3">
              <div className="h-3 w-1/3 animate-pulse rounded bg-white/20" />
              <div className="h-3 w-full animate-pulse rounded bg-white/15" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-white/15" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
            </div>
          ) : (
            <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
              <div className="h-full w-1/3 animate-pulse bg-ide-accent/80" />
            </div>
          )}
        </div>
      ) : ghostActive ? (
        <div
          className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-ide-accent/25"
          data-testid="ghost-diff-overlay"
          aria-hidden="true"
        />
      ) : null}
    </article>
  );
}

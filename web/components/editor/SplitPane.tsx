"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type SplitPaneProps = {
  primary: ReactNode;
  secondary: ReactNode;
  /** Which pane is visible below the lg breakpoint. */
  mobileShow?: "primary" | "secondary";
  storageKey?: string;
  defaultPercent?: number;
  minPercent?: number;
  maxPercent?: number;
  resizeLabel?: string;
  className?: string;
};

/**
 * Horizontal source | preview split. Width % persisted.
 */
export function SplitPane({
  primary,
  secondary,
  mobileShow = "primary",
  storageKey = "resumate_editor_split_pct",
  defaultPercent = 48,
  minPercent = 18,
  maxPercent = 82,
  resizeLabel = "Resize source and preview",
  className = "",
}: SplitPaneProps) {
  const [percent, setPercent] = useState(defaultPercent);
  const dragging = useRef(false);
  const percentRef = useRef(percent);
  const containerRef = useRef<HTMLDivElement>(null);
  percentRef.current = percent;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? Number(raw) : Number.NaN;
      if (
        Number.isFinite(parsed) &&
        parsed >= minPercent &&
        parsed <= maxPercent
      ) {
        setPercent(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, minPercent, maxPercent]);

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        String(Math.round(percentRef.current)),
      );
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width < 1) return;
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      setPercent(Math.min(maxPercent, Math.max(minPercent, next)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persist();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [persist, minPercent, maxPercent]);

  function startDrag(event: ReactPointerEvent) {
    event.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col lg:flex-row ${className}`}
      style={{ ["--split-pct" as string]: `${percent}%` }}
      data-testid="split-horizontal"
    >
      <div
        className={[
          "min-h-0 min-w-0 flex-col overflow-hidden",
          mobileShow === "primary" ? "flex flex-1" : "hidden",
          "lg:flex lg:flex-none lg:basis-[var(--split-pct)] lg:grow-0 lg:shrink-0",
        ].join(" ")}
      >
        {primary}
      </div>
      <button
        type="button"
        aria-label={resizeLabel}
        title="Drag to resize"
        onPointerDown={startDrag}
        className="group relative z-10 hidden w-1.5 shrink-0 cursor-col-resize items-stretch justify-center bg-ide-gutter transition hover:bg-ide-accent/50 focus-visible:bg-ide-accent focus-visible:outline-none lg:flex"
        data-testid="split-resize-horizontal"
      >
        <span className="m-auto h-8 w-0.5 rounded-full bg-ide-border transition group-hover:bg-ide-accent/80" />
      </button>
      <div
        className={[
          "min-h-0 min-w-0 flex-col overflow-hidden",
          mobileShow === "secondary" ? "flex flex-1" : "hidden",
          "lg:flex lg:min-w-0 lg:flex-1",
        ].join(" ")}
      >
        {secondary}
      </div>
    </div>
  );
}

type BottomDockProps = {
  children: ReactNode;
  /** Default dock height in px — keep small so source/preview dominate. */
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  storageKey?: string;
};

/**
 * Bottom AI strip sized in **pixels**, not leftover %.
 * Editor above is always flex-1 and scrollable.
 */
export function BottomDock({
  children,
  defaultHeight = 132,
  minHeight = 72,
  maxHeight = 320,
  storageKey = "resumate_editor_dock_px",
}: BottomDockProps) {
  const [height, setHeight] = useState(defaultHeight);
  const dragging = useRef(false);
  const heightRef = useRef(height);
  const startY = useRef(0);
  const startH = useRef(0);
  heightRef.current = height;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? Number(raw) : Number.NaN;
      if (Number.isFinite(parsed) && parsed >= minHeight && parsed <= maxHeight) {
        setHeight(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, minHeight, maxHeight]);

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, String(Math.round(heightRef.current)));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - event.clientY;
      const next = Math.min(
        maxHeight,
        Math.max(minHeight, startH.current + delta),
      );
      setHeight(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persist();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [persist, minHeight, maxHeight]);

  function startDrag(event: ReactPointerEvent) {
    event.preventDefault();
    dragging.current = true;
    startY.current = event.clientY;
    startH.current = heightRef.current;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div
      className="flex min-h-0 w-full shrink-0 flex-col"
      style={{ height }}
      data-testid="bottom-dock"
    >
      <button
        type="button"
        aria-label="Resize AI panel"
        title="Drag to resize AI panel"
        onPointerDown={startDrag}
        className="group relative z-10 flex h-1.5 w-full shrink-0 cursor-row-resize items-center justify-center bg-ide-gutter transition hover:bg-ide-accent/50 focus-visible:bg-ide-accent focus-visible:outline-none"
        data-testid="split-resize-vertical"
      >
        <span className="h-0.5 w-8 rounded-full bg-ide-border transition group-hover:bg-ide-accent/80" />
      </button>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

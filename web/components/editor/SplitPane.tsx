"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type SplitPaneProps = {
  left: ReactNode;
  right: ReactNode;
  /** Which pane is visible below the lg breakpoint. */
  mobileShow: "left" | "right";
  storageKey?: string;
  defaultPercent?: number;
};

const MIN = 30;
const MAX = 70;

export function SplitPane({
  left,
  right,
  mobileShow,
  storageKey = "resumate_editor_split_pct",
  defaultPercent = 48,
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
      if (Number.isFinite(parsed) && parsed >= MIN && parsed <= MAX) {
        setPercent(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, String(Math.round(percentRef.current)));
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
      setPercent(Math.min(MAX, Math.max(MIN, next)));
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
  }, [persist]);

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row"
      style={{ ["--editor-split" as string]: `${percent}%` }}
    >
      <div
        className={[
          "min-h-0 min-w-0 flex-col overflow-hidden",
          mobileShow === "left" ? "flex flex-1" : "hidden",
          "lg:flex lg:w-[var(--editor-split)] lg:flex-none",
        ].join(" ")}
      >
        {left}
      </div>
      <button
        type="button"
        aria-label="Resize source and preview"
        title="Drag to resize"
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        className="hidden w-1.5 shrink-0 cursor-col-resize bg-studio-border transition hover:bg-studio-vermilion focus-visible:bg-studio-vermilion focus-visible:outline-none lg:block"
      />
      <div
        className={[
          "min-h-0 min-w-0 flex-col overflow-hidden",
          mobileShow === "right" ? "flex flex-1" : "hidden",
          "lg:flex lg:flex-1",
        ].join(" ")}
      >
        {right}
      </div>
    </div>
  );
}

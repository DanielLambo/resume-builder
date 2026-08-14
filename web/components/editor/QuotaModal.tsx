"use client";

import { useEffect } from "react";

import { SheetChrome } from "@/components/ui/SheetChrome";

type QuotaModalProps = {
  open: boolean;
  title: string;
  body: string;
  latex: string;
  filename?: string;
  onClose: () => void;
};

export function QuotaModal({
  open,
  title,
  body,
  latex,
  filename = "resume.tex",
  onClose,
}: QuotaModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function exportTex() {
    const blob = new Blob([latex], { type: "application/x-tex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SheetChrome
      open={open}
      titleId="quota-modal-title"
      onClose={onClose}
      size="sm"
      testId="quota-modal"
    >
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-studio-muted">
        Quota
      </p>
      <h2 id="quota-modal-title" className="type-title mt-1 text-lg font-semibold text-studio-ink">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-studio-muted">{body}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onClose}
          className="pressable min-h-11 rounded-lg border border-studio-border px-3 py-2.5 text-sm text-studio-ink hover:bg-studio-canvas sm:min-h-0"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={exportTex}
          className="pressable min-h-11 rounded-lg bg-studio-vermilion px-3 py-2.5 text-sm font-semibold text-white hover:bg-studio-vermilion-hover sm:min-h-0"
          data-testid="export-tex"
        >
          Export Current .TEX Source
        </button>
      </div>
    </SheetChrome>
  );
}

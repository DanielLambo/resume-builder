"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { PDFPreview } from "@/components/editor/PDFPreview";
import { StatusLog } from "@/components/editor/StatusLog";
import { TokenMeter } from "@/components/TokenMeter";
import { mockVibeEdit } from "@/lib/mock-ai";
import { DEFAULT_RESUME_LATEX } from "@/lib/resume-template";
import { useTokenUsage } from "@/lib/token-usage";

const CLIENT_STEPS = [
  "[1/4] Parsing prompt and extracting Zod schema...",
  "[2/4] Checking Upstash Redis daily token limit...",
  "[3/4] Compiling LaTeX via 1-Page Lock engine...",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MobilePane = "edit" | "preview";

export function HarnessClient() {
  const { applyUsage, used } = useTokenUsage();
  const [latex, setLatex] = useState(DEFAULT_RESUME_LATEX);
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [ghostActive, setGhostActive] = useState(false);
  const [onePageLock, setOnePageLock] = useState(true);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("edit");

  function run() {
    const text = prompt.trim();
    if (!text || pending) return;
    const prior = latex;
    const startUsed = used;
    setStatusLines([]);
    startTransition(async () => {
      for (const step of CLIENT_STEPS) {
        setStatusLines((prev) => [...prev, step]);
        await sleep(120);
      }
      const started = performance.now();
      const result = mockVibeEdit({
        prompt: text,
        dataJson: { latex: prior, template: "blank", version: 1 },
      });
      const next =
        typeof result.output.data_json.latex === "string"
          ? result.output.data_json.latex
          : prior;

      try {
        const res = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latex: next, autoFit: true }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          pdfBase64?: string;
          pageCount?: number;
          lockedToOnePage?: boolean;
          error?: string;
          elapsedMs?: number;
        };
        if (!res.ok || !data.success || !data.pdfBase64) {
          throw new Error(data.error || "Compile failed");
        }
        const elapsed = Math.round(data.elapsedMs ?? performance.now() - started);
        setLatex(next);
        setPdfBase64(data.pdfBase64);
        setPageCount(data.pageCount ?? 1);
        setGhostActive(true);
        setOnePageLock(Boolean(data.lockedToOnePage ?? data.pageCount === 1));
        setMobilePane("preview");
        applyUsage(startUsed + result.totalTokens);
        setStatusLines((prev) => [
          ...prev,
          `[4/4] PDF rendered successfully (${data.pageCount ?? 1} page) in ${elapsed}ms.`,
        ]);
        setPrompt("");
        window.setTimeout(() => setGhostActive(false), 3000);
        toast.success("Vibe edit applied (mock + real PDF)");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Compile failed";
        setLatex(next);
        setStatusLines((prev) => [...prev, `[4/4] Compile failed: ${message}`]);
        toast.error(message);
      }
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-studio-bg"
      data-testid="vibe-harness"
      data-token-used={used}
    >
      {pending ? (
        <div className="h-0.5 animate-pulse bg-studio-vermilion" data-testid="vermilion-loader" />
      ) : null}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-studio-border px-3 py-2.5 sm:px-4 sm:py-3">
        <p className="min-w-0 truncate font-mono text-[0.65rem] text-studio-muted sm:text-xs">
          RESUMATE / MOCK HARNESS
        </p>
        <div className="shrink-0">
          <span className="md:hidden">
            <TokenMeter compact />
          </span>
          <span className="hidden md:block">
            <TokenMeter />
          </span>
        </div>
      </header>

      <div
        className="flex shrink-0 border-b border-studio-border lg:hidden"
        role="tablist"
        aria-label="Harness panes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "edit"}
          onClick={() => setMobilePane("edit")}
          className={`flex-1 px-3 py-3 text-center text-sm font-semibold ${
            mobilePane === "edit"
              ? "border-b-2 border-studio-vermilion text-studio-ink"
              : "text-studio-muted"
          }`}
        >
          Edit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "preview"}
          onClick={() => setMobilePane("preview")}
          className={`flex-1 px-3 py-3 text-center text-sm font-semibold ${
            mobilePane === "preview"
              ? "border-b-2 border-studio-vermilion text-studio-ink"
              : "text-studio-muted"
          }`}
        >
          Preview
        </button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section
          className={[
            "flex min-h-0 flex-col border-studio-border p-3 sm:p-4 lg:border-r",
            mobilePane === "edit" ? "flex" : "hidden",
            "lg:flex",
          ].join(" ")}
        >
          <textarea
            data-testid="vibe-prompt"
            className="mb-3 w-full border border-studio-border bg-white p-3 font-mono text-sm disabled:opacity-60"
            rows={4}
            disabled={pending}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Add AWS and Docker to my technical skills"
          />
          <StatusLog lines={statusLines} active={pending} />
          <button
            type="button"
            data-testid="vibe-submit"
            disabled={pending}
            onClick={run}
            className="mt-3 min-h-11 w-full bg-studio-vermilion px-3 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:min-h-0 sm:py-2"
          >
            Run vibe edit
          </button>
          <p
            className="mt-3 font-mono text-[0.65rem] text-studio-muted"
            data-testid="harness-latex-skills"
          >
            {/AWS/i.test(latex) ? "skills:AWS" : "skills:pending"}
            {/Docker/i.test(latex) ? " Docker" : ""}
          </p>
        </section>
        <section
          className={[
            "min-h-0 overflow-auto bg-studio-canvas p-3 sm:p-6",
            mobilePane === "preview" ? "block" : "hidden",
            "lg:block",
          ].join(" ")}
        >
          <div className="mb-3 flex justify-end">
            <span
              data-testid="one-page-lock"
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[0.65rem] text-emerald-700 sm:text-xs"
            >
              <span className="sm:hidden">
                {onePageLock ? "[ 1-PG LOCK ]" : "[ FIT PENDING ]"}
              </span>
              <span className="hidden sm:inline">
                {onePageLock ? "[ 100% 1-PAGE LOCK ACTIVE ]" : "[ FIT PENDING ]"}
              </span>
            </span>
          </div>
          <PDFPreview
            pdfBase64={pdfBase64}
            pageCount={pageCount}
            ghostActive={ghostActive}
            pendingLatex={latex}
            compiling={pending}
          />
        </section>
      </div>
    </div>
  );
}

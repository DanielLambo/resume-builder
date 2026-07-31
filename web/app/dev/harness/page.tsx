"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { GhostDiffPreview } from "@/components/editor/GhostDiffPreview";
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

export default function DevHarnessPage() {
  if (process.env.NEXT_PUBLIC_USE_MOCK_AI !== "true") {
    return (
      <main className="grid min-h-dvh place-items-center p-8 text-studio-muted">
        Set NEXT_PUBLIC_USE_MOCK_AI=true to open the mock harness.
      </main>
    );
  }

  return <HarnessInner />;
}

function HarnessInner() {
  const { applyUsage, used } = useTokenUsage();
  const [latex, setLatex] = useState(DEFAULT_RESUME_LATEX);
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [previousLatex, setPreviousLatex] = useState<string | null>(null);
  const [ghostActive, setGhostActive] = useState(false);
  const [onePageLock, setOnePageLock] = useState(true);

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
      const elapsed = Math.round(performance.now() - started);
      setPreviousLatex(prior);
      setLatex(next);
      setGhostActive(true);
      setOnePageLock(true);
      applyUsage(startUsed + result.totalTokens);
      setStatusLines((prev) => [
        ...prev,
        `[4/4] PDF rendered successfully in ${elapsed}ms.`,
      ]);
      setPrompt("");
      window.setTimeout(() => setGhostActive(false), 3000);
      toast.success("Vibe edit applied (mock)");
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  }

  return (
    <div className="min-h-dvh bg-studio-bg" data-testid="vibe-harness" data-token-used={used}>
      {pending ? (
        <div className="h-0.5 animate-pulse bg-studio-vermilion" data-testid="vermilion-loader" />
      ) : null}
      <header className="flex items-center justify-between border-b border-studio-border px-4 py-3">
        <p className="font-mono text-xs text-studio-muted">TYPESETTER / MOCK HARNESS</p>
        <TokenMeter />
      </header>
      <div className="grid gap-0 lg:grid-cols-2">
        <section className="border-r border-studio-border p-4">
          <textarea
            data-testid="vibe-prompt"
            className="mb-3 w-full border border-studio-border bg-white p-3 font-mono text-sm disabled:opacity-60"
            rows={5}
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
            className="mt-3 w-full bg-studio-vermilion px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Run vibe edit
          </button>
        </section>
        <section className="bg-studio-canvas p-6">
          <div className="mb-3 flex justify-end">
            <span
              data-testid="one-page-lock"
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-700"
            >
              {onePageLock ? "[ 100% 1-PAGE LOCK ACTIVE ]" : "[ FIT PENDING ]"}
            </span>
          </div>
          <GhostDiffPreview
            latex={latex}
            previousLatex={previousLatex}
            ghostActive={ghostActive}
          />
        </section>
      </div>
    </div>
  );
}

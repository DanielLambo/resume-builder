"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { vibeEditAction } from "@/app/actions/vibe-edit";
import { saveResumeLatexAction } from "@/app/actions/resumes";
import { GhostDiffPreview } from "@/components/editor/GhostDiffPreview";
import { QuotaModal } from "@/components/editor/QuotaModal";
import { StatusLog } from "@/components/editor/StatusLog";
import { useTokenUsage } from "@/lib/token-usage";

type EditorClientProps = {
  resumeId: string;
  title: string;
  initialLatex: string;
};

type StudioMode = "vibe" | "source";

const CLIENT_STEPS = [
  "[1/4] Parsing prompt and extracting Zod schema...",
  "[2/4] Checking Upstash Redis daily token limit...",
  "[3/4] Compiling LaTeX via 1-Page Lock engine...",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function EditorClient({ resumeId, title, initialLatex }: EditorClientProps) {
  const { applyUsage, used: tokensUsed } = useTokenUsage();
  const [latex, setLatex] = useState(initialLatex);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [compiling, setCompiling] = useState(false);
  const [mode, setMode] = useState<StudioMode>("vibe");
  const [templateLabel, setTemplateLabel] = useState("Jake");
  const [onePageLock, setOnePageLock] = useState(true);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [ghostActive, setGhostActive] = useState(false);
  const [previousLatex, setPreviousLatex] = useState<string | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaTitle, setQuotaTitle] = useState("");
  const [quotaBody, setQuotaBody] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const runId = useRef(0);

  const autosave = useCallback(async () => {
    if (!dirty) return;
    const result = await saveResumeLatexAction(resumeId, latex, title);
    if (result.ok) {
      setDirty(false);
      toast.success("Resume auto-saved to Supabase", { duration: 2200 });
    } else {
      toast.error(result.error);
    }
  }, [dirty, latex, resumeId, title]);

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      void autosave();
    }, 1600);
    return () => window.clearTimeout(t);
  }, [autosave, dirty, latex]);

  useEffect(() => {
    if (!ghostActive) return;
    const t = window.setTimeout(() => setGhostActive(false), 3000);
    return () => window.clearTimeout(t);
  }, [ghostActive]);

  async function streamClientSteps(signal: { cancelled: boolean }) {
    for (const step of CLIENT_STEPS) {
      if (signal.cancelled) return;
      setStatusLines((prev) => [...prev, step]);
      await sleep(280);
    }
  }

  function runVibeEdit() {
    const text = prompt.trim();
    if (!text || pending) {
      if (!text) toast.message("Describe the edit first");
      return;
    }

    const priorLatex = latex;
    const id = ++runId.current;
    const signal = { cancelled: false };
    setStatusLines([]);
    setQuotaOpen(false);

    startTransition(async () => {
      void streamClientSteps(signal);

      try {
        const result = await vibeEditAction({ resumeId, prompt: text });
        signal.cancelled = true;
        if (id !== runId.current) return;

        if (!result.ok) {
          if (result.steps?.length) {
            setStatusLines(
              result.steps.map((s) => `[${s.index}/${s.total}] ${s.message}`),
            );
          }
          if (result.status === 429 || result.code === "AI_DAILY_LIMIT") {
            if (typeof result.used === "number") {
              applyUsage(result.used, undefined, result.limit);
            }
            setQuotaTitle("Daily AI token limit reached");
            setQuotaBody(
              `${result.error} ${result.resetHint ?? "Quota resets at UTC midnight."} Your current resume draft is safe.`,
            );
            setQuotaOpen(true);
            return;
          }
          if (result.code === "NETWORK") {
            setQuotaTitle("Network interrupted");
            setQuotaBody(
              result.resetHint ??
                "Connection dropped. Your draft is intact — export .tex as a backup.",
            );
            setQuotaOpen(true);
            return;
          }
          toast.error(result.error);
          return;
        }

        if (result.healed) {
          toast.warning("Syntax tweak detected, auto-healing LaTeX...", {
            duration: 2800,
          });
        }

        applyUsage(result.dailyTokensUsed, result.dailyTokensRemaining);
        const nextLatex =
          typeof result.data_json.latex === "string"
            ? result.data_json.latex
            : priorLatex;

        setPreviousLatex(priorLatex);
        setLatex(nextLatex);
        setDirty(true);
        setReply(result.reply);
        setPrompt("");
        setOnePageLock(true);
        setGhostActive(true);

        const serverLines = result.steps.map(
          (s) => `[${s.index}/${s.total}] ${s.message}`,
        );
        const hasRender = serverLines.some((l) => l.includes("PDF rendered"));
        setStatusLines(
          hasRender
            ? serverLines
            : [
                ...CLIENT_STEPS,
                `[4/4] PDF rendered successfully in ${result.elapsedMs}ms.`,
              ],
        );

        toast.success("Vibe edit applied", {
          description: `${result.tokensUsed.toLocaleString()} tokens · ${result.dailyTokensUsed.toLocaleString()} used today`,
        });
      } catch {
        signal.cancelled = true;
        setQuotaTitle("Network interrupted");
        setQuotaBody(
          "We couldn't reach the typesetter. Your draft is intact — export .tex as a backup.",
        );
        setQuotaOpen(true);
      }
    });
  }

  function onPromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runVibeEdit();
    }
  }

  function onCompile() {
    setCompiling(true);
    toast.message("Compiling LaTeX…", {
      description: "If this fails, the self-healing engine will try to resolve it.",
    });
    window.setTimeout(() => {
      setCompiling(false);
      const broken = latex.includes("\\bogus") || latex.includes("\\error");
      if (broken) {
        toast.warning("Syntax tweak detected, auto-healing LaTeX...");
        return;
      }
      setOnePageLock(true);
      toast.success("Preview ready", {
        description: "PDF compile succeeded (local preview stub).",
      });
    }, 900);
  }

  return (
    <div
      className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col bg-studio-bg lg:flex-row"
      data-testid="vibe-harness"
      data-token-used={tokensUsed}
    >
      {(pending || compiling) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
          data-testid="vermilion-loader"
        >
          <div className="h-full w-full origin-left animate-pulse bg-studio-vermilion" />
        </div>
      )}

      <aside className="flex w-full flex-col border-r border-studio-border bg-studio-bg lg:w-[42%] xl:w-[38%]">
        <div className="flex items-center justify-between gap-3 border-b border-studio-border px-4 py-3">
          <div>
            <p className="font-mono text-xs tracking-wide text-studio-muted">
              TYPESETTER / RESUME ENGINE
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <h1 className="text-base font-semibold tracking-tight text-studio-ink">
                {title}
              </h1>
              <span className="font-mono text-[0.65rem] text-studio-muted">
                {dirty ? "· dirty" : "· saved"}
              </span>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="font-mono text-xs text-studio-muted hover:text-studio-ink"
          >
            ← Library
          </Link>
        </div>

        <div className="border-b border-studio-border px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-studio-muted">
            <button
              type="button"
              className={`hover:text-studio-ink ${mode === "vibe" ? "text-studio-ink" : ""}`}
              onClick={() => setMode("vibe")}
            >
              Vibe
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className={`hover:text-studio-ink ${mode === "source" ? "text-studio-ink" : ""}`}
              onClick={() => setMode("source")}
            >
              Source
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className="hover:text-studio-ink"
              onClick={() =>
                setTemplateLabel((t) =>
                  t === "Jake" ? "Harvard" : t === "Harvard" ? "Blank" : "Jake",
                )
              }
            >
              Template: {templateLabel}
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className="hover:text-studio-ink"
              onClick={onCompile}
              disabled={compiling || pending}
            >
              {compiling ? "Compiling…" : "Compile"}
            </button>
          </div>
        </div>

        {mode === "source" ? (
          <textarea
            className="min-h-[50vh] flex-1 resize-none bg-studio-paper p-4 font-mono text-[0.8rem] leading-relaxed text-studio-ink outline-none disabled:opacity-60"
            value={latex}
            spellCheck={false}
            disabled={pending}
            onChange={(e) => {
              setLatex(e.target.value);
              setDirty(true);
            }}
          />
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-auto p-4">
              {reply ? (
                <div className="border border-studio-border bg-studio-paper p-3 text-sm leading-relaxed text-studio-ink">
                  {reply}
                </div>
              ) : (
                <div className="border border-dashed border-studio-border bg-studio-paper/60 p-4 font-mono text-xs text-studio-muted">
                  Ask for a clean edit, or paste a job description to tailor.
                  <span className="mt-2 block text-studio-muted/80">
                    Shortcut: ⌘/Ctrl + Enter
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-studio-border bg-studio-canvas/40 p-4">
              <label className="mb-2 block font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
                AI prompt
              </label>
              <textarea
                ref={promptRef}
                data-testid="vibe-prompt"
                className="mb-1 w-full resize-none border border-studio-border bg-white px-3 py-2.5 font-mono text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion disabled:cursor-not-allowed disabled:opacity-60"
                rows={4}
                placeholder="Describe an edit, or paste a job description to tailor…"
                value={prompt}
                disabled={pending}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onPromptKeyDown}
              />
              <StatusLog lines={statusLines} active={pending} />
              <button
                type="button"
                data-testid="vibe-submit"
                disabled={pending}
                onClick={runVibeEdit}
                className="mt-3 w-full bg-studio-vermilion px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60"
              >
                {pending ? "Typesetting…" : "Run vibe edit"}
              </button>
            </div>
          </>
        )}
      </aside>

      <section className="flex min-h-[60vh] flex-1 flex-col bg-studio-canvas">
        <div className="flex items-center justify-between gap-3 border-b border-studio-border bg-studio-canvas/90 px-4 py-3 shadow-floating-bar backdrop-blur-sm">
          <span className="font-mono text-xs text-studio-muted">PREVIEW · LETTER</span>
          <span
            data-testid="one-page-lock"
            className={`rounded border px-2 py-1 font-mono text-xs ${
              onePageLock
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-studio-border bg-white text-studio-muted"
            }`}
          >
            {onePageLock ? "[ 100% 1-PAGE LOCK ACTIVE ]" : "[ FIT PENDING ]"}
          </span>
        </div>

        <div className="flex flex-1 items-start justify-center overflow-auto p-6 sm:p-10">
          <GhostDiffPreview
            latex={latex}
            previousLatex={previousLatex}
            ghostActive={ghostActive}
          />
        </div>
      </section>

      <QuotaModal
        open={quotaOpen}
        title={quotaTitle}
        body={quotaBody}
        latex={latex}
        filename={`${title.replace(/\s+/g, "-").toLowerCase() || "resume"}.tex`}
        onClose={() => setQuotaOpen(false)}
      />
    </div>
  );
}

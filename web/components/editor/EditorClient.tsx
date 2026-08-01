"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { vibeEditAction } from "@/app/actions/vibe-edit";
import { shortenBulletAction } from "@/app/actions/shorten-bullet";
import { saveResumeLatexAction } from "@/app/actions/resumes";
import { LineOptimizerToggle, useLineOptimizerPreference } from "@/components/editor/LineOptimizerToggle";
import { OrphanHeatmapPanel } from "@/components/editor/OrphanHeatmapPanel";
import { PDFPreview } from "@/components/editor/PDFPreview";
import { QuotaModal } from "@/components/editor/QuotaModal";
import { ResumeReviewPanel } from "@/components/editor/ResumeReviewPanel";
import { StatusLog } from "@/components/editor/StatusLog";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import { analyzeOrphans, type OrphanBullet } from "@/lib/analyzer/orphanDetector";
import { isResumeReviewPrompt, type ResumeReview } from "@/lib/resume-review";
import {
  getTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-template";
import { useTokenUsage } from "@/lib/token-usage";

type EditorClientProps = {
  resumeId: string;
  title: string;
  initialLatex: string;
  initialTemplateId?: ResumeTemplateId;
  initialPdfBase64?: string | null;
  initialPageCount?: number | null;
  /** When set, this sheet was tailored for a specific job application. */
  jobLabel?: string | null;
};

type StudioMode = "vibe" | "source";
type MobilePane = "edit" | "preview";

const CLIENT_STEPS = [
  "[1/4] Parsing prompt and extracting Zod schema...",
  "[2/4] Checking Upstash Redis daily token limit...",
  "[3/4] Compiling LaTeX via 1-Page Lock engine...",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function EditorClient({
  resumeId,
  title,
  initialLatex,
  initialTemplateId = "new-grad",
  initialPdfBase64 = null,
  initialPageCount = null,
  jobLabel = null,
}: EditorClientProps) {
  const { applyUsage, used: tokensUsed } = useTokenUsage();
  const [latex, setLatex] = useState(initialLatex);
  const [templateId, setTemplateId] = useState<ResumeTemplateId>(initialTemplateId);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [review, setReview] = useState<ResumeReview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [compiling, setCompiling] = useState(false);
  const [mode, setMode] = useState<StudioMode>("vibe");
  const [mobilePane, setMobilePane] = useState<MobilePane>("edit");
  const [onePageLock, setOnePageLock] = useState(
    initialPageCount != null && initialPageCount === 1,
  );
  const [pageCount, setPageCount] = useState<number | null>(initialPageCount);
  const [pdfBase64, setPdfBase64] = useState<string | null>(initialPdfBase64);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [ghostActive, setGhostActive] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaTitle, setQuotaTitle] = useState("");
  const [quotaBody, setQuotaBody] = useState("");
  const [heatmapOn, setHeatmapOn, heatmapReady] = useLineOptimizerPreference(false);
  const [shorteningIndex, setShorteningIndex] = useState<number | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const runId = useRef(0);
  const compileGen = useRef(0);
  const latexRef = useRef(latex);
  const templateIdRef = useRef(templateId);
  const savingRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const didInitialCompile = useRef(false);
  latexRef.current = latex;
  templateIdRef.current = templateId;

  const orphanCount = useMemo(
    () => (heatmapOn ? analyzeOrphans(latex).orphanCount : 0),
    [heatmapOn, latex],
  );

  const flushSave = useCallback(async () => {
    if (savingRef.current) {
      pendingResaveRef.current = true;
      return;
    }
    savingRef.current = true;
    try {
      let passes = 0;
      do {
        pendingResaveRef.current = false;
        passes += 1;
        const snapshot = latexRef.current;
        const snapshotTemplate = templateIdRef.current;
        const result = await saveResumeLatexAction(
          resumeId,
          snapshot,
          title,
          snapshotTemplate,
        );
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const drifted =
          latexRef.current !== snapshot ||
          templateIdRef.current !== snapshotTemplate ||
          pendingResaveRef.current;
        if (drifted && passes < 5) {
          continue;
        }
        if (!drifted) setDirty(false);
        toast.success("Resume saved to your account", { duration: 2200 });
        return;
      } while (passes < 5);
    } finally {
      savingRef.current = false;
    }
  }, [resumeId, title]);

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      void flushSave();
    }, 1600);
    return () => window.clearTimeout(t);
  }, [dirty, flushSave, latex, templateId]);

  useEffect(() => {
    if (!ghostActive) return;
    const t = window.setTimeout(() => setGhostActive(false), 3000);
    return () => window.clearTimeout(t);
  }, [ghostActive]);

  const compilePdf = useCallback(
    async (source: string, { quiet = false } = {}) => {
      const gen = ++compileGen.current;
      setCompiling(true);
      if (!quiet) {
        toast.message("Compiling LaTeX…", {
          description: "1-Page Lock is measuring page count with pdf-lib.",
        });
      }
      try {
        const res = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latex: source,
            autoFit: true,
            resumeId,
          }),
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
        if (gen !== compileGen.current) return data; // stale response
        setPdfBase64(data.pdfBase64);
        setPageCount(data.pageCount ?? null);
        setOnePageLock(Boolean(data.lockedToOnePage ?? data.pageCount === 1));
        setMobilePane("preview");
        if (!quiet) {
          toast.success("Preview ready", {
            description: `${data.pageCount ?? "?"} page · ${data.elapsedMs ?? 0}ms`,
          });
        }
        return data;
      } catch (err) {
        if (gen === compileGen.current) {
          const message = err instanceof Error ? err.message : "Compile failed";
          if (!quiet) toast.error(message);
        }
        throw err;
      } finally {
        if (gen === compileGen.current) {
          setCompiling(false);
        }
      }
    },
    [resumeId],
  );

  useEffect(() => {
    if (didInitialCompile.current || pdfBase64) return;
    didInitialCompile.current = true;
    void compilePdf(initialLatex, { quiet: true }).catch(() => {
      /* soft-fail on first paint; user can hit Compile */
    });
  }, [compilePdf, initialLatex, pdfBase64]);

  async function streamClientSteps(signal: { cancelled: boolean }) {
    for (const step of CLIENT_STEPS) {
      if (signal.cancelled) return;
      setStatusLines((prev) => [...prev, step]);
      await sleep(280);
    }
  }

  const promptIsReview = isResumeReviewPrompt(prompt);

  function runVibeEdit() {
    const text = prompt.trim();
    if (!text || pending) {
      if (!text) toast.message("Describe an edit or ask for a review");
      return;
    }

    const priorLatex = latex;
    const id = ++runId.current;
    const signal = { cancelled: false };
    const reviewing = isResumeReviewPrompt(text);
    setStatusLines([]);
    setQuotaOpen(false);

    startTransition(async () => {
      if (!reviewing) {
        void streamClientSteps(signal);
      }

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

        applyUsage(result.dailyTokensUsed, result.dailyTokensRemaining);
        setPrompt("");

        if (result.mode === "review" && result.review) {
          setReview(result.review);
          setReply(result.reply);
          setStatusLines(
            result.steps.map((s) => `[${s.index}/${s.total}] ${s.message}`),
          );
          toast.success("Resume review ready", {
            description: `${result.review.fitScore}/10 fit · resume unchanged`,
          });
          return;
        }

        if (result.healed) {
          toast.warning("Syntax tweak detected, auto-healing LaTeX...", {
            duration: 2800,
          });
        }

        const nextLatex =
          typeof result.data_json.latex === "string"
            ? result.data_json.latex
            : priorLatex;

        setLatex(nextLatex);
        setDirty(true);
        setReview(null);
        setReply(result.reply);
        setGhostActive(true);

        if (result.pdfBase64) {
          setPdfBase64(result.pdfBase64);
          setPageCount(result.pageCount);
          setOnePageLock(result.lockedToOnePage);
          setMobilePane("preview");
        } else if (result.compileWarning) {
          // Edit saved; try a client recompile so the preview can still recover.
          void compilePdf(nextLatex, { quiet: true }).catch(() => undefined);
        } else {
          setMobilePane("preview");
        }

        const serverLines = result.steps.map(
          (s) => `[${s.index}/${s.total}] ${s.message}`,
        );
        const hasRender = serverLines.some((l) => l.includes("PDF rendered"));
        const hasCompileSkip = serverLines.some((l) =>
          l.includes("PDF compile skipped"),
        );
        setStatusLines(
          hasRender || hasCompileSkip
            ? serverLines
            : [
                ...CLIENT_STEPS,
                `[4/4] PDF rendered successfully (${result.pageCount ?? "?"} page) in ${result.elapsedMs}ms.`,
              ],
        );

        if (result.compileWarning) {
          toast.success("Vibe edit saved", {
            description: `AI applied · preview unavailable: ${result.compileWarning}`,
          });
        } else {
          toast.success("Vibe edit applied", {
            description: `${result.tokensUsed.toLocaleString()} tokens · ${result.pageCount ?? "?"} page PDF`,
          });
        }
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
    void compilePdf(latex).catch(() => {
      /* toast already shown inside compilePdf */
    });
  }

  function applyTemplate(nextId: ResumeTemplateId) {
    if (nextId === templateId) {
      setTemplatePickerOpen(false);
      return;
    }
    const next = getTemplate(nextId);
    const ok = window.confirm(
      `Replace the current source with the “${next.name}” template? Unsaved wording in this draft will be overwritten.`,
    );
    if (!ok) return;
    setTemplateId(next.id);
    setLatex(next.latex);
    setDirty(true);
    setGhostActive(true);
    setTemplatePickerOpen(false);
    toast.success(`Switched to ${next.name}`, {
      description: "Recompiling preview…",
    });
    void compilePdf(next.latex, { quiet: true }).catch(() => undefined);
  }

  async function onShortenOrphan(bullet: OrphanBullet) {
    setShorteningIndex(bullet.index);
    try {
      const result = await shortenBulletAction({
        resumeId,
        latex,
        itemStart: bullet.start,
        itemEnd: bullet.end,
        itemText: bullet.text,
        kind: bullet.kind,
      });
      if (!result.ok) {
        if (result.code === "AI_DAILY_LIMIT") {
          setQuotaTitle("Daily AI token limit reached");
          setQuotaBody(result.error);
          setQuotaOpen(true);
          if (typeof result.used === "number") {
            applyUsage(result.used, undefined, result.limit);
          }
          return;
        }
        toast.error(result.error);
        return;
      }
      if (result.unchanged) {
        toast.message("Couldn't tighten further", {
          description: "Try a vibe edit, or trim a metric phrase manually.",
        });
        return;
      }
      setLatex(result.latex);
      setDirty(true);
      setGhostActive(true);
      applyUsage(result.dailyTokensUsed, result.dailyTokensRemaining);
      toast.success("Bullet tightened", {
        description: "Updating PDF preview…",
      });
      // Soft recompile keeps heatmap UX snappy; lock badge follows compile result.
      void compilePdf(result.latex, { quiet: true }).catch(() => undefined);
    } finally {
      setShorteningIndex(null);
    }
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-studio-bg lg:flex-row"
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

      {/* Mobile: one pane at a time so edit + preview don't crush each other */}
      <div
        className="flex shrink-0 border-b border-studio-border lg:hidden"
        role="tablist"
        aria-label="Editor panes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "edit"}
          data-testid="mobile-pane-edit"
          onClick={() => setMobilePane("edit")}
          className={`flex-1 px-3 py-3 text-center text-sm font-semibold transition ${
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
          data-testid="mobile-pane-preview"
          onClick={() => setMobilePane("preview")}
          className={`flex-1 px-3 py-3 text-center text-sm font-semibold transition ${
            mobilePane === "preview"
              ? "border-b-2 border-studio-vermilion text-studio-ink"
              : "text-studio-muted"
          }`}
        >
          Preview
          {pageCount != null ? (
            <span className="ml-1 font-mono text-[0.65rem] font-normal text-studio-muted">
              · {pageCount}p
            </span>
          ) : null}
        </button>
      </div>

      <aside
        className={[
          "min-h-0 w-full flex-col overflow-hidden border-studio-border bg-studio-bg lg:border-r",
          mobilePane === "edit" ? "flex flex-1" : "hidden",
          "lg:flex lg:w-[42%] lg:flex-none xl:w-[38%]",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3 border-b border-studio-border px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <p className="hidden font-mono text-xs tracking-wide text-studio-muted sm:block">
              TYPESETTER / RESUME ENGINE
            </p>
            <div className="flex min-w-0 items-baseline gap-2 sm:mt-1">
              <h1 className="truncate text-base font-semibold tracking-tight text-studio-ink">
                {title}
              </h1>
              <span className="shrink-0 font-mono text-[0.65rem] text-studio-muted">
                {dirty ? "· dirty" : "· saved"}
              </span>
            </div>
            {jobLabel ? (
              <p
                className="mt-1 truncate font-mono text-[0.65rem] text-studio-vermilion"
                data-testid="job-target-label"
                title={jobLabel}
              >
                Job target · {jobLabel}
              </p>
            ) : null}
          </div>
          <Link
            href="/dashboard"
            className="shrink-0 py-1 font-mono text-xs text-studio-muted hover:text-studio-ink"
          >
            ← Library
          </Link>
        </div>

        <div className="border-b border-studio-border px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-xs text-studio-muted">
            <button
              type="button"
              className={`min-h-9 px-1.5 hover:text-studio-ink ${mode === "vibe" ? "text-studio-ink" : ""}`}
              onClick={() => setMode("vibe")}
            >
              Vibe
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className={`min-h-9 px-1.5 hover:text-studio-ink ${mode === "source" ? "text-studio-ink" : ""}`}
              onClick={() => setMode("source")}
            >
              Source
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className="min-h-9 max-w-[11rem] truncate px-1.5 hover:text-studio-ink sm:max-w-none"
              onClick={() => setTemplatePickerOpen(true)}
              data-testid="template-switch"
              title={getTemplate(templateId).description}
            >
              <span className="sm:hidden">Tpl:</span>
              <span className="hidden sm:inline">Template:</span>{" "}
              {getTemplate(templateId).name}
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className="min-h-9 px-1.5 hover:text-studio-ink"
              onClick={onCompile}
              disabled={compiling || pending}
            >
              {compiling ? "Compiling…" : "Compile"}
            </button>
          </div>
        </div>

        {mode === "source" ? (
          <textarea
            className="min-h-0 flex-1 resize-none bg-studio-paper p-3 font-mono text-[0.8rem] leading-relaxed text-studio-ink outline-none disabled:opacity-60 sm:p-4"
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
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 sm:p-4">
              {review ? (
                <ResumeReviewPanel review={review} />
              ) : reply ? (
                <div className="border border-studio-border bg-studio-paper p-3 text-sm leading-relaxed text-studio-ink">
                  {reply}
                </div>
              ) : (
                <div className="border border-dashed border-studio-border bg-studio-paper/60 p-3 font-mono text-xs text-studio-muted sm:p-4">
                  Ask for a clean edit, a review for a role, or paste a JD to tailor.
                  <span className="mt-2 hidden text-studio-muted/80 sm:block">
                    Try “review my resume for backend SWE intern”. Shortcut: ⌘/Ctrl + Enter
                  </span>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-studio-border bg-studio-canvas/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
              <label className="mb-2 block font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
                AI prompt
              </label>
              <textarea
                ref={promptRef}
                data-testid="vibe-prompt"
                className="mb-1 w-full resize-none border border-studio-border bg-white px-3 py-2.5 font-mono text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion disabled:cursor-not-allowed disabled:opacity-60"
                rows={3}
                placeholder="Describe an edit, ask for a review, or paste a job description…"
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
                className="mt-3 min-h-11 w-full bg-studio-vermilion px-3 py-3 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60 sm:min-h-0 sm:py-2.5"
              >
                {pending
                  ? promptIsReview
                    ? "Reviewing…"
                    : "Typesetting…"
                  : promptIsReview
                    ? "Run resume review"
                    : "Run vibe edit"}
              </button>
            </div>
          </>
        )}
      </aside>

      <section
        className={[
          "min-h-0 flex-1 flex-col overflow-hidden bg-studio-canvas",
          mobilePane === "preview" ? "flex" : "hidden",
          "lg:flex",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-border bg-studio-canvas/90 px-3 py-2.5 shadow-floating-bar backdrop-blur-sm sm:gap-3 sm:px-4 sm:py-3">
          <span className="font-mono text-[0.65rem] text-studio-muted sm:text-xs">
            PREVIEW · LETTER
          </span>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-4">
            <LineOptimizerToggle
              enabled={heatmapOn}
              orphanCount={orphanCount}
              onChange={setHeatmapOn}
              ready={heatmapReady}
              compact
            />
            <span
              data-testid="one-page-lock"
              className={`rounded border px-2 py-1 font-mono text-[0.65rem] sm:text-xs ${
                onePageLock
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-studio-border bg-white text-studio-muted"
              }`}
            >
              <span className="sm:hidden">
                {onePageLock
                  ? `[ ${pageCount ?? 1}-PG LOCK ]`
                  : `[ ${pageCount ?? "?"} PG ]`}
              </span>
              <span className="hidden sm:inline">
                {onePageLock
                  ? `[ ${pageCount ?? 1}-PAGE LOCK ACTIVE ]`
                  : `[ ${pageCount ?? "?"} PAGES — FIT PENDING ]`}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-3 overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-4 sm:p-6 md:p-10">
          <PDFPreview
            pdfBase64={pdfBase64}
            pageCount={pageCount}
            ghostActive={ghostActive}
            pendingLatex={latex}
            compiling={compiling || pending}
          />
          <OrphanHeatmapPanel
            latex={latex}
            enabled={heatmapOn && heatmapReady}
            shorteningIndex={shorteningIndex}
            onShorten={(bullet) => {
              void onShortenOrphan(bullet);
            }}
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
      <TemplatePicker
        open={templatePickerOpen}
        title="Switch template"
        confirmLabel="Apply template"
        initialTemplateId={templateId}
        hideTitle
        onClose={() => setTemplatePickerOpen(false)}
        onConfirm={(id) => applyTemplate(id)}
      />
    </div>
  );
}

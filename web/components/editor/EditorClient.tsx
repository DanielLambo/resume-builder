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
  type SyntheticEvent,
} from "react";
import { toast } from "sonner";

import { selectionEditAction } from "@/app/actions/selection-edit";
import { vibeEditAction } from "@/app/actions/vibe-edit";
import { shortenBulletAction } from "@/app/actions/shorten-bullet";
import { saveResumeLatexAction } from "@/app/actions/resumes";
import { CompileErrorBanner } from "@/components/editor/CompileErrorBanner";
import { LineOptimizerToggle, useLineOptimizerPreference } from "@/components/editor/LineOptimizerToggle";
import { OrphanHeatmapPanel } from "@/components/editor/OrphanHeatmapPanel";
import { PDFPreview } from "@/components/editor/PDFPreview";
import { PromptRecipes } from "@/components/editor/PromptRecipes";
import { QuotaModal } from "@/components/editor/QuotaModal";
import { ResumeReviewPanel } from "@/components/editor/ResumeReviewPanel";
import { StatusLog } from "@/components/editor/StatusLog";
import { VersionStepper } from "@/components/editor/VersionStepper";
import { WritingProfileModal } from "@/components/editor/WritingProfileModal";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import {
  appendLocalSnapshot,
  type LocalAiSnapshot,
} from "@/lib/ai-history";
import { analyzeOrphans, type OrphanBullet } from "@/lib/analyzer/orphanDetector";
import { isResumeReviewPrompt, type ResumeReview } from "@/lib/resume-review";
import {
  getTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-template";
import { useTokenUsage } from "@/lib/token-usage";
import {
  EMPTY_WRITING_PROFILE,
  type WritingProfile,
} from "@/lib/writing-profile";

type EditorClientProps = {
  resumeId: string;
  title: string;
  initialLatex: string;
  initialTemplateId?: ResumeTemplateId;
  initialPdfBase64?: string | null;
  initialPageCount?: number | null;
  /** When set, this sheet was tailored for a specific job application. */
  jobLabel?: string | null;
  initialWritingProfile?: WritingProfile;
};

type StudioMode = "vibe" | "source";
type MobilePane = "edit" | "preview";

type SourceSelection = {
  start: number;
  end: number;
  text: string;
};

type VibeEditOverrides = {
  prompt?: string;
  compilerError?: string;
  clearPrompt?: boolean;
};

type VersionState = {
  stack: LocalAiSnapshot[];
  index: number;
};

const CLIENT_STEPS = [
  "[1/4] Reading your prompt…",
  "[2/4] Checking daily AI quota…",
  "[3/4] Typesetting your resume…",
] as const;

const btnPrimary =
  "min-h-9 bg-studio-vermilion px-3 py-2 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-45";
const btnSecondary =
  "min-h-9 border border-studio-border bg-studio-paper px-3 py-2 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30 disabled:opacity-45";
const btnGhost =
  "min-h-9 px-2.5 text-sm font-medium text-studio-muted transition hover:text-studio-ink disabled:opacity-45";

const COMPILE_FIX_PROMPT =
  "Fix this LaTeX compile error without inventing new experience. Keep facts honest.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readTextareaSelection(
  el: HTMLTextAreaElement,
): SourceSelection | null {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  if (end <= start) return null;
  return {
    start,
    end,
    text: el.value.slice(start, end),
  };
}

export function EditorClient({
  resumeId,
  title,
  initialLatex,
  initialTemplateId = "new-grad",
  initialPdfBase64 = null,
  initialPageCount = null,
  jobLabel = null,
  initialWritingProfile = EMPTY_WRITING_PROFILE,
}: EditorClientProps) {
  const { applyUsage, used: tokensUsed } = useTokenUsage();
  const [latex, setLatex] = useState(initialLatex);
  const [templateId, setTemplateId] = useState<ResumeTemplateId>(initialTemplateId);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [review, setReview] = useState<ResumeReview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  /** Own busy flag so Stop can unlock the UI before the server action settles. */
  const [aiBusy, setAiBusy] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const busy = aiBusy;
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
  const [writingProfile, setWritingProfile] =
    useState<WritingProfile>(initialWritingProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [selectionPrompt, setSelectionPrompt] = useState("");
  const [versions, setVersions] = useState<VersionState>(() => ({
    stack: [
      {
        latex: initialLatex,
        reply: null,
        prompt: "",
        at: Date.now(),
      },
    ],
    index: 0,
  }));
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const runId = useRef(0);
  const compileGen = useRef(0);
  const latexRef = useRef(latex);
  const replyRef = useRef(reply);
  const dirtyRef = useRef(dirty);
  const templateIdRef = useRef(templateId);
  const cancelSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const savingRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const didInitialCompile = useRef(false);
  latexRef.current = latex;
  replyRef.current = reply;
  dirtyRef.current = dirty;
  templateIdRef.current = templateId;

  const orphanCount = useMemo(
    () => (heatmapOn ? analyzeOrphans(latex).orphanCount : 0),
    [heatmapOn, latex],
  );

  const flushSave = useCallback(
    async ({ quiet = true }: { quiet?: boolean } = {}) => {
      if (savingRef.current) {
        pendingResaveRef.current = true;
        return;
      }
      savingRef.current = true;
      setSaving(true);
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
          if (!quiet) {
            toast.success("Resume saved", { duration: 1800 });
          }
          return;
        } while (passes < 5);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [resumeId, title],
  );

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      void flushSave({ quiet: true });
    }, 1600);
    return () => window.clearTimeout(t);
  }, [dirty, flushSave, latex, templateId]);

  // Flush pending edits when leaving the editor so Library navigation can't drop them.
  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return;
      void saveResumeLatexAction(
        resumeId,
        latexRef.current,
        title,
        templateIdRef.current,
      );
    };
  }, [resumeId, title]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!ghostActive) return;
    const t = window.setTimeout(() => setGhostActive(false), 3000);
    return () => window.clearTimeout(t);
  }, [ghostActive]);

  const pushMutatingSnapshot = useCallback(
    (args: {
      priorLatex: string;
      priorReply: string | null;
      nextLatex: string;
      nextReply: string | null;
      prompt: string;
    }) => {
      setVersions((prev) => {
        const stack = prev.stack.slice();
        const current = stack[prev.index];
        stack[prev.index] = {
          latex: args.priorLatex,
          reply: args.priorReply,
          prompt: current?.prompt ?? "",
          at: current?.at ?? Date.now(),
        };
        return appendLocalSnapshot(stack, prev.index, {
          latex: args.nextLatex,
          reply: args.nextReply,
          prompt: args.prompt,
          at: Date.now(),
        });
      });
    },
    [],
  );

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
          hint?: string;
          elapsedMs?: number;
        };
        if (!res.ok || !data.success || !data.pdfBase64) {
          const message =
            data.hint?.trim() || data.error?.trim() || "Compile failed";
          if (gen === compileGen.current) {
            setCompileError(message);
          }
          throw new Error(message);
        }
        if (gen !== compileGen.current) return data; // stale response
        setCompileError(null);
        setPdfBase64(data.pdfBase64);
        setPageCount(data.pageCount ?? null);
        setOnePageLock(Boolean(data.lockedToOnePage ?? data.pageCount === 1));
        // Only yank mobile users to Preview on an explicit Compile.
        if (!quiet) {
          setMobilePane("preview");
          toast.success("Preview ready", {
            description: `${data.pageCount ?? "?"} page · ${data.elapsedMs ?? 0}ms`,
          });
        }
        return data;
      } catch (err) {
        if (gen === compileGen.current) {
          const message = err instanceof Error ? err.message : "Compile failed";
          setCompileError(message);
          // Banner is the canonical compile error surface — avoid duplicate toasts.
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

  function stopVibeEdit() {
    runId.current += 1;
    cancelSignalRef.current.cancelled = true;
    setAiBusy(false);
    setStatusLines(["Stopped"]);
  }

  function restoreVersion(nextIndex: number) {
    const snap = versions.stack[nextIndex];
    if (!snap || busy || compiling) return;
    // Commit in-progress manual edits into the current slot before leaving it.
    setVersions((prev) => {
      const stack = prev.stack.slice();
      const current = stack[prev.index];
      if (current && latexRef.current !== current.latex) {
        stack[prev.index] = {
          ...current,
          latex: latexRef.current,
          reply: replyRef.current,
        };
      }
      return { stack, index: nextIndex };
    });
    setLatex(snap.latex);
    setReply(snap.reply);
    setSelection(null);
    setReview(null);
    setDirty(true);
    setGhostActive(true);
    void compilePdf(snap.latex, { quiet: true }).catch(() => undefined);
  }

  async function revertStoppedServerWrite(priorLatex: string) {
    try {
      await saveResumeLatexAction(
        resumeId,
        priorLatex,
        title,
        templateIdRef.current,
      );
    } catch {
      /* best-effort undo after Stop */
    }
  }

  function syncSourceSelection(e: SyntheticEvent<HTMLTextAreaElement>) {
    setSelection(readTextareaSelection(e.currentTarget));
  }

  function runVibeEdit(overrides?: VibeEditOverrides) {
    const text = (overrides?.prompt ?? prompt).trim();
    if (!text || busy) {
      if (!text) toast.message("Describe an edit or ask for a review");
      return;
    }

    const priorLatex = latex;
    const priorReply = reply;
    const id = ++runId.current;
    const signal = { cancelled: false };
    cancelSignalRef.current = signal;
    const reviewing = isResumeReviewPrompt(text);
    // Keep review prompts so users can tweak the target role and re-run.
    const clearPrompt =
      overrides?.clearPrompt !== undefined
        ? overrides.clearPrompt
        : !reviewing;
    setStatusLines([]);
    setQuotaOpen(false);
    setAiBusy(true);

    startTransition(async () => {
      if (!reviewing) {
        void streamClientSteps(signal);
      }

      try {
        const result = await vibeEditAction({
          resumeId,
          prompt: text,
          latex: priorLatex,
          ...(overrides?.compilerError
            ? { compilerError: overrides.compilerError }
            : {}),
        });
        signal.cancelled = true;
        if (id !== runId.current) {
          // Stop ignored the UI result, but the server may have already saved.
          if (
            result.ok &&
            result.mode === "edit" &&
            typeof result.data_json.latex === "string" &&
            result.data_json.latex !== priorLatex
          ) {
            void revertStoppedServerWrite(priorLatex);
          }
          return;
        }

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
        setLastPrompt(text);
        if (clearPrompt) {
          setPrompt("");
        }

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

        pushMutatingSnapshot({
          priorLatex,
          priorReply,
          nextLatex,
          nextReply: result.reply,
          prompt: text,
        });

        setLatex(nextLatex);
        setSelection(null);
        setDirty(true);
        setReview(null);
        setReply(result.reply);
        setGhostActive(true);

        if (result.pdfBase64) {
          setCompileError(null);
          setPdfBase64(result.pdfBase64);
          setPageCount(result.pageCount);
          setOnePageLock(result.lockedToOnePage);
          setMobilePane("preview");
        } else if (result.compileWarning) {
          setCompileError(result.compileWarning);
          // Edit saved; try a client recompile so the preview can still recover.
          void compilePdf(nextLatex, { quiet: true }).catch(() => undefined);
        } else {
          setCompileError(null);
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
          toast.success("AI edit saved", {
            description: "Preview unavailable — open the compile banner to fix.",
          });
        } else {
          toast.success("AI edit applied", {
            description: `${result.pageCount ?? "?"} page PDF`,
          });
        }
      } catch {
        signal.cancelled = true;
        if (id !== runId.current) return;
        setQuotaTitle("Network interrupted");
        setQuotaBody(
          "We couldn't reach the typesetter. Your draft is intact — export .tex as a backup.",
        );
        setQuotaOpen(true);
      } finally {
        if (id === runId.current) {
          setAiBusy(false);
        }
      }
    });
  }

  function runSelectionEdit() {
    const sel = selection;
    const text = selectionPrompt.trim();
    if (!sel || !sel.text.trim()) {
      toast.message("Select a span in the source first");
      return;
    }
    if (!text || busy) {
      if (!text) toast.message("Describe how to change the selection");
      return;
    }

    const priorLatex = latex;
    const priorReply = reply;
    const id = ++runId.current;
    cancelSignalRef.current = { cancelled: false };
    setStatusLines([]);
    setQuotaOpen(false);
    setAiBusy(true);

    startTransition(async () => {
      try {
        const result = await selectionEditAction({
          resumeId,
          latex: priorLatex,
          start: sel.start,
          end: sel.end,
          selectedText: sel.text,
          prompt: text,
        });
        if (id !== runId.current) {
          if (result.ok && result.latex !== priorLatex) {
            void revertStoppedServerWrite(priorLatex);
          }
          return;
        }

        if (!result.ok) {
          if (result.status === 429 || result.code === "AI_DAILY_LIMIT") {
            if (typeof result.used === "number") {
              applyUsage(result.used, undefined, result.limit);
            }
            setQuotaTitle("Daily AI token limit reached");
            setQuotaBody(
              `${result.error} Quota resets at UTC midnight. Your current resume draft is safe.`,
            );
            setQuotaOpen(true);
            return;
          }
          toast.error(result.error);
          return;
        }

        applyUsage(result.dailyTokensUsed, result.dailyTokensRemaining);
        setLastPrompt(text);
        setSelectionPrompt("");
        setSelection(null);

        pushMutatingSnapshot({
          priorLatex,
          priorReply,
          nextLatex: result.latex,
          nextReply: result.reply,
          prompt: text,
        });

        setLatex(result.latex);
        setDirty(true);
        setReview(null);
        setReply(result.reply);
        setGhostActive(true);
        setStatusLines(["Selection updated"]);
        toast.success("Selection updated");
        void compilePdf(result.latex, { quiet: true }).catch(() => undefined);
      } catch {
        if (id !== runId.current) return;
        setQuotaTitle("Network interrupted");
        setQuotaBody(
          "We couldn't reach the typesetter. Your draft is intact — export .tex as a backup.",
        );
        setQuotaOpen(true);
      } finally {
        if (id === runId.current) {
          setAiBusy(false);
        }
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
    setTemplateId(next.id);
    setLatex(next.latex);
    setSelection(null);
    setDirty(true);
    setGhostActive(true);
    setTemplatePickerOpen(false);
    toast.success(`Switched to ${next.name}`);
    void compilePdf(next.latex, { quiet: true }).catch(() => undefined);
  }

  function fixCompileWithAi() {
    if (!compileError) return;
    setMode("vibe");
    setMobilePane("edit");
    runVibeEdit({
      prompt: COMPILE_FIX_PROMPT,
      compilerError: compileError,
      clearPrompt: false,
    });
  }

  const saveLabel = saving ? "Saving…" : dirty ? "Unsaved" : "Saved";

  async function onShortenOrphan(bullet: OrphanBullet) {
    if (busy || shorteningIndex != null) return;
    const priorLatex = latex;
    const priorReply = reply;
    setShorteningIndex(bullet.index);
    setAiBusy(true);
    try {
      const result = await shortenBulletAction({
        resumeId,
        latex: priorLatex,
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
          description: "Try an AI edit, or trim a metric phrase manually.",
        });
        return;
      }
      pushMutatingSnapshot({
        priorLatex,
        priorReply,
        nextLatex: result.latex,
        nextReply: priorReply,
        prompt: "Tighten orphan bullet",
      });
      setLatex(result.latex);
      setSelection(null);
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
      setAiBusy(false);
    }
  }

  const hasSelection = Boolean(selection && selection.text.length > 0);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-studio-bg"
      data-testid="vibe-harness"
      data-token-used={tokensUsed}
    >
      {(busy || compiling) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
          data-testid="vermilion-loader"
        >
          <div className="h-full w-full origin-left animate-pulse bg-studio-vermilion" />
        </div>
      )}

      {/* Mobile Edit / Preview */}
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
          className={`flex-1 px-3 py-3 text-center text-sm font-medium transition ${
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
          className={`flex-1 px-3 py-3 text-center text-sm font-medium transition ${
            mobilePane === "preview"
              ? "border-b-2 border-studio-vermilion text-studio-ink"
              : "text-studio-muted"
          }`}
        >
          Preview
          {pageCount != null ? (
            <span className="ml-1 text-[0.7rem] font-normal text-studio-muted">
              {pageCount}p
            </span>
          ) : null}
        </button>
      </div>

      {/* Shared studio chrome — always available on Edit and Preview */}
      <header className="shrink-0 border-b border-studio-border bg-studio-bg px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-[0.95rem] font-semibold tracking-tight text-studio-ink">
                {title}
              </h1>
              <span
                className="shrink-0 text-[0.7rem] text-studio-muted"
                data-testid="save-state"
              >
                {saveLabel}
              </span>
            </div>
            {jobLabel ? (
              <p
                className="mt-0.5 truncate text-[0.7rem] text-studio-vermilion"
                data-testid="job-target-label"
                title={jobLabel}
              >
                {jobLabel}
              </p>
            ) : null}
          </div>
          <Link
            href="/dashboard"
            className={btnGhost}
            onClick={() => {
              if (dirtyRef.current) {
                void flushSave({ quiet: true });
              }
            }}
          >
            Library
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="inline-flex border border-studio-border bg-studio-paper p-0.5"
            role="group"
            aria-label="Editor mode"
          >
            <button
              type="button"
              className={`min-h-8 px-3 text-xs font-medium transition ${
                mode === "vibe"
                  ? "bg-studio-ink text-white"
                  : "text-studio-muted hover:text-studio-ink"
              }`}
              onClick={() => {
                setMode("vibe");
                setMobilePane("edit");
              }}
            >
              AI
            </button>
            <button
              type="button"
              className={`min-h-8 px-3 text-xs font-medium transition ${
                mode === "source"
                  ? "bg-studio-ink text-white"
                  : "text-studio-muted hover:text-studio-ink"
              }`}
              onClick={() => {
                setMode("source");
                setMobilePane("edit");
              }}
            >
              Source
            </button>
          </div>

          <button
            type="button"
            className={btnGhost}
            data-testid="writing-profile-open"
            onClick={() => setProfileOpen(true)}
          >
            Profile
          </button>
          <button
            type="button"
            className={`${btnGhost} max-w-[9rem] truncate sm:max-w-[12rem]`}
            onClick={() => setTemplatePickerOpen(true)}
            data-testid="template-switch"
            title={getTemplate(templateId).description}
          >
            {getTemplate(templateId).name}
          </button>

          {versions.stack.length > 1 ? (
            <VersionStepper
              index={versions.index}
              total={versions.stack.length}
              disabled={busy || compiling}
              onPrev={() => restoreVersion(versions.index - 1)}
              onNext={() => restoreVersion(versions.index + 1)}
            />
          ) : null}

          <button
            type="button"
            className={`${btnSecondary} ml-auto`}
            onClick={onCompile}
            disabled={compiling || busy}
          >
            {compiling ? "Compiling…" : "Compile"}
          </button>
        </div>

        {compileError ? (
          <div className="mt-3">
            <CompileErrorBanner
              error={compileError}
              pending={busy}
              onDismiss={() => setCompileError(null)}
              onFix={fixCompileWithAi}
            />
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside
          className={[
            "min-h-0 w-full flex-col overflow-hidden bg-studio-bg lg:border-r lg:border-studio-border",
            mobilePane === "edit" ? "flex flex-1" : "hidden",
            "lg:flex lg:w-[40%] lg:flex-none xl:w-[36%]",
          ].join(" ")}
        >
          {mode === "source" ? (
            <>
              {hasSelection ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-studio-border bg-studio-paper px-4 py-2.5 sm:px-5">
                  <span className="text-xs font-medium text-studio-ink">
                    Edit selection
                  </span>
                  <input
                    type="text"
                    value={selectionPrompt}
                    disabled={busy}
                    placeholder="e.g. Tighten this bullet"
                    aria-label="Selection edit prompt"
                    onChange={(e) => setSelectionPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runSelectionEdit();
                      }
                    }}
                    className="min-h-9 min-w-0 flex-1 border border-studio-border bg-studio-bg px-2.5 py-1.5 text-sm text-studio-ink outline-none placeholder:text-studio-muted/70 focus:border-studio-ink/30 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    data-testid="selection-edit-submit"
                    disabled={busy || !selectionPrompt.trim()}
                    onClick={runSelectionEdit}
                    className={btnPrimary}
                  >
                    {busy ? "Editing…" : "Apply"}
                  </button>
                </div>
              ) : (
                <p className="shrink-0 border-b border-studio-border px-4 py-2 text-xs text-studio-muted sm:px-5">
                  Select any span in the source to edit it with AI.
                </p>
              )}
              <textarea
                ref={sourceRef}
                aria-label="Resume LaTeX source"
                className="min-h-0 flex-1 resize-none bg-studio-paper px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-studio-ink outline-none focus:bg-white disabled:opacity-60 sm:px-5 sm:py-4"
                value={latex}
                spellCheck={false}
                disabled={busy}
                onChange={(e) => {
                  setLatex(e.target.value);
                  setDirty(true);
                  setSelection(readTextareaSelection(e.currentTarget));
                }}
                onSelect={syncSourceSelection}
                onKeyUp={syncSourceSelection}
                onMouseUp={syncSourceSelection}
              />
            </>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
                {review ? (
                  <ResumeReviewPanel review={review} />
                ) : reply ? (
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
                      AI reply
                    </p>
                    <p className="mt-2 text-[0.95rem] leading-relaxed text-studio-ink">
                      {reply}
                    </p>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[10rem] flex-col justify-center">
                    <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
                      AI assistant
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-studio-muted">
                      Ask for an edit, a role review, or paste a job description.
                      Pick a suggestion below to get started.
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-studio-border bg-studio-bg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
                <PromptRecipes
                  disabled={busy}
                  onPick={(recipePrompt) => {
                    setPrompt(recipePrompt);
                    promptRef.current?.focus();
                  }}
                />
                <div className="border border-studio-border bg-studio-paper focus-within:border-studio-ink/30">
                  <textarea
                    ref={promptRef}
                    data-testid="vibe-prompt"
                    aria-label="AI edit prompt"
                    className="w-full resize-none bg-transparent px-3 py-3 text-sm leading-relaxed text-studio-ink outline-none placeholder:text-studio-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
                    rows={3}
                    placeholder="What should change?"
                    value={prompt}
                    disabled={busy}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={onPromptKeyDown}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-studio-border/80 px-3 py-2">
                    <p className="hidden text-[0.7rem] text-studio-muted sm:block">
                      ⌘/Ctrl + Enter
                    </p>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
                      {busy ? (
                        <button
                          type="button"
                          data-testid="vibe-stop"
                          onClick={stopVibeEdit}
                          className={btnSecondary}
                        >
                          Stop
                        </button>
                      ) : null}
                      {!busy && lastPrompt ? (
                        <button
                          type="button"
                          data-testid="vibe-regenerate"
                          onClick={() =>
                            runVibeEdit({
                              prompt: lastPrompt,
                              clearPrompt: false,
                            })
                          }
                          className={btnSecondary}
                        >
                          Regenerate
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-testid="vibe-submit"
                        disabled={busy || !prompt.trim()}
                        onClick={() => runVibeEdit()}
                        className={`${btnPrimary} flex-1 sm:flex-none sm:min-w-[7.5rem]`}
                      >
                        {busy
                          ? promptIsReview
                            ? "Reviewing…"
                            : "Working…"
                          : promptIsReview
                            ? "Review"
                            : "Run"}
                      </button>
                    </div>
                  </div>
                </div>
                <StatusLog lines={statusLines} active={busy} />
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-border bg-studio-canvas/90 px-4 py-2.5 sm:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-studio-ink">Preview</span>
              <span
                data-testid="one-page-lock"
                className={`font-mono text-[0.7rem] ${
                  onePageLock ? "text-emerald-700" : "text-studio-muted"
                }`}
              >
                {onePageLock
                  ? `${pageCount ?? 1} page · locked`
                  : `${pageCount ?? "?"} page${pageCount === 1 ? "" : "s"}`}
              </span>
            </div>
            <LineOptimizerToggle
              enabled={heatmapOn}
              orphanCount={orphanCount}
              onChange={setHeatmapOn}
              ready={heatmapReady}
              compact
            />
          </div>

          <div className="flex flex-1 flex-col items-center gap-4 overflow-auto px-4 py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-6">
            <PDFPreview
              pdfBase64={pdfBase64}
              pageCount={pageCount}
              ghostActive={ghostActive}
              pendingLatex={latex}
              compiling={compiling || busy}
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
      </div>

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
        confirmLabel="Replace source"
        initialTemplateId={templateId}
        hideTitle
        onClose={() => setTemplatePickerOpen(false)}
        onConfirm={(id) => applyTemplate(id)}
      />
      <WritingProfileModal
        open={profileOpen}
        profile={writingProfile}
        onClose={() => setProfileOpen(false)}
        onSaved={(profile) => {
          setWritingProfile(profile);
          toast.success("Writing profile saved");
        }}
      />
    </div>
  );
}

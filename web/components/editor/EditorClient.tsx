"use client";

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

import { selectionEditAction } from "@/app/actions/selection-edit";
import { vibeEditAction } from "@/app/actions/vibe-edit";
import { shortenBulletAction } from "@/app/actions/shorten-bullet";
import { saveResumeLatexAction } from "@/app/actions/resumes";
import { CompileErrorBanner } from "@/components/editor/CompileErrorBanner";
import { LatexSourceEditor } from "@/components/editor/LatexSourceEditor";
import { LineOptimizerToggle, useLineOptimizerPreference } from "@/components/editor/LineOptimizerToggle";
import { OrphanHeatmapPanel } from "@/components/editor/OrphanHeatmapPanel";
import { PDFPreview } from "@/components/editor/PDFPreview";
import { PromptRecipes } from "@/components/editor/PromptRecipes";
import { QuotaModal } from "@/components/editor/QuotaModal";
import { ResumeReviewPanel } from "@/components/editor/ResumeReviewPanel";
import { SplitPane } from "@/components/editor/SplitPane";
import type { SourceSelection } from "@/components/editor/source-selection";
import { StatusLog } from "@/components/editor/StatusLog";
import { VersionStepper } from "@/components/editor/VersionStepper";
import { WritingProfileModal } from "@/components/editor/WritingProfileModal";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import {
  appendLocalSnapshot,
  type LocalAiSnapshot,
} from "@/lib/ai-history";
import { analyzeOrphans, type OrphanBullet } from "@/lib/analyzer/orphanDetector";
import {
  FORMAT_CONSISTENCY_PROMPT,
  polishResumeLatex,
  summarizeFormatChanges,
} from "@/lib/format-resume";
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
import { VIBE_CLIENT_STEPS } from "@/lib/vibe-steps";

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

type MobilePane = "edit" | "preview";

type PreviewZoom = number | "fit";

type VibeEditOverrides = {
  prompt?: string;
  compilerError?: string;
  clearPrompt?: boolean;
  successTitle?: string;
};

type VersionState = {
  stack: LocalAiSnapshot[];
  index: number;
};

const CLIENT_STEPS = VIBE_CLIENT_STEPS;

const COMPILE_FIX_PROMPT =
  "Fix this LaTeX compile error without inventing new experience. Keep facts honest.";

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
  const [, startTransition] = useTransition();
  /** Own busy flag so Stop can unlock the UI before the server action settles. */
  const [aiBusy, setAiBusy] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const busy = aiBusy;
  const [mobilePane, setMobilePane] = useState<MobilePane>("edit");
  const [zoom, setZoom] = useState<PreviewZoom>("fit");
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
  const runId = useRef(0);
  const streamSignalRef = useRef<{ cancelled: boolean } | null>(null);
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
          toast.error(result.error, { id: "autosave-failed" });
          window.setTimeout(() => {
            void flushSave();
          }, 4000);
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
        return;
      } while (passes < 5);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t save draft", {
        id: "autosave-failed",
      });
      window.setTimeout(() => {
        void flushSave();
      }, 4000);
    } finally {
      savingRef.current = false;
      if (pendingResaveRef.current) {
        pendingResaveRef.current = false;
        void flushSave();
      }
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
    function onLeave(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
      void flushSave();
    }
    function onHide() {
      if (dirty) void flushSave();
    }
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("pagehide", onHide);
    };
  }, [dirty, flushSave]);

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
        toast.message("Updating preview…");
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
        if (!quiet) {
          setMobilePane("preview");
          toast.success("Preview ready", {
            description:
              data.pageCount === 1
                ? "Fits on one page"
                : `${data.pageCount ?? "?"} pages`,
          });
        }
        return data;
      } catch (err) {
        if (gen === compileGen.current) {
          const message = err instanceof Error ? err.message : "Compile failed";
          setCompileError(message);
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

  function stopVibeEdit() {
    runId.current += 1;
    if (streamSignalRef.current) streamSignalRef.current.cancelled = true;
    setAiBusy(false);
    setStatusLines(["Stopped — draft unchanged."]);
    toast.message("Stopped", { description: "Draft unchanged." });
  }

  function restoreVersion(nextIndex: number) {
    const snap = versions.stack[nextIndex];
    if (!snap || busy || compiling) return;
    setVersions((prev) => ({ ...prev, index: nextIndex }));
    setLatex(snap.latex);
    setReply(snap.reply);
    setReview(null);
    setDirty(true);
    setGhostActive(true);
    void compilePdf(snap.latex, { quiet: true }).catch(() => undefined);
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
    streamSignalRef.current = signal;
    const reviewing = isResumeReviewPrompt(text);
    const clearPrompt = overrides?.clearPrompt !== false;
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
          latex: latexRef.current,
          templateId: templateIdRef.current,
          ...(overrides?.compilerError
            ? { compilerError: overrides.compilerError }
            : {}),
        });
        signal.cancelled = true;
        if (id !== runId.current) {
          if (!reviewing) {
            void saveResumeLatexAction(
              resumeId,
              priorLatex,
              title,
              templateIdRef.current,
            );
          }
          return;
        }

        if (!result.ok) {
          if (result.steps?.length) {
            setStatusLines(
              result.steps.map((s) => `[${s.index}/${s.total}] ${s.message}`),
            );
          }
          if (result.code === "GROQ_BUSY") {
            toast.error(result.error);
            return;
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
        setDirty(true);
        setReview(null);
        setReply(result.reply);
        setGhostActive(true);

        if (result.pdfBase64) {
          setCompileError(null);
          setPdfBase64(result.pdfBase64);
          setPageCount(result.pageCount);
          setOnePageLock(result.lockedToOnePage);
        } else if (result.compileWarning) {
          setCompileError(result.compileWarning);
          // Edit saved; try a client recompile so the preview can still recover.
          void compilePdf(nextLatex, { quiet: true }).catch(() => undefined);
        } else {
          setCompileError(null);
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
          toast.success(overrides?.successTitle ?? "Vibe edit saved", {
            description: `AI applied · preview unavailable: ${result.compileWarning}`,
          });
        } else {
          toast.success(overrides?.successTitle ?? "Vibe edit applied", {
            description: overrides?.successTitle
              ? result.reply.trim()
              : `${result.tokensUsed.toLocaleString()} tokens · ${result.pageCount ?? "?"} page PDF`,
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

  async function formatForConsistency() {
    if (busy || compiling) return;

    const current = latexRef.current;
    const polished = polishResumeLatex(current);
    const next = polished.latex;
    const summary = summarizeFormatChanges(polished.changes);

    if (next !== current || dirty) {
      latexRef.current = next;
      if (next !== current) {
        setLatex(next);
        setDirty(true);
      }
      const saved = await saveResumeLatexAction(
        resumeId,
        next,
        title,
        templateIdRef.current,
      );
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      setDirty(false);
    }

    toast.message("Applying house style…", { description: summary });
    runVibeEdit({
      prompt: FORMAT_CONSISTENCY_PROMPT,
      clearPrompt: false,
      successTitle: "House style applied",
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
        if (id !== runId.current) return;

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
        setStatusLines([`Selection updated · ${result.tokensUsed} tokens`]);
        toast.success("Selection updated", {
          description: "Recompiling preview…",
        });
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


  const hasSelection = Boolean(selection && selection.text.length > 0);

  function bumpZoom(delta: number) {
    setZoom((prev) => {
      const base = prev === "fit" ? 100 : prev;
      return Math.min(200, Math.max(50, base + delta));
    });
  }

  const sourcePane = (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-studio-bg">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-[0.95rem] font-semibold tracking-tight text-studio-ink">
              {title}
            </h1>
            <span
              className={`shrink-0 text-[0.7rem] ${
                dirty ? "text-studio-muted" : "text-emerald-700"
              }`}
            >
              {dirty ? "Unsaved" : "Saved"}
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
        <div className="flex shrink-0 items-center gap-1 text-xs text-studio-muted">
          <button
            type="button"
            className="min-h-8 rounded-md px-2 transition hover:bg-studio-paper hover:text-studio-ink"
            data-testid="writing-profile-open"
            onClick={() => setProfileOpen(true)}
          >
            Profile
          </button>
          <button
            type="button"
            className="min-h-8 max-w-[9rem] truncate rounded-md px-2 transition hover:bg-studio-paper hover:text-studio-ink sm:max-w-[12rem]"
            onClick={() => setTemplatePickerOpen(true)}
            data-testid="template-switch"
            title={getTemplate(templateId).description}
          >
            {getTemplate(templateId).name}
          </button>
          <button
            type="button"
            className="min-h-8 rounded-md px-2 transition hover:bg-studio-paper hover:text-studio-ink disabled:opacity-50"
            data-testid="format-consistency"
            title="Normalize dates, bullets, and tense. Facts stay put."
            disabled={compiling || busy}
            onClick={() => {
              void formatForConsistency();
            }}
          >
            Format
          </button>
        </div>
      </div>

      {hasSelection ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-studio-border bg-studio-paper px-3 py-2 sm:px-4">
          <span className="text-[0.7rem] font-medium text-studio-ink">Edit selection</span>
          <input
            type="text"
            value={selectionPrompt}
            disabled={busy}
            placeholder="e.g. Tighten this bullet"
            onChange={(e) => setSelectionPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSelectionEdit();
              }
            }}
            className="min-h-8 min-w-0 flex-1 rounded-md border border-studio-border bg-studio-bg px-2 py-1 text-xs text-studio-ink outline-none placeholder:text-studio-muted/70 focus:border-studio-ink/30 disabled:opacity-60"
          />
          <button
            type="button"
            data-testid="selection-edit-submit"
            disabled={busy || !selectionPrompt.trim()}
            onClick={runSelectionEdit}
            className="min-h-8 rounded-md bg-studio-vermilion px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-45"
          >
            {busy ? "Editing…" : "Apply"}
          </button>
        </div>
      ) : null}

      <LatexSourceEditor
        value={latex}
        disabled={busy}
        onChange={(next) => {
          setLatex(next);
          setDirty(true);
        }}
        onSelectionChange={setSelection}
      />

      <div className="shrink-0 border-t border-studio-border bg-studio-bg px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        {versions.stack.length > 1 ? (
          <div className="mb-2">
            <VersionStepper
              index={versions.index}
              total={versions.stack.length}
              disabled={busy || compiling}
              onPrev={() => restoreVersion(versions.index - 1)}
              onNext={() => restoreVersion(versions.index + 1)}
            />
          </div>
        ) : null}
        {review ? (
          <div className="mb-2 max-h-36 overflow-auto rounded-lg border border-studio-border bg-studio-paper p-3">
            <ResumeReviewPanel review={review} />
          </div>
        ) : reply ? (
          <p className="mb-2 line-clamp-3 text-sm leading-relaxed text-studio-ink">{reply}</p>
        ) : null}
        {compileError ? (
          <div className="mb-2">
            <CompileErrorBanner
              error={compileError}
              pending={busy}
              onDismiss={() => setCompileError(null)}
              onFix={() => {
                if (!compileError) return;
                runVibeEdit({
                  prompt: COMPILE_FIX_PROMPT,
                  compilerError: compileError,
                  clearPrompt: false,
                });
              }}
            />
          </div>
        ) : null}
        <PromptRecipes
          disabled={busy}
          onPick={(recipePrompt, recipeId) => {
            if (recipeId === "format") {
              void formatForConsistency();
              return;
            }
            setPrompt(recipePrompt);
            promptRef.current?.focus();
          }}
        />
        <div className="rounded-xl border border-studio-border bg-studio-paper focus-within:border-amber-500/40">
          <textarea
            ref={promptRef}
            data-testid="vibe-prompt"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-studio-ink outline-none placeholder:text-studio-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
            rows={2}
            placeholder="Vibe Edit (e.g., 'Make my bullet points sound more impact-driven')..."
            value={prompt}
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onPromptKeyDown}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-studio-border/80 px-3 py-2">
            <p className="hidden text-[0.7rem] text-studio-muted sm:block">⌘/Ctrl + Enter</p>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
              {busy ? (
                <button
                  type="button"
                  data-testid="vibe-stop"
                  onClick={stopVibeEdit}
                  className="min-h-9 rounded-md border border-studio-border bg-studio-paper px-3 py-2 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30"
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
                  className="min-h-9 rounded-md border border-studio-border bg-studio-paper px-3 py-2 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30"
                >
                  Regenerate
                </button>
              ) : null}
              <button
                type="button"
                data-testid="vibe-submit"
                disabled={busy || !prompt.trim()}
                onClick={() => runVibeEdit()}
                className="min-h-9 flex-1 rounded-lg bg-studio-vermilion px-3 py-2 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-45 sm:flex-none sm:min-w-[7.5rem]"
              >
                {busy ? (promptIsReview ? "Reviewing…" : "Working…") : promptIsReview ? "Review" : "Run"}
              </button>
            </div>
          </div>
        </div>
        <StatusLog lines={statusLines} active={busy} />
      </div>
    </aside>
  );

  const previewPane = (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-studio-canvas">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-border bg-studio-canvas/95 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={onCompile}
          disabled={compiling || busy}
          className="min-h-9 rounded-md bg-studio-vermilion px-3.5 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-50"
        >
          {compiling ? "Compiling…" : "Recompile"}
        </button>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <span
            data-testid="one-page-lock"
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-semibold tracking-wide ${
              onePageLock
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
            }`}
          >
            {onePageLock
              ? "[ 🟢 1-PAGE LOCK ACTIVE ]"
              : `[ wrapping · ${pageCount ?? "?"}p ]`}
          </span>
          <LineOptimizerToggle
            enabled={heatmapOn}
            orphanCount={orphanCount}
            onChange={setHeatmapOn}
            ready={heatmapReady}
            compact
          />
          <div
            className="inline-flex items-center rounded-full border border-slate-200/80 bg-white p-0.5 shadow-sm"
            data-testid="preview-zoom"
          >
            <button
              type="button"
              aria-label="Zoom out"
              className="grid h-8 w-8 place-items-center rounded-full text-sm text-studio-ink transition hover:bg-studio-canvas"
              onClick={() => bumpZoom(-10)}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Reset zoom to 100 percent"
              className={`min-h-8 min-w-[3.25rem] rounded-full px-2 text-[0.7rem] font-semibold transition ${
                zoom === 100
                  ? "bg-amber-500 text-white"
                  : "text-studio-ink hover:bg-studio-canvas"
              }`}
              onClick={() => setZoom(100)}
            >
              100%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              className="grid h-8 w-8 place-items-center rounded-full text-sm text-studio-ink transition hover:bg-studio-canvas"
              onClick={() => bumpZoom(10)}
            >
              +
            </button>
            <button
              type="button"
              className={`min-h-8 rounded-full px-2.5 text-[0.7rem] font-semibold transition ${
                zoom === "fit"
                  ? "bg-amber-500 text-white"
                  : "text-studio-ink hover:bg-studio-canvas"
              }`}
              onClick={() => setZoom("fit")}
            >
              Fit
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 p-3 sm:p-4">
          <div className="mx-auto h-full max-w-[8.5in]">
            <PDFPreview
              pdfBase64={pdfBase64}
              pageCount={pageCount}
              ghostActive={ghostActive}
              compiling={compiling || busy}
              zoom={zoom}
            />
          </div>
        </div>
        {heatmapOn && heatmapReady ? (
          <div className="max-h-[28vh] shrink-0 overflow-auto border-t border-studio-border bg-studio-bg px-4 py-3 sm:px-5">
            <OrphanHeatmapPanel
              latex={latex}
              enabled
              shorteningIndex={shorteningIndex}
              onShorten={(bullet) => {
                void onShortenOrphan(bullet);
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );

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
          Source
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

      <SplitPane
        mobileShow={mobilePane === "preview" ? "right" : "left"}
        left={sourcePane}
        right={previewPane}
      />

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

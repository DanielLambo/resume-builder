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
import dynamic from "next/dynamic";
import { toast } from "sonner";

import { selectionEditAction } from "@/app/actions/selection-edit";
import { vibeEditAction } from "@/app/actions/vibe-edit";
import { shortenBulletAction } from "@/app/actions/shorten-bullet";
import { saveResumeLatexAction } from "@/app/actions/resumes";
import {
  AiComposerDock,
  type ComposerProposal,
} from "@/components/editor/AiComposerDock";
import { EditableResumeTitle } from "@/components/editor/EditableResumeTitle";
import { LineOptimizerToggle, useLineOptimizerPreference } from "@/components/editor/LineOptimizerToggle";
import { OrphanHeatmapPanel } from "@/components/editor/OrphanHeatmapPanel";
import { PDFPreview } from "@/components/editor/PDFPreview";
import { findLatexLineForPdfText } from "@/lib/pdf-locate-in-source";
import { QuotaModal } from "@/components/editor/QuotaModal";
import { SplitPane, BottomDock } from "@/components/editor/SplitPane";
import type { SourceSelection } from "@/components/editor/source-selection";
import { WritingProfileModal } from "@/components/editor/WritingProfileModal";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import {
  appendLocalSnapshot,
  type LocalAiSnapshot,
} from "@/lib/ai-history";
import { summarizeLatexDiff } from "@/lib/ai/latex-diff";
import { analyzeOrphans, type OrphanBullet } from "@/lib/analyzer/orphanDetector";
import { parseCompileResponse } from "@/lib/compile-client";
import {
  FORMAT_CONSISTENCY_PROMPT,
  polishResumeLatex,
  summarizeFormatChanges,
} from "@/lib/format-resume";
import { getPromptRecipe } from "@/lib/prompt-recipes";
import { isResumeReviewPrompt, type ResumeReview } from "@/lib/resume-review";
import {
  getTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-template";
import {
  GROQ_BUSY_MESSAGE,
  looksLikeGroqLimitMessage,
} from "@/lib/groq-messages";
import { useTokenUsage } from "@/lib/token-usage";
import {
  EMPTY_WRITING_PROFILE,
  type WritingProfile,
} from "@/lib/writing-profile";
import { VIBE_CLIENT_STEPS } from "@/lib/vibe-steps";

const LatexSourceEditor = dynamic(
  () =>
    import("@/components/editor/LatexSourceEditor").then(
      (m) => m.LatexSourceEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-ide-bg font-mono text-[0.7rem] text-ide-muted">
        Loading editor…
      </div>
    ),
  },
);

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
  forceDocument?: boolean;
};

type PendingProposal = ComposerProposal & {
  priorLatex: string;
  nextLatex: string;
  priorReply: string | null;
  priorPdf: string | null;
  priorPageCount: number | null;
  priorOnePageLock: boolean;
  /** True if pre-proposal draft was flushed before lock. */
  priorSaved: boolean;
  nextPdf: string | null;
  nextPageCount: number | null;
  lockedToOnePage: boolean | null;
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
  const [docTitle, setDocTitle] = useState(title);
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
  const [compileErrorLine, setCompileErrorLine] = useState<number | null>(null);
  const [jumpToLine, setJumpToLine] = useState<number | null>(null);
  const busy = aiBusy;
  const [mobilePane, setMobilePane] = useState<MobilePane>("edit");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
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
  const [selectionClearToken, setSelectionClearToken] = useState(0);
  const [proposal, setProposal] = useState<PendingProposal | null>(null);
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
  const titleRef = useRef(docTitle);
  const templateIdRef = useRef(templateId);
  const savingRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const proposalLockRef = useRef(false);
  const didInitialCompile = useRef(false);
  latexRef.current = latex;
  titleRef.current = docTitle;
  templateIdRef.current = templateId;

  const orphanCount = useMemo(
    () => (heatmapOn ? analyzeOrphans(latex).orphanCount : 0),
    [heatmapOn, latex],
  );

  const flushSave = useCallback(async () => {
    if (proposalLockRef.current) return;
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
        const snapshotTitle = titleRef.current;
        const snapshotTemplate = templateIdRef.current;
        const result = await saveResumeLatexAction(
          resumeId,
          snapshot,
          snapshotTitle,
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
          titleRef.current !== snapshotTitle ||
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
  }, [resumeId]);

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
    function onKey(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (proposalLockRef.current) {
        toast.message("Keep or discard the preview first");
        return;
      }
      void flushSave().then(() => {
        toast.success("Draft saved");
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushSave]);

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
        let compileSource = source;
        try {
          const { prepareLatexForCompile } = await import("@/lib/latex-prepare");
          const prepared = prepareLatexForCompile(source);
          compileSource = prepared.latex;
          if (prepared.convertedFromJake && prepared.latex !== source) {
            setLatex(prepared.latex);
            latexRef.current = prepared.latex;
            setDirty(true);
            if (!quiet) {
              toast.message("Converted Jake template to Resumate LaTeX");
            }
          } else if (prepared.latex !== source) {
            compileSource = prepared.latex;
          }
        } catch (prepErr) {
          const message =
            prepErr instanceof Error
              ? prepErr.message
              : "Couldn’t prepare LaTeX for compile.";
          const short =
            message.length > 140 ? `${message.slice(0, 137)}…` : message;
          if (gen === compileGen.current) {
            setCompileError(short);
          }
          throw new Error(short);
        }

        const res = await fetch("/api/compile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/pdf",
          },
          body: JSON.stringify({
            latex: compileSource,
            autoFit: true,
            resumeId,
          }),
        });
        const data = await parseCompileResponse(res);
        if (!data.success) {
          const message = data.hint?.trim() || data.error.trim() || "Compile failed";
          const short =
            /^Line \d+:/i.test(message) || message.length <= 280
              ? message.length > 320
                ? `${message.slice(0, 317)}…`
                : message
              : message.length > 140
                ? `${message.slice(0, 137)}…`
                : message;
          if (gen === compileGen.current) {
            setCompileError(short);
            setCompileErrorLine(
              typeof data.line === "number" ? data.line : null,
            );
            if (typeof data.line === "number") {
              setJumpToLine(data.line);
              setMobilePane("edit");
            }
          }
          throw new Error(short);
        }
        if (gen !== compileGen.current) return data; // stale response
        setCompileError(null);
        setCompileErrorLine(null);
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
          const short =
            /^Line \d+:/i.test(message) || message.length <= 280
              ? message.length > 320
                ? `${message.slice(0, 317)}…`
                : message
              : message.length > 140
                ? `${message.slice(0, 137)}…`
                : message;
          setCompileError(short);
          const lineMatch = /^Line (\d+):/i.exec(short);
          if (lineMatch) {
            const line = Number(lineMatch[1]);
            setCompileErrorLine(line);
            setJumpToLine(line);
            setMobilePane("edit");
          }
          if (!quiet) toast.error("PDF compile failed", { description: short });
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

  async function presentProposal(input: {
    prompt: string;
    reply: string;
    scope: "selection" | "document";
    priorLatex: string;
    priorReply: string | null;
    nextLatex: string;
    nextPdf: string | null;
    nextPageCount: number | null;
    lockedToOnePage: boolean | null;
  }) {
    // Flush the pre-proposal draft before locking autosave so Discard can't
    // silently drop not-yet-persisted edits.
    let priorSaved = false;
    try {
      const saved = await saveResumeLatexAction(
        resumeId,
        input.priorLatex,
        titleRef.current,
        templateIdRef.current,
      );
      priorSaved = saved.ok;
      if (!saved.ok) {
        toast.error(saved.error, { id: "autosave-failed" });
      }
    } catch {
      priorSaved = false;
    }

    proposalLockRef.current = true;
    setReview(null);
    setReply(input.reply);
    setLatex(input.nextLatex);
    setGhostActive(true);
    if (input.nextPdf) {
      setCompileError(null);
      setPdfBase64(input.nextPdf);
      setPageCount(input.nextPageCount);
      if (input.lockedToOnePage != null) {
        setOnePageLock(input.lockedToOnePage);
      }
    }
    setProposal({
      prompt: input.prompt,
      reply: input.reply,
      scope: input.scope,
      diff: summarizeLatexDiff(input.priorLatex, input.nextLatex),
      priorLatex: input.priorLatex,
      nextLatex: input.nextLatex,
      priorReply: input.priorReply,
      priorPdf: pdfBase64,
      priorPageCount: pageCount,
      priorOnePageLock: onePageLock,
      priorSaved,
      nextPdf: input.nextPdf,
      nextPageCount: input.nextPageCount,
      lockedToOnePage: input.lockedToOnePage,
    });
    setMobilePane("preview");
  }

  function keepProposal() {
    if (!proposal || busy) return;
    pushMutatingSnapshot({
      priorLatex: proposal.priorLatex,
      priorReply: proposal.priorReply,
      nextLatex: proposal.nextLatex,
      nextReply: proposal.reply,
      prompt: proposal.prompt,
    });
    proposalLockRef.current = false;
    setProposal(null);
    setDirty(true);
    setSelection(null);
    setSelectionClearToken((token) => token + 1);
    toast.success("Changes kept", {
      description:
        proposal.scope === "selection"
          ? "Highlighted text updated."
          : "Resume updated.",
    });
  }

  function discardProposal() {
    if (!proposal || busy) return;
    // Invalidate in-flight compiles so a late PDF can't overwrite the restore.
    compileGen.current += 1;
    setCompiling(false);
    setLatex(proposal.priorLatex);
    latexRef.current = proposal.priorLatex;
    setReply(proposal.priorReply);
    setPdfBase64(proposal.priorPdf);
    setPageCount(proposal.priorPageCount);
    setOnePageLock(proposal.priorOnePageLock);
    proposalLockRef.current = false;
    setProposal(null);
    setDirty(!proposal.priorSaved);
    setGhostActive(false);
    setStatusLines(["Discarded — draft unchanged."]);
    toast.message("Discarded", { description: "Draft unchanged." });
  }

  function restoreVersion(nextIndex: number) {
    const snap = versions.stack[nextIndex];
    if (!snap || busy || compiling || proposal) return;
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
    if (proposal) {
      toast.message("Keep or discard the preview first");
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
        const sel = selection;
        const useSelection =
          !overrides?.forceDocument &&
          !reviewing &&
          Boolean(sel && sel.text.trim());

        if (useSelection && sel) {
          const result = await selectionEditAction({
            resumeId,
            latex: latexRef.current,
            start: sel.start,
            end: sel.end,
            selectedText: sel.text,
            prompt: text,
            commit: false,
          });
          signal.cancelled = true;
          if (id !== runId.current) return;
          if (!result.ok) {
            if (result.code === "GROQ_BUSY" || looksLikeGroqLimitMessage(result.error)) {
              toast.error(
                result.code === "GROQ_BUSY" ? result.error : GROQ_BUSY_MESSAGE,
              );
              return;
            }
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
          if (clearPrompt) setPrompt("");
          await presentProposal({
            prompt: text,
            reply: result.reply,
            scope: "selection",
            priorLatex,
            priorReply,
            nextLatex: result.latex,
            nextPdf: null,
            nextPageCount: null,
            lockedToOnePage: null,
          });
          void compilePdf(result.latex, { quiet: true })
            .then((compiled) => {
              if (!compiled?.pdfBase64) return;
              // compilePdf already applied PDF when still current; only
              // refresh proposal metadata if the preview is still open.
              setProposal((current) =>
                current
                  ? {
                      ...current,
                      nextPdf: compiled.pdfBase64 ?? null,
                      nextPageCount: compiled.pageCount ?? null,
                      lockedToOnePage: Boolean(
                        compiled.lockedToOnePage ?? compiled.pageCount === 1,
                      ),
                    }
                  : current,
              );
            })
            .catch(() => undefined);
          return;
        }

        const result = await vibeEditAction({
          resumeId,
          prompt: text,
          latex: latexRef.current,
          templateId: templateIdRef.current,
          commit: false,
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
              titleRef.current,
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
          if (result.code === "GROQ_BUSY" || looksLikeGroqLimitMessage(result.error)) {
            toast.error(
              result.code === "GROQ_BUSY" ? result.error : GROQ_BUSY_MESSAGE,
            );
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

        if (result.compileWarning) {
          setCompileError(result.compileWarning);
        }

        // Paint latex immediately; compile PDF off the critical path (optimistic).
        await presentProposal({
          prompt: text,
          reply: result.reply,
          scope: "document",
          priorLatex,
          priorReply,
          nextLatex,
          nextPdf: result.pdfBase64,
          nextPageCount: result.pageCount,
          lockedToOnePage: result.lockedToOnePage,
        });

        if (!result.pdfBase64) {
          void compilePdf(nextLatex, { quiet: true })
            .then((compiled) => {
              if (!compiled?.pdfBase64) return;
              setProposal((current) =>
                current
                  ? {
                      ...current,
                      nextPdf: compiled.pdfBase64 ?? null,
                      nextPageCount: compiled.pageCount ?? null,
                      lockedToOnePage: Boolean(
                        compiled.lockedToOnePage ?? compiled.pageCount === 1,
                      ),
                    }
                  : current,
              );
            })
            .catch(() => undefined);
        }

        const serverLines = result.steps.map(
          (s) => `[${s.index}/${s.total}] ${s.message}`,
        );
        setStatusLines(
          serverLines.length
            ? serverLines
            : ["Edit ready — compiling preview…"],
        );
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
    if (busy || compiling || proposal) return;

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
        titleRef.current,
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
      forceDocument: true,
    });
  }

  function onPromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runVibeEdit();
    }
  }

  function onCompile() {
    if (proposal) {
      toast.message("Keep or discard the preview first");
      return;
    }
    void compilePdf(latex).catch(() => {
      /* toast already shown inside compilePdf */
    });
  }

  function onLocateInSourceFromPdf(pdfText: string) {
    const line = findLatexLineForPdfText(latexRef.current || latex, pdfText);
    if (line == null) {
      toast.message("Couldn’t find that in the source", {
        description: "Try double-clicking a clearer heading or bullet.",
      });
      return;
    }
    setJumpToLine(line);
    setMobilePane("edit");
  }

  function applyTemplate(nextId: ResumeTemplateId) {
    if (proposal) {
      toast.message("Keep or discard the preview first");
      return;
    }
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
    if (proposal || busy) return;
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
        if (result.code === "GROQ_BUSY" || looksLikeGroqLimitMessage(result.error)) {
          toast.error(
            result.code === "GROQ_BUSY" ? result.error : GROQ_BUSY_MESSAGE,
          );
          return;
        }
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


  function bumpZoom(delta: number) {
    setZoom((prev) => {
      const base = prev === "fit" ? 100 : prev;
      return Math.min(200, Math.max(50, base + delta));
    });
  }

  const sourcePane = (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-ide-border/60 bg-ide-bg">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-ide-border bg-ide-panel px-2 sm:px-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <EditableResumeTitle
              value={docTitle}
              disabled={busy || Boolean(proposal)}
              onCommit={(next) => {
                setDocTitle(next);
                titleRef.current = next;
                setDirty(true);
                void flushSave();
              }}
            />
            <span
              className={`shrink-0 font-mono text-[0.6rem] ${
                proposal
                  ? "text-amber-400"
                  : dirty
                    ? "text-ide-faint"
                    : "text-ide-accent"
              }`}
            >
              {proposal ? "preview" : dirty ? "unsaved" : "saved"}
            </span>
          </div>
          {jobLabel ? (
            <p
              className="truncate font-mono text-[0.58rem] text-ide-muted"
              data-testid="job-target-label"
              title={jobLabel}
            >
              {jobLabel}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-px text-[0.68rem] text-ide-muted">
          <button
            type="button"
            className="min-h-6 rounded-sm px-1.5 transition hover:bg-ide-hover hover:text-ide-ink"
            data-testid="writing-profile-open"
            onClick={() => {
              if (proposal) {
                toast.message("Keep or discard the preview first");
                return;
              }
              setProfileOpen(true);
            }}
          >
            Profile
          </button>
          <button
            type="button"
            className="min-h-6 max-w-[8rem] truncate rounded-sm px-1.5 transition hover:bg-ide-hover hover:text-ide-ink sm:max-w-[11rem]"
            onClick={() => {
              if (proposal) {
                toast.message("Keep or discard the preview first");
                return;
              }
              setTemplatePickerOpen(true);
            }}
            data-testid="template-switch"
            title={getTemplate(templateId).description}
          >
            {getTemplate(templateId).name}
          </button>
          <button
            type="button"
            className="hidden min-h-6 rounded-sm px-1.5 transition hover:bg-ide-hover hover:text-ide-ink disabled:opacity-50 sm:inline"
            data-testid="format-consistency"
            title="Normalize dates, bullets, and tense. Facts stay put."
            disabled={compiling || busy || Boolean(proposal)}
            onClick={() => {
              void formatForConsistency();
            }}
          >
            Format
          </button>
        </div>
      </div>

      <LatexSourceEditor
        value={latex}
        disabled={busy || Boolean(proposal)}
        jumpToLine={jumpToLine}
        clearSelectionToken={selectionClearToken}
        onJumped={() => setJumpToLine(null)}
        onChange={(next) => {
          setLatex(next);
          setDirty(true);
        }}
        onSelectionChange={setSelection}
      />
    </aside>
  );

  const previewPane = (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-ide-gutter">
      <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-ide-border bg-ide-panel px-2 [scrollbar-width:none] sm:h-8 sm:px-2.5 [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={onCompile}
          disabled={compiling || busy || Boolean(proposal)}
          className="min-h-7 shrink-0 rounded bg-ide-accent px-2.5 text-[0.72rem] font-semibold text-white transition hover:bg-ide-accent-hover disabled:cursor-not-allowed disabled:bg-ide-raised disabled:text-ide-faint"
        >
          {compiling ? "Compiling…" : "Recompile"}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span
            data-testid="one-page-lock"
            className={`inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide ${
              onePageLock
                ? "bg-ide-raised text-ide-accent ring-1 ring-ide-border"
                : "bg-ide-raised text-ide-muted ring-1 ring-ide-border"
            }`}
          >
            {onePageLock ? "1 page" : `${pageCount ?? "?"}p`}
          </span>
          <div className="hidden sm:block">
            <LineOptimizerToggle
              enabled={heatmapOn}
              orphanCount={orphanCount}
              onChange={setHeatmapOn}
              ready={heatmapReady}
              compact
              variant="ide"
            />
          </div>
          <div
            className="inline-flex items-center rounded-sm border border-ide-border bg-ide-raised p-0.5"
            data-testid="preview-zoom"
          >
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom !== "fit" && zoom <= 50}
              className="grid h-6 w-6 place-items-center rounded-sm text-sm text-ide-muted transition hover:bg-ide-hover hover:text-ide-ink disabled:opacity-35"
              onClick={() => bumpZoom(-10)}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Reset zoom to 100 percent"
              className={`min-h-6 min-w-[2.5rem] rounded-sm px-1.5 font-mono text-[0.62rem] font-medium transition ${
                zoom === 100
                  ? "bg-ide-hover text-ide-ink"
                  : "text-ide-muted hover:bg-ide-hover hover:text-ide-ink"
              }`}
              onClick={() => setZoom(100)}
            >
              {zoom === "fit" ? "Fit" : `${zoom}%`}
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom !== "fit" && zoom >= 200}
              className="grid h-6 w-6 place-items-center rounded-sm text-sm text-ide-muted transition hover:bg-ide-hover hover:text-ide-ink disabled:opacity-35"
              onClick={() => bumpZoom(10)}
            >
              +
            </button>
            <button
              type="button"
              className={`min-h-6 rounded-sm px-1.5 font-mono text-[0.62rem] font-medium transition ${
                zoom === "fit"
                  ? "bg-ide-hover text-ide-ink"
                  : "text-ide-muted hover:bg-ide-hover hover:text-ide-ink"
              }`}
              onClick={() => setZoom("fit")}
            >
              Fit
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {proposal ? (
          <div
            className="shrink-0 border-b border-ide-border bg-ide-raised px-2.5 py-1.5 font-mono text-[0.72rem] text-ide-ink sm:px-3"
            data-testid="preview-proposal-banner"
          >
            Showing proposed edit
            <span className="text-ide-muted">
              {" "}
              · {proposal.scope === "selection" ? "selection" : "document"} · “
              {proposal.prompt.length > 72
                ? `${proposal.prompt.slice(0, 71)}…`
                : proposal.prompt}
              ”
            </span>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 p-2 sm:p-2.5">
          <div className="h-full min-h-0">
            <PDFPreview
              pdfBase64={pdfBase64}
              pageCount={pageCount}
              ghostActive={ghostActive}
              compiling={compiling}
              zoom={zoom}
              onLocateInSource={onLocateInSourceFromPdf}
            />
          </div>
        </div>
        {heatmapOn && heatmapReady ? (
          <div className="max-h-[28vh] shrink-0 overflow-auto border-t border-ide-border bg-ide-panel px-3 py-2 sm:px-4">
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
      className="relative flex h-full min-h-0 flex-col bg-ide-bg"
      data-testid="vibe-harness"
      data-token-used={tokensUsed}
    >
      {(busy || compiling) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
          data-testid="vermilion-loader"
        >
          <div className="h-full w-full origin-left animate-pulse bg-ide-accent" />
        </div>
      )}

      <div
        className="flex shrink-0 border-b border-ide-border lg:hidden"
        role="tablist"
        aria-label="Editor panes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "edit"}
          data-testid="mobile-pane-edit"
          onClick={() => setMobilePane("edit")}
          className={`flex-1 px-3 py-2 text-center text-sm font-medium transition ${
            mobilePane === "edit"
              ? "border-b-2 border-ide-accent text-ide-ink"
              : "text-ide-muted"
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
          className={`flex-1 px-3 py-2 text-center text-sm font-medium transition ${
            mobilePane === "preview"
              ? "border-b-2 border-ide-accent text-ide-ink"
              : "text-ide-muted"
          }`}
        >
          Preview
          {pageCount != null ? (
            <span className="ml-1 text-[0.7rem] font-normal text-ide-faint">
              {pageCount}p
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <SplitPane
            storageKey="resumate_editor_split_pct"
            defaultPercent={48}
            minPercent={18}
            maxPercent={82}
            resizeLabel="Resize source and preview"
            mobileShow={mobilePane === "preview" ? "secondary" : "primary"}
            primary={sourcePane}
            secondary={previewPane}
          />
        </div>
        <BottomDock
          defaultHeight={narrow ? 108 : 128}
          minHeight={72}
          maxHeight={narrow ? 240 : 380}
          preferHeight={
            narrow
              ? prompt.length > 280
                ? 180
                : 108
              : prompt.length > 900
                ? 260
                : prompt.length > 280
                  ? 200
                  : prompt.length > 80
                    ? 160
                    : 128
          }
        >
          <AiComposerDock
            prompt={prompt}
            promptRef={promptRef}
            busy={busy}
            compiling={compiling}
            lastPrompt={lastPrompt}
            reply={reply}
            review={review}
            compileError={compileError}
            compileErrorLine={compileErrorLine}
            statusLines={statusLines}
            promptIsReview={promptIsReview}
            scope={
              selection?.text.trim()
                ? {
                    kind: "selection",
                    lineCount: selection.text.split("\n").length,
                    preview: selection.text,
                  }
                : { kind: "document" }
            }
            proposal={
              proposal
                ? {
                    prompt: proposal.prompt,
                    reply: proposal.reply,
                    scope: proposal.scope,
                    diff: proposal.diff,
                  }
                : null
            }
            versionIndex={versions.index}
            versionTotal={versions.stack.length}
            onPromptChange={setPrompt}
            onPromptKeyDown={onPromptKeyDown}
            onPickRecipe={(recipePrompt, recipeId) => {
              const recipe = getPromptRecipe(recipeId);
              if (recipe?.scope === "document" && selection?.text.trim()) {
                setSelection(null);
                toast.message("This action uses the whole resume");
              }
              setPrompt(recipePrompt);
              promptRef.current?.focus();
            }}
            onRun={() => runVibeEdit()}
            onStop={stopVibeEdit}
            onRegenerate={() =>
              runVibeEdit({
                prompt: lastPrompt ?? "",
                clearPrompt: false,
              })
            }
            onClearScope={() => {
              setSelection(null);
              setSelectionClearToken((token) => token + 1);
            }}
            onKeepProposal={keepProposal}
            onDiscardProposal={discardProposal}
            onDismissCompileError={() => {
              setCompileError(null);
              setCompileErrorLine(null);
            }}
            onFixCompile={() => {
              if (!compileError || proposal) return;
              runVibeEdit({
                prompt: COMPILE_FIX_PROMPT,
                compilerError: compileError,
                clearPrompt: false,
              });
            }}
            onJumpToCompileLine={(line) => {
              setJumpToLine(line);
              setMobilePane("edit");
            }}
            onVersionPrev={() => restoreVersion(versions.index - 1)}
            onVersionNext={() => restoreVersion(versions.index + 1)}
          />
        </BottomDock>
      </div>

      <QuotaModal
        open={quotaOpen}
        title={quotaTitle}
        body={quotaBody}
        latex={latex}
        filename={`${docTitle.replace(/\s+/g, "-").toLowerCase() || "resume"}.tex`}
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

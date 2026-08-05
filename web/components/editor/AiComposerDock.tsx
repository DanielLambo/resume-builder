"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { CompileErrorBanner } from "@/components/editor/CompileErrorBanner";
import { PromptRecipes } from "@/components/editor/PromptRecipes";
import { ResumeReviewPanel } from "@/components/editor/ResumeReviewPanel";
import { StatusLog } from "@/components/editor/StatusLog";
import { VersionStepper } from "@/components/editor/VersionStepper";
import type { LatexDiffSummary } from "@/lib/ai/latex-diff";
import type { ResumeReview } from "@/lib/resume-review";

export type ComposerScope = {
  kind: "selection" | "document";
  lineCount?: number;
  preview?: string;
};

export type ComposerProposal = {
  prompt: string;
  reply: string;
  scope: ComposerScope["kind"];
  diff: LatexDiffSummary;
};

type AiComposerDockProps = {
  prompt: string;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  busy: boolean;
  compiling: boolean;
  lastPrompt: string | null;
  reply: string | null;
  review: ResumeReview | null;
  compileError: string | null;
  statusLines: string[];
  promptIsReview: boolean;
  scope: ComposerScope;
  proposal: ComposerProposal | null;
  versionIndex: number;
  versionTotal: number;
  onPromptChange: (value: string) => void;
  onPromptKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPickRecipe: (recipePrompt: string, recipeId: string) => void;
  onRun: () => void;
  onStop: () => void;
  onRegenerate: () => void;
  onClearScope: () => void;
  onKeepProposal: () => void;
  onDiscardProposal: () => void;
  onDismissCompileError: () => void;
  onFixCompile: () => void;
  onVersionPrev: () => void;
  onVersionNext: () => void;
};

/**
 * Slim AI bar under the split — recipes + one input row.
 * Source/preview keep the viewport; this should stay ~1–2 short rows.
 */
export function AiComposerDock({
  prompt,
  promptRef,
  busy,
  compiling,
  lastPrompt,
  reply,
  review,
  compileError,
  statusLines,
  promptIsReview,
  scope,
  proposal,
  versionIndex,
  versionTotal,
  onPromptChange,
  onPromptKeyDown,
  onPickRecipe,
  onRun,
  onStop,
  onRegenerate,
  onClearScope,
  onKeepProposal,
  onDiscardProposal,
  onDismissCompileError,
  onFixCompile,
  onVersionPrev,
  onVersionNext,
}: AiComposerDockProps) {
  const canSubmit = Boolean(prompt.trim()) && !busy && !proposal;
  const selectionScoped = scope.kind === "selection";

  return (
    <section
      className="shrink-0 border-t border-studio-border bg-studio-bg pb-[max(0.4rem,env(safe-area-inset-bottom))]"
      data-testid="ai-composer-dock"
      aria-label="AI editor"
    >
      <div className="flex items-center gap-2 px-3 pt-1.5 sm:px-4">
        <span className="inline-flex h-5 shrink-0 items-center rounded-sm bg-studio-vermilion px-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-white">
          AI
        </span>
        <ScopeChip scope={scope} disabled={busy || Boolean(proposal)} onClear={onClearScope} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <StatusLog lines={statusLines} active={busy} />
          {versionTotal > 1 ? (
            <VersionStepper
              index={versionIndex}
              total={versionTotal}
              disabled={busy || compiling || Boolean(proposal)}
              onPrev={onVersionPrev}
              onNext={onVersionNext}
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5 px-3 py-1.5 sm:px-4">
        {proposal ? (
          <ProposalCard
            proposal={proposal}
            onKeep={onKeepProposal}
            onDiscard={onDiscardProposal}
          />
        ) : (
          <FeedbackSlot review={review} reply={reply} />
        )}
        {compileError ? (
          <CompileErrorBanner
            error={compileError}
            pending={busy}
            onDismiss={onDismissCompileError}
            onFix={onFixCompile}
          />
        ) : null}
        {!proposal ? (
          <PromptRecipes disabled={busy} onPick={onPickRecipe} />
        ) : null}
        {!proposal ? (
          <div className="flex items-end gap-2 rounded-lg border border-studio-border bg-studio-paper focus-within:border-amber-500/40">
            <textarea
              ref={promptRef}
              data-testid="vibe-prompt"
              className="min-h-[2.25rem] max-h-24 w-full resize-y bg-transparent px-2.5 py-2 text-sm leading-snug text-studio-ink outline-none placeholder:text-studio-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
              rows={1}
              placeholder={
                selectionScoped
                  ? "Change the highlight…"
                  : canSubmit
                    ? "Describe an edit…"
                    : "Describe an edit to enable Apply"
              }
              value={prompt}
              disabled={busy}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={onPromptKeyDown}
            />
            <div className="flex shrink-0 items-center gap-1.5 pb-1.5 pr-1.5">
              {busy ? (
                <button
                  type="button"
                  data-testid="vibe-stop"
                  onClick={onStop}
                  className="min-h-8 rounded-md border border-studio-border px-2.5 text-xs font-medium text-studio-ink"
                >
                  Stop
                </button>
              ) : null}
              {!busy && lastPrompt ? (
                <button
                  type="button"
                  data-testid="vibe-regenerate"
                  onClick={onRegenerate}
                  className="min-h-8 rounded-md border border-studio-border px-2.5 text-xs font-medium text-studio-ink"
                >
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                data-testid="vibe-submit"
                data-selection-submit={selectionScoped ? "true" : "false"}
                disabled={!canSubmit}
                onClick={onRun}
                title={
                  canSubmit
                    ? selectionScoped
                      ? "Apply to highlighted text (⌘/Ctrl+Enter)"
                      : promptIsReview
                        ? "Review only (⌘/Ctrl+Enter)"
                        : "Apply to whole resume (⌘/Ctrl+Enter)"
                    : "Type an edit first"
                }
                className="min-h-8 rounded-md bg-studio-vermilion px-3 text-xs font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-40"
              >
                {busy
                  ? promptIsReview
                    ? "…"
                    : "…"
                  : promptIsReview
                    ? "Review"
                    : "Apply"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ScopeChip({
  scope,
  disabled,
  onClear,
}: {
  scope: ComposerScope;
  disabled: boolean;
  onClear: () => void;
}) {
  if (scope.kind === "selection") {
    return (
      <div
        className="flex min-w-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[0.68rem] text-amber-950 ring-1 ring-amber-200"
        data-testid="ai-scope-chip"
      >
        <span className="truncate">
          Highlight
          {scope.lineCount
            ? ` · ${scope.lineCount} line${scope.lineCount === 1 ? "" : "s"}`
            : ""}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="shrink-0 text-[0.62rem] font-medium text-amber-800 hover:text-amber-950 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <p
      className="truncate text-[0.68rem] text-studio-muted"
      data-testid="ai-scope-chip"
    >
      Whole resume
    </p>
  );
}

function ProposalCard({
  proposal,
  onKeep,
  onDiscard,
}: {
  proposal: ComposerProposal;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-2"
      data-testid="ai-proposal"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-amber-900">
            Preview · not saved
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-studio-ink">
            {proposal.reply}
          </p>
          <p className="mt-0.5 text-[0.68rem] text-studio-muted">
            {proposal.scope === "selection" ? "Highlight only" : "Whole resume"}
            {proposal.diff.changedLineCount
              ? ` · ${proposal.diff.changedLineCount} lines`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            data-testid="ai-proposal-keep"
            onClick={onKeep}
            className="min-h-8 rounded-md bg-studio-vermilion px-2.5 text-xs font-semibold text-white hover:bg-studio-vermilion-hover"
          >
            Keep
          </button>
          <button
            type="button"
            data-testid="ai-proposal-discard"
            onClick={onDiscard}
            className="min-h-8 rounded-md border border-studio-border bg-studio-paper px-2.5 text-xs font-medium text-studio-ink"
          >
            Discard
          </button>
        </div>
      </div>
      {proposal.diff.hunks.length ? (
        <ul className="mt-1.5 max-h-16 space-y-0.5 overflow-auto font-mono text-[0.65rem] leading-relaxed">
          {proposal.diff.hunks.slice(0, 3).map((hunk, index) => (
            <li key={`${index}-${hunk.before}-${hunk.after}`}>
              {hunk.before ? (
                <p className="truncate text-red-800/90 line-through decoration-red-800/40">
                  − {hunk.before}
                </p>
              ) : null}
              {hunk.after ? (
                <p className="truncate text-emerald-800">+ {hunk.after}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FeedbackSlot({
  review,
  reply,
}: {
  review: ResumeReview | null;
  reply: string | null;
}): ReactNode {
  if (review) {
    return (
      <div className="max-h-28 overflow-auto rounded-md border border-studio-border bg-studio-paper p-2.5">
        <ResumeReviewPanel review={review} />
      </div>
    );
  }
  if (reply) {
    return (
      <p className="line-clamp-1 text-[0.78rem] leading-snug text-studio-ink">
        {reply}
      </p>
    );
  }
  return null;
}

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
      className="shrink-0 border-t border-studio-border bg-[#f7f1e6] pb-[max(0.65rem,env(safe-area-inset-bottom))]"
      data-testid="ai-composer-dock"
      aria-label="AI editor"
    >
      <div className="flex items-center justify-between gap-3 border-b border-studio-border/80 px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-sm bg-studio-vermilion px-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-white">
            AI
          </span>
          <ScopeChip scope={scope} disabled={busy || Boolean(proposal)} onClear={onClearScope} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
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

      <div className="space-y-2 px-3 py-2.5 sm:px-4">
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
        <PromptRecipes disabled={busy || Boolean(proposal)} onPick={onPickRecipe} />
        <div className="rounded-xl border border-studio-border bg-studio-paper shadow-[0_-1px_0_rgba(31,27,22,0.04)] focus-within:border-amber-500/45">
          <textarea
            ref={promptRef}
            data-testid="vibe-prompt"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-studio-ink outline-none placeholder:text-studio-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
            rows={2}
            placeholder={
              selectionScoped
                ? "What should change in the highlighted text?"
                : "What should change on this resume?"
            }
            value={prompt}
            disabled={busy || Boolean(proposal)}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={onPromptKeyDown}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-studio-border/80 px-3 py-2">
            <p className="text-[0.7rem] text-studio-muted">
              {proposal
                ? "Preview the PDF on the right, then keep or discard."
                : canSubmit
                  ? selectionScoped
                    ? "⌘/Ctrl + Enter · applies to highlighted text only"
                    : promptIsReview
                      ? "⌘/Ctrl + Enter · review only, no source change"
                      : "⌘/Ctrl + Enter · applies to the whole resume"
                  : "Type what you want to change to enable Apply"}
            </p>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
              {busy ? (
                <button
                  type="button"
                  data-testid="vibe-stop"
                  onClick={onStop}
                  className="min-h-9 rounded-md border border-studio-border bg-studio-paper px-3 py-2 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30"
                >
                  Stop
                </button>
              ) : null}
              {!busy && lastPrompt && !proposal ? (
                <button
                  type="button"
                  data-testid="vibe-regenerate"
                  onClick={onRegenerate}
                  className="min-h-9 rounded-md border border-studio-border bg-studio-paper px-3 py-2 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30"
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
                className="min-h-9 flex-1 rounded-lg bg-studio-vermilion px-3 py-2 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-45 sm:flex-none sm:min-w-[7.5rem]"
              >
                {busy
                  ? promptIsReview
                    ? "Reviewing…"
                    : "Working…"
                  : promptIsReview
                    ? "Review"
                    : "Apply"}
              </button>
            </div>
          </div>
        </div>
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
        className="flex min-w-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[0.72rem] text-amber-950 ring-1 ring-amber-200"
        data-testid="ai-scope-chip"
      >
        <span className="truncate">
          Highlighted text
          {scope.lineCount ? ` · ${scope.lineCount} line${scope.lineCount === 1 ? "" : "s"}` : ""}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="shrink-0 text-[0.65rem] font-medium text-amber-800 hover:text-amber-950 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <p className="truncate text-[0.72rem] text-studio-muted" data-testid="ai-scope-chip">
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
      className="rounded-lg border border-amber-300 bg-amber-50/80 p-3"
      data-testid="ai-proposal"
    >
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-amber-900">
        Preview · not saved yet
      </p>
      <p className="mt-1 text-sm leading-relaxed text-studio-ink">{proposal.reply}</p>
      <p className="mt-1 text-[0.72rem] text-studio-muted">
        {proposal.scope === "selection" ? "Highlighted text only" : "Whole resume"}
        {proposal.diff.changedLineCount
          ? ` · ${proposal.diff.changedLineCount} line${proposal.diff.changedLineCount === 1 ? "" : "s"} changed`
          : ""}
      </p>
      {proposal.diff.hunks.length ? (
        <ul className="mt-2 max-h-28 space-y-1 overflow-auto font-mono text-[0.68rem] leading-relaxed">
          {proposal.diff.hunks.map((hunk, index) => (
            <li key={`${index}-${hunk.before}-${hunk.after}`}>
              {hunk.before ? (
                <p className="text-red-800/90 line-through decoration-red-800/40">
                  − {hunk.before}
                </p>
              ) : null}
              {hunk.after ? <p className="text-emerald-800">+ {hunk.after}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="ai-proposal-keep"
          onClick={onKeep}
          className="min-h-9 rounded-lg bg-studio-vermilion px-3 text-sm font-semibold text-white hover:bg-studio-vermilion-hover"
        >
          Keep changes
        </button>
        <button
          type="button"
          data-testid="ai-proposal-discard"
          onClick={onDiscard}
          className="min-h-9 rounded-md border border-studio-border bg-studio-paper px-3 text-sm font-medium text-studio-ink"
        >
          Discard
        </button>
      </div>
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
      <div className="max-h-40 overflow-auto rounded-lg border border-studio-border bg-studio-paper p-3">
        <ResumeReviewPanel review={review} />
      </div>
    );
  }
  if (reply) {
    return (
      <p className="line-clamp-2 text-sm leading-relaxed text-studio-ink">{reply}</p>
    );
  }
  return null;
}

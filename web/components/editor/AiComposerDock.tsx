"use client";

import {
  useLayoutEffect,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { CompileErrorBanner } from "@/components/editor/CompileErrorBanner";
import { PromptRecipes } from "@/components/editor/PromptRecipes";
import { ResumeReviewPanel } from "@/components/editor/ResumeReviewPanel";
import { StatusLog } from "@/components/editor/StatusLog";
import { VersionStepper } from "@/components/editor/VersionStepper";
import type { LatexDiffSummary } from "@/lib/ai/latex-diff";
import type { ResumeReview } from "@/lib/resume-review";

const PROMPT_SOFT_MAX = 4000;
const TEXTAREA_MAX_PX = 168;

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
  compileErrorLine?: number | null;
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
  onJumpToCompileLine?: (line: number) => void;
  onVersionPrev: () => void;
  onVersionNext: () => void;
};

/** Compact bottom AI bar — expands modestly for long pasted prompts. */
export function AiComposerDock({
  prompt,
  promptRef,
  busy,
  compiling,
  lastPrompt,
  reply,
  review,
  compileError,
  compileErrorLine = null,
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
  onJumpToCompileLine,
  onVersionPrev,
  onVersionNext,
}: AiComposerDockProps) {
  const canSubmit = Boolean(prompt.trim()) && !busy && !proposal;
  const selectionScoped = scope.kind === "selection";
  const promptLen = prompt.length;
  const nearLimit = promptLen >= PROMPT_SOFT_MAX * 0.9;

  useLayoutEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [prompt, promptRef]);

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden border-t border-ide-border bg-ide-raised pb-[max(0.25rem,env(safe-area-inset-bottom))]"
      data-testid="ai-composer-dock"
      aria-label="AI editor"
    >
      <div className="flex shrink-0 items-center gap-2 px-2 pt-1 sm:px-2.5">
        <span className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.1em] text-ide-faint">
          AI
        </span>
        <ScopeChip scope={scope} disabled={busy || Boolean(proposal)} onClear={onClearScope} />
        {versionTotal > 1 ? (
          <VersionStepper
            index={versionIndex}
            total={versionTotal}
            disabled={busy || compiling || Boolean(proposal)}
            onPrev={onVersionPrev}
            onNext={onVersionNext}
            variant="ide"
          />
        ) : null}
        <div className="ml-auto min-w-0">
          <StatusLog lines={statusLines} active={busy} variant="ide" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-1 sm:px-2.5">
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
            line={compileErrorLine}
            pending={busy}
            onDismiss={onDismissCompileError}
            onFix={onFixCompile}
            onJumpToLine={onJumpToCompileLine}
            variant="ide"
          />
        ) : null}
        {!proposal ? (
          <>
            <PromptRecipes disabled={busy} onPick={onPickRecipe} />
            <div className="flex min-h-0 items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <textarea
                  ref={promptRef}
                  data-testid="vibe-prompt"
                  rows={1}
                  maxLength={PROMPT_SOFT_MAX}
                  spellCheck
                  className="max-h-[10.5rem] min-h-8 w-full resize-y rounded border border-ide-border bg-ide-bg px-2 py-1.5 font-mono text-[0.78rem] leading-snug text-ide-ink outline-none placeholder:text-ide-faint focus:border-ide-faint disabled:opacity-50"
                  placeholder={
                    selectionScoped
                      ? "Edit the highlight… (paste job notes OK)"
                      : "Describe an edit… (paste long notes or a JD)"
                  }
                  value={prompt}
                  disabled={busy}
                  onChange={(event) => onPromptChange(event.target.value)}
                  onKeyDown={onPromptKeyDown}
                  onPaste={() => {
                    requestAnimationFrame(() => {
                      const el = promptRef.current;
                      if (!el) return;
                      el.style.height = "0px";
                      el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
                    });
                  }}
                />
                {promptLen > 120 ? (
                  <p
                    className={[
                      "mt-0.5 font-mono text-[0.58rem] tabular-nums",
                      nearLimit ? "text-amber-400" : "text-ide-faint",
                    ].join(" ")}
                    data-testid="prompt-char-count"
                  >
                    {promptLen.toLocaleString()}/{PROMPT_SOFT_MAX} · ⌘/Ctrl+Enter
                    to apply
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-1 pb-px">
                {busy ? (
                  <button
                    type="button"
                    data-testid="vibe-stop"
                    onClick={onStop}
                    className="min-h-8 rounded border border-ide-border px-2 text-[0.7rem] text-ide-ink hover:bg-ide-hover"
                  >
                    Stop
                  </button>
                ) : null}
                {!busy && lastPrompt ? (
                  <button
                    type="button"
                    data-testid="vibe-regenerate"
                    onClick={onRegenerate}
                    className="min-h-8 rounded border border-ide-border px-2 text-[0.7rem] text-ide-muted hover:bg-ide-hover hover:text-ide-ink"
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
                      ? "Apply (⌘/Ctrl+Enter)"
                      : "Type an edit first"
                  }
                  className="min-h-8 rounded bg-ide-accent px-3 text-[0.72rem] font-semibold text-white transition hover:bg-ide-accent-hover disabled:cursor-not-allowed disabled:bg-ide-raised disabled:text-ide-faint"
                >
                  {promptIsReview ? "Review" : "Apply"}
                </button>
              </div>
            </div>
          </>
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
        className="flex min-w-0 items-center gap-1.5 rounded-sm border border-ide-border bg-ide-raised px-1.5 py-0.5 text-[0.65rem] text-ide-ink"
        data-testid="ai-scope-chip"
      >
        <span className="truncate font-mono text-ide-muted">
          selection
          {scope.lineCount
            ? ` · ${scope.lineCount} line${scope.lineCount === 1 ? "" : "s"}`
            : ""}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="shrink-0 font-mono text-[0.6rem] text-ide-faint hover:text-ide-ink disabled:opacity-40"
        >
          clear
        </button>
      </div>
    );
  }

  return (
    <p
      className="truncate font-mono text-[0.65rem] text-ide-faint"
      data-testid="ai-scope-chip"
    >
      document
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
  const changed = proposal.diff.changedLineCount;
  return (
    <div
      className="rounded border border-ide-border bg-ide-raised px-2 py-1.5"
      data-testid="ai-proposal"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.55rem] uppercase tracking-[0.1em] text-ide-muted">
            Preview · not saved
            {changed > 0
              ? ` · ${changed} line${changed === 1 ? "" : "s"} changed`
              : ""}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[0.75rem] text-ide-ink">
            {proposal.reply}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            data-testid="ai-proposal-keep"
            onClick={onKeep}
            className="min-h-7 rounded bg-ide-accent px-2 text-[0.7rem] font-semibold text-white hover:bg-ide-accent-hover"
          >
            Keep
          </button>
          <button
            type="button"
            data-testid="ai-proposal-discard"
            onClick={onDiscard}
            className="min-h-7 rounded border border-ide-border px-2 text-[0.7rem] text-ide-muted hover:bg-ide-hover hover:text-ide-ink"
          >
            Discard
          </button>
        </div>
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
      <div className="max-h-20 overflow-auto rounded border border-ide-border bg-ide-bg p-2 text-ide-ink [&_*]:text-inherit">
        <ResumeReviewPanel review={review} />
      </div>
    );
  }
  if (reply) {
    return (
      <p className="line-clamp-1 text-[0.72rem] text-ide-muted">{reply}</p>
    );
  }
  return null;
}

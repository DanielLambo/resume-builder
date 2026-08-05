"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { CompileErrorBanner } from "@/components/editor/CompileErrorBanner";
import { PromptRecipes } from "@/components/editor/PromptRecipes";
import { ResumeReviewPanel } from "@/components/editor/ResumeReviewPanel";
import { StatusLog } from "@/components/editor/StatusLog";
import { VersionStepper } from "@/components/editor/VersionStepper";
import type { ResumeReview } from "@/lib/resume-review";

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
  versionIndex: number;
  versionTotal: number;
  onPromptChange: (value: string) => void;
  onPromptKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPickRecipe: (recipePrompt: string, recipeId: string) => void;
  onRun: () => void;
  onStop: () => void;
  onRegenerate: () => void;
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
  versionIndex,
  versionTotal,
  onPromptChange,
  onPromptKeyDown,
  onPickRecipe,
  onRun,
  onStop,
  onRegenerate,
  onDismissCompileError,
  onFixCompile,
  onVersionPrev,
  onVersionNext,
}: AiComposerDockProps) {
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
          <p className="truncate text-[0.72rem] text-studio-muted">
            Edit in plain English. Source stays on the left.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusLog lines={statusLines} active={busy} />
          {versionTotal > 1 ? (
            <VersionStepper
              index={versionIndex}
              total={versionTotal}
              disabled={busy || compiling}
              onPrev={onVersionPrev}
              onNext={onVersionNext}
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-2 px-3 py-2.5 sm:px-4">
        <FeedbackSlot review={review} reply={reply} />
        {compileError ? (
          <CompileErrorBanner
            error={compileError}
            pending={busy}
            onDismiss={onDismissCompileError}
            onFix={onFixCompile}
          />
        ) : null}
        <PromptRecipes disabled={busy} onPick={onPickRecipe} />
        <div className="rounded-xl border border-studio-border bg-studio-paper shadow-[0_-1px_0_rgba(31,27,22,0.04)] focus-within:border-amber-500/45">
          <textarea
            ref={promptRef}
            data-testid="vibe-prompt"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-studio-ink outline-none placeholder:text-studio-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
            rows={2}
            placeholder="Ask for an edit — e.g. add an internship at Rippling, or tighten the first bullet"
            value={prompt}
            disabled={busy}
            onChange={(event) => onPromptChange(event.target.value)}
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
                  onClick={onStop}
                  className="min-h-9 rounded-md border border-studio-border bg-studio-paper px-3 py-2 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30"
                >
                  Stop
                </button>
              ) : null}
              {!busy && lastPrompt ? (
                <button
                  type="button"
                  data-testid="vibe-regenerate"
                  onClick={onRegenerate}
                  className="min-h-9 rounded-md border border-studio-border bg-studio-paper px-3 py-2 text-sm font-medium text-studio-ink transition hover:border-studio-ink/30"
                >
                  Regenerate
                </button>
              ) : null}
              <button
                type="button"
                data-testid="vibe-submit"
                disabled={busy || !prompt.trim()}
                onClick={onRun}
                className="min-h-9 flex-1 rounded-lg bg-studio-vermilion px-3 py-2 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-45 sm:flex-none sm:min-w-[7.5rem]"
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
      </div>
    </section>
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
      <p className="line-clamp-2 text-sm leading-relaxed text-studio-ink">
        {reply}
      </p>
    );
  }
  return null;
}

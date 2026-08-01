"use client";

type VersionStepperProps = {
  index: number;
  total: number;
  disabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function VersionStepper({
  index,
  total,
  disabled,
  onPrev,
  onNext,
}: VersionStepperProps) {
  if (total <= 1) return null;

  return (
    <div
      className="flex items-center gap-2 font-mono text-[0.7rem] text-studio-muted"
      data-testid="version-stepper"
    >
      <button
        type="button"
        data-testid="version-prev"
        disabled={disabled || index <= 0}
        onClick={onPrev}
        className="min-h-8 border border-studio-border bg-studio-paper px-2 py-1 transition hover:text-studio-ink disabled:opacity-40"
      >
        ← Prev
      </button>
      <span data-testid="version-label">
        {index + 1}/{total}
      </span>
      <button
        type="button"
        data-testid="version-next"
        disabled={disabled || index >= total - 1}
        onClick={onNext}
        className="min-h-8 border border-studio-border bg-studio-paper px-2 py-1 transition hover:text-studio-ink disabled:opacity-40"
      >
        Next →
      </button>
    </div>
  );
}

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
      className="inline-flex items-center gap-1.5 border border-studio-border bg-studio-paper px-1.5 py-0.5 font-mono text-[0.7rem] text-studio-muted"
      data-testid="version-stepper"
      title="Session history"
    >
      <button
        type="button"
        data-testid="version-prev"
        aria-label="Previous version"
        disabled={disabled || index <= 0}
        onClick={onPrev}
        className="min-h-7 px-1.5 transition hover:text-studio-ink disabled:opacity-40"
      >
        ←
      </button>
      <span data-testid="version-label" className="min-w-[4.5rem] text-center">
        {index + 1}/{total}
      </span>
      <button
        type="button"
        data-testid="version-next"
        aria-label="Next version"
        disabled={disabled || index >= total - 1}
        onClick={onNext}
        className="min-h-7 px-1.5 transition hover:text-studio-ink disabled:opacity-40"
      >
        →
      </button>
    </div>
  );
}

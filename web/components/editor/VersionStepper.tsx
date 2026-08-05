"use client";

type VersionStepperProps = {
  index: number;
  total: number;
  disabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
  variant?: "default" | "ide";
};

export function VersionStepper({
  index,
  total,
  disabled,
  onPrev,
  onNext,
  variant = "default",
}: VersionStepperProps) {
  if (total <= 1) return null;
  const ide = variant === "ide";

  return (
    <div
      className={[
        "flex items-center gap-1.5 font-mono text-[0.65rem]",
        ide ? "text-ide-muted" : "text-studio-muted",
      ].join(" ")}
      data-testid="version-stepper"
    >
      <button
        type="button"
        data-testid="version-prev"
        disabled={disabled || index <= 0}
        onClick={onPrev}
        className={
          ide
            ? "min-h-6 rounded-sm border border-ide-border px-1.5 py-0.5 transition hover:bg-ide-hover hover:text-ide-ink disabled:opacity-40"
            : "min-h-8 border border-studio-border bg-studio-paper px-2 py-1 transition hover:text-studio-ink disabled:opacity-40"
        }
      >
        ←
      </button>
      <span data-testid="version-label">
        {index + 1}/{total}
      </span>
      <button
        type="button"
        data-testid="version-next"
        disabled={disabled || index >= total - 1}
        onClick={onNext}
        className={
          ide
            ? "min-h-6 rounded-sm border border-ide-border px-1.5 py-0.5 transition hover:bg-ide-hover hover:text-ide-ink disabled:opacity-40"
            : "min-h-8 border border-studio-border bg-studio-paper px-2 py-1 transition hover:text-studio-ink disabled:opacity-40"
        }
      >
        →
      </button>
    </div>
  );
}

"use client";

type CompileErrorBannerProps = {
  error: string;
  pending?: boolean;
  onFix: () => void;
  onDismiss: () => void;
};

export function CompileErrorBanner({
  error,
  pending,
  onFix,
  onDismiss,
}: CompileErrorBannerProps) {
  return (
    <div
      className="border border-studio-vermilion/30 bg-studio-paper px-3 py-2.5 text-sm"
      data-testid="compile-error-banner"
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-studio-vermilion">
            PDF compile failed
          </p>
          <p className="mt-1 text-xs leading-relaxed text-studio-muted">{error}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs text-studio-muted hover:text-studio-ink"
          aria-label="Dismiss compile error"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        data-testid="compile-fix-ai"
        disabled={pending}
        onClick={onFix}
        className="mt-2 min-h-9 bg-studio-vermilion px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-50"
      >
        {pending ? "Fixing…" : "Fix with AI"}
      </button>
    </div>
  );
}

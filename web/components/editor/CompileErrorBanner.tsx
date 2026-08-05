"use client";

type CompileErrorBannerProps = {
  error: string;
  pending?: boolean;
  onFix: () => void;
  onDismiss: () => void;
  variant?: "default" | "ide";
};

export function CompileErrorBanner({
  error,
  pending,
  onFix,
  onDismiss,
  variant = "default",
}: CompileErrorBannerProps) {
  const ide = variant === "ide";

  return (
    <div
      className={
        ide
          ? "border border-red-500/40 bg-ide-raised px-2.5 py-2 text-sm"
          : "border border-studio-vermilion/30 bg-studio-paper px-3 py-2.5 text-sm"
      }
      data-testid="compile-error-banner"
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={[
              "text-xs font-semibold",
              ide ? "text-red-400" : "text-studio-vermilion",
            ].join(" ")}
          >
            PDF compile failed
          </p>
          <p
            className={[
              "mt-1 text-xs leading-relaxed",
              ide ? "text-ide-muted" : "text-studio-muted",
            ].join(" ")}
          >
            {error}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={
            ide
              ? "shrink-0 text-xs text-ide-faint hover:text-ide-ink"
              : "shrink-0 text-xs text-studio-muted hover:text-studio-ink"
          }
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
        className={
          ide
            ? "mt-2 min-h-8 rounded border border-ide-border px-3 py-1.5 text-xs font-medium text-ide-ink transition hover:bg-ide-hover disabled:opacity-50"
            : "mt-2 min-h-9 bg-studio-vermilion px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-50"
        }
      >
        {pending ? "Fixing…" : "Fix with AI"}
      </button>
    </div>
  );
}

"use client";

type StatusLogProps = {
  lines: string[];
  active?: boolean;
  variant?: "default" | "ide";
};

/** Compact progress trail — only renders when there is something to show. */
export function StatusLog({ lines, active, variant = "default" }: StatusLogProps) {
  if (!lines.length && !active) return null;

  const latest = lines[lines.length - 1];
  const ide = variant === "ide";

  return (
    <div
      className={[
        "max-w-[14rem] font-mono text-[0.65rem] leading-relaxed sm:max-w-xs",
        ide ? "text-ide-muted" : "text-studio-muted",
      ].join(" ")}
      data-testid="status-log"
      aria-live="polite"
    >
      <ul className="sr-only">
        {lines.map((line, i) => (
          <li key={`${i}-${line}`}>{line}</li>
        ))}
      </ul>
      {latest ? <p className="truncate">{latest.replace(/^\[\d+\/\d+\]\s*/, "")}</p> : null}
      {active ? (
        <p
          className={[
            "mt-0.5 animate-pulse",
            ide ? "text-ide-accent" : "text-studio-vermilion",
          ].join(" ")}
        >
          Working…
        </p>
      ) : null}
    </div>
  );
}

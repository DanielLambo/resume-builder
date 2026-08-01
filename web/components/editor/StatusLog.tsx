"use client";

type StatusLogProps = {
  lines: string[];
  active?: boolean;
};

/** Compact progress trail — only renders when there is something to show. */
export function StatusLog({ lines, active }: StatusLogProps) {
  if (!lines.length && !active) return null;

  const latest = lines[lines.length - 1];

  return (
    <div
      className="mt-2 font-mono text-[0.7rem] leading-relaxed text-studio-muted"
      data-testid="status-log"
      aria-live="polite"
    >
      {/* Keep full history for tests / a11y; show the latest line visually. */}
      <ul className="sr-only">
        {lines.map((line, i) => (
          <li key={`${i}-${line}`}>{line}</li>
        ))}
      </ul>
      {latest ? <p className="truncate">{latest.replace(/^\[\d+\/\d+\]\s*/, "")}</p> : null}
      {active ? (
        <p className="mt-0.5 animate-pulse text-studio-vermilion">Working…</p>
      ) : null}
    </div>
  );
}

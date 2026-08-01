"use client";

type StatusLogProps = {
  lines: string[];
  active?: boolean;
};

export function StatusLog({ lines, active }: StatusLogProps) {
  if (!lines.length && !active) return null;

  return (
    <div
      className="mt-3 max-h-24 overflow-auto border border-studio-border bg-studio-paper px-3 py-2 sm:max-h-36"
      data-testid="status-log"
      aria-live="polite"
    >
      <p className="mb-1 font-mono text-[0.6rem] uppercase tracking-wide text-studio-muted">
        Engine log
      </p>
      <ul className="space-y-1 font-mono text-[0.7rem] leading-relaxed text-studio-ink">
        {lines.map((line, i) => (
          <li key={`${i}-${line}`}>
            <span className="text-studio-muted">$</span> {line}
          </li>
        ))}
        {active ? (
          <li className="animate-pulse text-studio-vermilion">▌ awaiting engine…</li>
        ) : null}
      </ul>
    </div>
  );
}

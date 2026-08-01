/**
 * Honest data-handling copy for the Resumate cloud product.
 * Keep in sync with web/lib/compile-latex.ts egress rules.
 */
export function PrivacyNotice({ className = "" }: { className?: string }) {
  return (
    <aside
      className={`border border-studio-border bg-studio-paper/80 p-4 text-sm leading-relaxed text-studio-muted ${className}`}
      data-testid="privacy-notice"
    >
      <p className="text-xs font-semibold tracking-wide text-studio-ink">
        How we handle your resume
      </p>
      <ul className="mt-2 list-disc space-y-1.5 pl-4">
        <li>
          Drafts sync to your private account over an encrypted connection. Only
          you can read them.
        </li>
        <li>
          AI edits and reviews send your prompt and resume text to our AI
          provider so they can suggest honest changes.
        </li>
        <li>
          PDF preview compiles on our private typesetting host when configured.
          Demo setups may use a third-party compiler — we disclose that before
          enabling it.
        </li>
        <li>
          Daily AI usage counters (not resume text) are stored to enforce fair
          limits.
        </li>
      </ul>
    </aside>
  );
}

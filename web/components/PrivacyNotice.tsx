/**
 * Honest data-handling copy for the Typesetter (Next.js) cloud product.
 * Keep in sync with web/lib/compile-latex.ts egress rules.
 */
export function PrivacyNotice({ className = "" }: { className?: string }) {
  return (
    <aside
      className={`border border-studio-border bg-studio-paper/80 p-3 font-mono text-[0.7rem] leading-relaxed text-studio-muted ${className}`}
      data-testid="privacy-notice"
    >
      <p className="font-semibold tracking-wide text-studio-ink">DATA HANDLING</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>
          Resume drafts sync to your private Supabase account (encrypted in transit).
          Only you can read them (row-level security).
        </li>
        <li>
          Vibe edits send your prompt and resume text to Groq to apply changes.
          PDF import sends extracted resume text to Groq the same way.
        </li>
        <li>
          PDF compile uses your private TeX host when{" "}
          <code className="text-studio-ink">LATEX_COMPILE_URL</code> is set.
          If that is unset and{" "}
          <code className="text-studio-ink">ALLOW_LATEX_ONLINE=1</code> is
          enabled, compile may send resume text to latexonline.cc (third party).
        </li>
        <li>Daily AI usage counters (not resume text) are stored in Upstash Redis.</li>
      </ul>
    </aside>
  );
}

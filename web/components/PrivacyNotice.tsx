/**
 * Honest data-handling copy — collapsible so it doesn’t dominate the page.
 */
export function PrivacyNotice({ className = "" }: { className?: string }) {
  return (
    <details
      className={`group rounded-xl border border-studio-border bg-studio-paper/80 px-3 py-2.5 text-sm text-studio-muted ${className}`}
      data-testid="privacy-notice"
    >
      <summary className="cursor-pointer list-none font-medium text-studio-ink marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          How we handle your data
          <span className="text-xs text-studio-muted group-open:hidden">Show</span>
          <span className="hidden text-xs text-studio-muted group-open:inline">Hide</span>
        </span>
      </summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[0.8rem] leading-relaxed">
        <li>Drafts stay in your private account. Only you can open them.</li>
        <li>
          AI edits and PDF import send resume text to your configured AI
          provider (OpenAI-compatible) to rewrite or convert. That uses your
          daily token quota.
        </li>
        <li>
          PDFs are compiled on the TeX host you configure. Operators of this
          deployment do not sell your resume content.
        </li>
      </ul>
    </details>
  );
}

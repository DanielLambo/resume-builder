"use client";

import type { ResumeReview } from "@/lib/resume-review";

type ResumeReviewPanelProps = {
  review: ResumeReview;
};

function severityLabel(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "High";
  if (severity === "medium") return "Med";
  return "Low";
}

function severityClass(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "text-studio-vermilion";
  if (severity === "medium") return "text-amber-700";
  return "text-studio-muted";
}

export function ResumeReviewPanel({ review }: ResumeReviewPanelProps) {
  return (
    <div
      className="space-y-5 text-sm leading-relaxed text-studio-ink"
      data-testid="resume-review"
    >
      <header className="space-y-2">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-studio-muted">
          Review
          {review.targetRole ? ` · ${review.targetRole}` : ""}
        </p>
        <div className="flex items-baseline gap-3">
          <p
            className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-studio-ink"
            data-testid="review-fit-score"
          >
            {review.fitScore}
            <span className="text-base font-normal text-studio-muted">/10</span>
          </p>
          <p className="min-w-0 flex-1 text-[0.95rem] leading-snug text-studio-ink">
            {review.reply}
          </p>
        </div>
        <p className="text-studio-muted">{review.summary}</p>
      </header>

      <section className="space-y-2.5 border-t border-studio-border pt-4">
        <h3 className="text-xs font-semibold tracking-wide text-studio-ink">
          Strengths
        </h3>
        <ul className="space-y-2.5">
          {review.strengths.map((item) => (
            <li key={item.title}>
              <p className="font-medium text-studio-ink">{item.title}</p>
              <p className="text-studio-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {review.gaps.length > 0 ? (
        <section className="space-y-2.5 border-t border-studio-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-studio-ink">Gaps</h3>
          <ul className="space-y-2.5">
            {review.gaps.map((item) => (
              <li key={item.title}>
                <p className="font-medium text-studio-ink">
                  {item.title}
                  <span
                    className={`ml-2 font-mono text-[0.65rem] font-normal uppercase tracking-wide ${severityClass(item.severity)}`}
                  >
                    {severityLabel(item.severity)}
                  </span>
                </p>
                <p className="text-studio-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.bulletAdvice.length > 0 ? (
        <section className="space-y-3 border-t border-studio-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-studio-ink">
            Bullet advice
          </h3>
          <ul className="space-y-3">
            {review.bulletAdvice.map((item) => (
              <li key={`${item.quote}-${item.issue}`} className="space-y-1">
                <p className="text-studio-ink/70">“{item.quote}”</p>
                <p className="text-studio-muted">{item.issue}</p>
                <p className="text-studio-ink">
                  <span className="text-studio-muted">Try — </span>
                  {item.suggestion}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.keywordGaps.length > 0 ? (
        <section className="space-y-1.5 border-t border-studio-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-studio-ink">
            Keyword gaps
          </h3>
          <p className="text-studio-muted">{review.keywordGaps.join(" · ")}</p>
        </section>
      ) : null}

      <section className="space-y-2 border-t border-studio-border pt-4">
        <h3 className="text-xs font-semibold tracking-wide text-studio-ink">
          Next steps
        </h3>
        <ol className="list-decimal space-y-1.5 pl-4 text-studio-ink marker:text-studio-muted">
          {review.actionItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

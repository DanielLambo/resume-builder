"use client";

import type { ResumeReview } from "@/lib/resume-review";

type ResumeReviewPanelProps = {
  review: ResumeReview;
};

function severityClass(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "text-studio-vermilion";
  if (severity === "medium") return "text-amber-700";
  return "text-studio-muted";
}

export function ResumeReviewPanel({ review }: ResumeReviewPanelProps) {
  return (
    <div
      className="space-y-4 border border-studio-border bg-studio-paper p-3 text-sm leading-relaxed text-studio-ink sm:p-4"
      data-testid="resume-review"
    >
      <header className="space-y-1">
        <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Resume review
          {review.targetRole ? ` · ${review.targetRole}` : ""}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className="font-mono text-2xl font-semibold tracking-tight text-studio-ink"
            data-testid="review-fit-score"
          >
            {review.fitScore}
            <span className="text-base font-normal text-studio-muted">/10</span>
          </p>
          <p className="min-w-0 flex-1 text-sm text-studio-ink">{review.reply}</p>
        </div>
      </header>

      <p className="text-sm text-studio-ink/90">{review.summary}</p>

      <section className="space-y-2">
        <h3 className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Strengths
        </h3>
        <ul className="space-y-2">
          {review.strengths.map((item) => (
            <li key={item.title}>
              <p className="font-medium text-studio-ink">{item.title}</p>
              <p className="text-studio-ink/80">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {review.gaps.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
            Gaps
          </h3>
          <ul className="space-y-2">
            {review.gaps.map((item) => (
              <li key={item.title}>
                <p className="font-medium text-studio-ink">
                  {item.title}{" "}
                  <span
                    className={`font-mono text-[0.65rem] uppercase ${severityClass(item.severity)}`}
                  >
                    {item.severity}
                  </span>
                </p>
                <p className="text-studio-ink/80">{item.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.bulletAdvice.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
            Bullet-level advice
          </h3>
          <ul className="space-y-3">
            {review.bulletAdvice.map((item) => (
              <li
                key={`${item.quote}-${item.issue}`}
                className="border-l-2 border-studio-border pl-3"
              >
                <p className="font-mono text-xs text-studio-muted">“{item.quote}”</p>
                <p className="mt-1 text-studio-ink/80">
                  <span className="font-medium text-studio-ink">Issue: </span>
                  {item.issue}
                </p>
                <p className="text-studio-ink/80">
                  <span className="font-medium text-studio-ink">Try: </span>
                  {item.suggestion}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.keywordGaps.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
            Keyword gaps
          </h3>
          <p className="font-mono text-xs text-studio-ink/80">
            {review.keywordGaps.join(" · ")}
          </p>
          <p className="text-xs text-studio-muted">
            Only add these if your experience actually supports them.
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Do this next
        </h3>
        <ol className="list-decimal space-y-1.5 pl-4">
          {review.actionItems.map((item) => (
            <li key={item} className="text-studio-ink/90">
              {item}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

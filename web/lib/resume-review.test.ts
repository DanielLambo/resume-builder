import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractTargetRole,
  isResumeReviewPrompt,
  latexBodyForReview,
  ResumeReviewSchema,
} from "./resume-review";

describe("isResumeReviewPrompt", () => {
  it("detects common review phrasings", () => {
    assert.equal(isResumeReviewPrompt("review my resume for backend SWE intern"), true);
    assert.equal(isResumeReviewPrompt("Critique my resume for a PM role"), true);
    assert.equal(isResumeReviewPrompt("Give me feedback on my resume"), true);
    assert.equal(isResumeReviewPrompt("How does my resume look for data science?"), true);
    assert.equal(isResumeReviewPrompt("What do you think of my CV?"), true);
    assert.equal(isResumeReviewPrompt("roast my resume"), true);
  });

  it("keeps mutating asks on the edit path", () => {
    assert.equal(isResumeReviewPrompt("Add AWS to my skills"), false);
    assert.equal(isResumeReviewPrompt("review and rewrite my summary"), false);
    assert.equal(isResumeReviewPrompt("review my resume and improve the bullets"), false);
    assert.equal(isResumeReviewPrompt("tailor my resume for Google"), false);
  });
});

describe("extractTargetRole", () => {
  it("extracts role phrases", () => {
    assert.equal(
      extractTargetRole("review my resume for backend SWE intern role"),
      "backend SWE intern",
    );
    assert.equal(
      extractTargetRole("Critique my resume for a product manager position"),
      "product manager",
    );
    assert.equal(extractTargetRole("review my resume for xyz"), "xyz");
    assert.equal(
      extractTargetRole("How does my resume look for data science?"),
      "data science",
    );
  });

  it("returns null when no role is named", () => {
    assert.equal(extractTargetRole("review my resume"), null);
  });
});

describe("latexBodyForReview", () => {
  it("strips document preamble", () => {
    const latex = String.raw`\documentclass{article}
\begin{document}
Hello
\end{document}`;
    assert.equal(latexBodyForReview(latex), "Hello");
  });
});

describe("ResumeReviewSchema", () => {
  it("accepts a valid review payload", () => {
    const parsed = ResumeReviewSchema.parse({
      targetRole: "SWE Intern",
      fitScore: 7,
      summary:
        "Solid foundation for an SWE intern role, with clear project ownership, but a few bullets bury impact.",
      strengths: [{ title: "Projects", detail: "Two shipped projects with concrete stack." }],
      gaps: [
        {
          title: "Missing testing signal",
          detail: "No mention of tests or CI for claimed backend work.",
          severity: "medium",
        },
      ],
      bulletAdvice: [
        {
          quote: "Worked on APIs",
          issue: "Vague ownership and no outcome.",
          suggestion: "Owned REST endpoints for X; cut p95 latency from A to B.",
        },
      ],
      keywordGaps: ["Docker", "unit testing"],
      actionItems: [
        "Quantify the API bullet with latency or throughput you actually measured.",
        "Add Docker only if you used it — otherwise skip keyword stuffing.",
      ],
      reply: "Fit is decent for SWE intern — tighten impact wording and surface testing.",
    });
    assert.equal(parsed.fitScore, 7);
  });
});

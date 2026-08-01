import { z } from "zod";

/**
 * Structured resume review — analysis only, never mutates LaTeX.
 * Validated with Zod before any UI consumption.
 */

export const ReviewSeveritySchema = z.enum(["high", "medium", "low"]);

export const ResumeReviewSchema = z.object({
  targetRole: z.string().trim().min(1).max(160).nullable(),
  fitScore: z.number().int().min(1).max(10),
  summary: z.string().trim().min(20).max(1200),
  strengths: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        detail: z.string().trim().min(1).max(600),
      }),
    )
    .min(1)
    .max(6),
  gaps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        detail: z.string().trim().min(1).max(600),
        severity: ReviewSeveritySchema,
      }),
    )
    .max(8),
  bulletAdvice: z
    .array(
      z.object({
        quote: z.string().trim().min(1).max(280),
        issue: z.string().trim().min(1).max(400),
        suggestion: z.string().trim().min(1).max(500),
      }),
    )
    .max(8),
  keywordGaps: z.array(z.string().trim().min(1).max(80)).max(16),
  actionItems: z.array(z.string().trim().min(1).max(400)).min(2).max(8),
  reply: z.string().trim().min(1).max(800),
});

export type ResumeReview = z.infer<typeof ResumeReviewSchema>;

export type GroqResumeReviewResult = {
  review: ResumeReview;
  totalTokens: number;
};

const REVIEW_INTENT_RE =
  /\b(review|critique|roast|assess|evaluate|analyze|analyse|score|rate)\b[\s\S]{0,60}\b(resume|cv)\b|\b(resume|cv)\b[\s\S]{0,60}\b(review|critique|roast|feedback|advice)\b|\b(feedback|thoughts|advice)\b[\s\S]{0,40}\b(on|for|about)\b[\s\S]{0,40}\b(resume|cv)\b|\bhow (does|is|would) (my|this) (resume|cv)\b|\bwhat do you think of (my|this) (resume|cv)\b|\breview (it|this|mine) for\b/i;

const MUTATION_INTENT_RE =
  /\b(rewrite|tailor|polish|fix|improve|update|edit|add|remove|delete|shorten|compress|apply (the )?changes|make (it |this )?(one[- ]page|better)|turn .+ into)\b/i;

/**
 * True when the user is asking for critique/advice, not a mutating edit.
 * "Review and rewrite…" stays on the edit path.
 */
export function isResumeReviewPrompt(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  if (!REVIEW_INTENT_RE.test(p)) return false;
  if (MUTATION_INTENT_RE.test(p)) return false;
  return true;
}

/**
 * Pull a target role from natural language, e.g.
 * "review my resume for backend SWE intern role" → "backend SWE intern"
 */
export function extractTargetRole(prompt: string): string | null {
  const p = prompt.trim();
  if (!p) return null;

  const patterns = [
    /\bfor(?:\s+an?)?\s+(.+?)\s+role\b/i,
    /\bfor(?:\s+an?)?\s+(.+?)\s+position\b/i,
    /\bfor(?:\s+an?)?\s+(.+?)\s+job\b/i,
    /\bas(?:\s+an?)?\s+(.+?)(?:[.!?,]|$)/i,
    /\btarget(?:ing)?\s+(.+?)(?:[.!?,]|$)/i,
    /\bapplying (?:for|to)(?:\s+an?)?\s+(.+?)(?:[.!?,]|$)/i,
    /\breview (?:my |this )?(?:resume|cv) for(?:\s+an?)?\s+(.+)$/i,
    /\b(?:resume|cv)\b[\s\S]{0,48}?\bfor(?:\s+an?)?\s+(.+)$/i,
  ];

  for (const re of patterns) {
    const match = p.match(re);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const cleaned = raw
      .replace(/\b(please|thanks|thank you)\b/gi, "")
      .replace(/[.?!,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 2 || cleaned.length > 120) continue;
    if (/^(my|this|the|a|an)\b/i.test(cleaned) && cleaned.split(/\s+/).length < 3) {
      continue;
    }
    return cleaned;
  }
  return null;
}

/** Prefer body content for the model — preamble adds noise and tokens. */
export function latexBodyForReview(latex: string): string {
  const begin = latex.search(/\\begin\{document\}/i);
  const end = latex.search(/\\end\{document\}/i);
  if (begin >= 0 && end > begin) {
    return latex.slice(begin + "\\begin{document}".length, end).trim();
  }
  return latex.trim();
}

/**
 * Recruiter-detectable AI resume sludge.
 * Used in prompts + post-edit guards (only flags phrases newly introduced).
 */

export const AI_SLOP_PHRASES = [
  "highly motivated",
  "results-driven",
  "results driven",
  "passionate about",
  "detail-oriented",
  "detail oriented",
  "self-starter",
  "self starter",
  "team player",
  "go-getter",
  "proven track record",
  "strong work ethic",
  "fast learner",
  "quick learner",
  "hard worker",
  "think outside the box",
  "outside the box",
  "synerg",
  "leverage",
  "utilized",
  "utilise",
  "spearheaded",
  "orchestrated",
  "facilitated",
  "empowered",
  "cutting-edge",
  "cutting edge",
  "state-of-the-art",
  "state of the art",
  "best-in-class",
  "best in class",
  "world-class",
  "world class",
  "seamless",
  "robust",
  "scalable solutions",
  "innovative solutions",
  "dynamic environment",
  "fast-paced environment",
  "fast paced environment",
  "cross-functional stakeholders",
  "stakeholder buy-in",
  "drove impact",
  "delivered impact",
  "impactful",
  "demonstrated ability",
  "expertise in",
  "proficient in all",
  "responsible for",
  "duties included",
  "tasked with",
  "helped to",
  "assisted with ensuring",
  "in order to ensure",
  "played a key role",
  "key role in",
  "successfully completed",
  "various tasks",
  "multiple projects",
  "and more",
  "etc.",
  "delve",
  "embark",
  "elevate",
  "revolutionize",
  "transformative",
  "holistic",
  "paradigm",
  "ecosystem of",
  "utilize my",
  "passionate individual",
  "eager to contribute",
  "seek a challenging",
  "opportunity to grow",
] as const;

/**
 * Cadences recruiters clock as ChatGPT resume voice.
 * Intentionally excludes honest "cut X by 18%" metrics — those are fine when true.
 */
export const AI_SLOP_PATTERNS: RegExp[] = [
  /\b(?:resulting in|which resulted in|leading to|that led to)\s+(?:a\s+)?\d/i,
  /\b(?:achieving|driving|delivering)\s+(?:a\s+)?\d+\s*%/i,
  /\b(?:furthermore|moreover|additionally|subsequently|thereby|hence|thus),/i,
  /\b(?:meticulous|pivotal|crucial|vital)\s+(?:role|part|contribution)/i,
  /\bshowcasing\b/i,
  /\bleveraging\b/i,
  /\butilizing\b/i,
  /\bharnessing\b/i,
  /\bfoster(?:ed|ing)?\s+(?:a\s+)?(?:culture|collaboration|innovation)/i,
  /\bstreamlined\s+processes\b/i,
  /\bend-to-end\s+solutions?\b/i,
  /\bactionable\s+insights\b/i,
  /\bdata-driven\s+decisions?\b/i,
  /\bcross-functional\s+(?:team|stakeholders?)\b/i,
];

export type AiSlopHit = {
  kind: "phrase" | "pattern";
  match: string;
};

function normalizeForScan(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase();
}

/**
 * Find AI-slop hits in `latex`. When `priorLatex` is set, only report hits
 * that were not already present (so we don't punish the user's original voice).
 */
export function findIntroducedAiSlop(
  latex: string,
  priorLatex?: string,
): AiSlopHit[] {
  const next = normalizeForScan(latex);
  const prior = priorLatex ? normalizeForScan(priorLatex) : "";
  const hits: AiSlopHit[] = [];

  for (const phrase of AI_SLOP_PHRASES) {
    if (!next.includes(phrase)) continue;
    if (prior.includes(phrase)) continue;
    hits.push({ kind: "phrase", match: phrase });
  }

  for (const pattern of AI_SLOP_PATTERNS) {
    const found = latex.match(pattern);
    if (!found?.[0]) continue;
    if (priorLatex && priorLatex.match(pattern)) continue;
    hits.push({ kind: "pattern", match: found[0].trim() });
  }

  return hits;
}

export function formatAiSlopError(hits: AiSlopHit[]): string {
  const sample = hits
    .slice(0, 6)
    .map((h) => `"${h.match}"`)
    .join(", ");
  return `AI_SLOP: recruiter-detectable phrasing introduced (${sample}). Rewrite in plain human voice; keep facts; no buzzwords or fake-impact cadences.`;
}

/** Compact ban list for prompts (not the full scanner list). */
export const AI_SLOP_PROMPT_BANLIST = `## Anti-slop (recruiters catch this — never introduce it)
Banned words/phrases: leveraged, utilizing/utilized, spearheaded, orchestrated,
facilitated, empowered, cutting-edge, seamless, robust, innovative, synergistic,
results-driven, highly motivated, passionate, proven track record, detail-oriented,
self-starter, team player, expertise in, demonstrated ability, responsible for,
duties included, tasked with, played a key role, successfully completed, delve,
embark, elevate, transformative, holistic, paradigm, actionable insights,
data-driven decisions, end-to-end solutions, streamlined processes, showcasing,
harnessing, fostering collaboration/culture/innovation, eager to contribute.

Banned cadences:
- ", resulting in / leading to / which resulted in N%"
- "improved/increased/reduced X by NN%" when the metric was not already on the resume
- Starting bullets with Furthermore/Moreover/Additionally/Subsequently
- Keyword-stuffing JD jargon the candidate never used
- Making every bullet the same length/rhythm ending in a percentage

Human test: if a recruiter would mutter "this is ChatGPT", rewrite it.
Keep imperfect natural specificity. Prefer concrete nouns over abstract impact theater.`;

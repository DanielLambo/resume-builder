/**
 * Resume review helpers — advice-first, edit-second.
 */

export function isReviewPrompt(prompt: string): boolean {
  const p = prompt.toLowerCase();
  if (
    /\b(review|critique|critiquing|feedback|assess|evaluate|roast)\b/.test(p)
  ) {
    return true;
  }
  if (/\bhow (does|do|is|are) (this|my) resume\b/.test(p)) return true;
  if (/\bwhat('s| is) (missing|weak|wrong|good)\b/.test(p)) return true;
  if (/\b(rate|score) (this|my) resume\b/.test(p)) return true;
  if (/\bhonest (take|opinion|feedback)\b/.test(p)) return true;
  return false;
}

/** True when the user also wants edits applied, not just advice. */
export function reviewWantsFixes(prompt: string): boolean {
  return /\b(and (then )?(fix|apply|rewrite|improve|update|edit)|apply (the )?(fixes|changes|edits)|make the changes|rewrite (it|the bullets)|fix (it|them|the issues))\b/i.test(
    prompt,
  );
}

/** Pull a role/company hint from free-text review prompts. */
export function extractReviewTarget(prompt: string): string | null {
  const patterns = [
    /\b(?:for|as|targeting|towards?)\s+(?:an?\s+|the\s+)?(.{3,80}?)(?:\s+role|\s+position|\s+job)?\s*$/i,
    /\breview(?:\s+my\s+resume)?\s+for\s+(.+)$/i,
    /\bfeedback\s+for\s+(.+)$/i,
  ];
  for (const re of patterns) {
    const m = prompt.trim().match(re);
    const raw = m?.[1]?.trim();
    if (raw && raw.length >= 3 && !/^(me|this|it|please)\b/i.test(raw)) {
      return raw.replace(/[.?!]+$/, "").slice(0, 120);
    }
  }
  return null;
}

export const RESUME_REVIEW_PLAYBOOK = `## Mode: RESUME REVIEW (advice-first)
You are a tough, fair technical recruiter + hiring manager doing a resume screen.
Give actually useful advice — specific to THIS resume and the target role — not generic tips.

### Output rules
- Put the full review in \`reply\` (plain text, use line breaks + simple headings with ##).
- Keep \`data_json.latex\` BYTE-IDENTICAL to the input unless the user explicitly asked to apply fixes.
- Be concrete: cite real bullets/sections/tools from the resume. No vague "add more metrics".
- Be honest about gaps. Prefer "you don't show X; here's how to evidence it from Y" over inventing experience.
- Never invent employers, metrics, or skills. If evidence is missing, say so.
- Avoid AI-coach sludge ("leverage your unique journey", "showcasing your passion").

### Required reply structure
## Fit for <role or "general screen">
One-line verdict + rough fit score out of 10 for that target.

## What works
3–5 bullets tied to real content on the resume.

## Gaps vs the role
3–6 bullets. For each: what's missing / weak, why a recruiter cares, and a concrete fix (rewrite suggestion or what evidence to add — without inventing facts).

## Bullet-level notes
Call out 2–4 specific bullets (quote a short fragment) with sharper rewrites when possible.

## Highest-ROI next edits
Numbered 1–5, ordered by impact vs effort. Phrase as actions the candidate can take in Typesetter.

## ATS / clarity watchouts
Formatting, keyword gaps, one-page density, jargon, or AI-slop risks — only if relevant.

Aim for a review a strong candidate would actually use before applying.`;

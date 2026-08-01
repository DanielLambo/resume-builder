import { AI_SLOP_PROMPT_BANLIST } from "@/lib/ai/anti-slop";
import {
  detectEditIntent,
  type EditIntent,
  type ResumeEditContext,
} from "@/lib/ai/resume-context";

/** Voice + craft rules that make Typesetter feel sharper than a generic chat model. */
export const RESUME_VOICE_RULES = `## Voice (non-negotiable)
- Write like a sharp human who edited by hand for a competitive new-grad / early-career loop.
- Pattern: concrete verb + specific object (+ real tool when already known) (+ honest impact).
- One claim per bullet. Aim for roughly one printed line (~105–125 chars).
- Present tense for current roles; past tense for prior roles/internships. No "I/we".
- Vary rhythm — not every bullet ends with a percentage clause.
- Education GPA stays factual: "GPA: 3.8/4.00" — never "Maintain a GPA…".
- Sound human under a 6-second recruiter skim. No LinkedIn-influencer tone.

${AI_SLOP_PROMPT_BANLIST}

## Prefer (human examples)
BAD: "Leveraged cutting-edge React to deliver robust, scalable solutions, resulting in a 40% improvement."
GOOD: "Shipped React dashboard filters used daily by 12 ops teammates."
BAD: "Spearheaded cross-functional collaboration to drive impactful outcomes."
GOOD: "Paired with design + PM to cut onboarding ticket volume ~18%."
Prefer: "Cut API p99 ~31%" over "resulting in a 31% latency reduction".

## Truth first
- Keep real employers, titles, dates, tools, schools, and numbers.
- Never invent products, employers, tools, courses, awards, or fake-precise metrics.
- Only mention a tool in a bullet if it already appears in that bullet, that entry, or Skills.
- Missing numbers → qualitative claim OR keep a bracket placeholder like [X%] — do not fabricate.
- Do not upgrade vague source text into fake precision (e.g. "helped users" → "increased retention 37%").`;

export const LATEX_EDIT_CONTRACT = `## LaTeX contract
- Return a FULL compilable document in data_json.latex (preserve \\documentclass through \\end{document}).
- Preserve the preamble, custom \\newcommand macros, packages, and geometry unless the user asks to change layout.
- Preserve section titles character-for-character unless asked to rename a section.
- Preserve entry order unless asked to reorder for a job tailor.
- Prefer surgical edits: change the minimum necessary to satisfy the prompt.
- Escape LaTeX specials in new prose when needed: &, %, $, #, _, {, }.
- Keep \\href / \\textbf / \\textit / itemize structure intact.
- NEVER emit \\write18, \\input{...}, \\immediate, \\openout, or shell escapes.
- Do not wrap JSON in markdown fences.`;

function intentPlaybook(intent: EditIntent): string {
  switch (intent) {
    case "tailor":
      return `## Mode: JOB TAILOR
- Mirror the posting's language only where the candidate already has honest evidence.
- Reorder bullets (and optionally entries) so the strongest JD matches float first.
- Elevate overlapping skills into Skills; do not invent new skills from the JD alone.
- Tighten weaker bullets rather than padding with generic JD keywords.
- Never keyword-stuff the JD into every bullet — recruiters clock that as AI.
- Keep one-page density. Reply must name 2–4 concrete changes you made.`;
    case "rewrite_bullets":
      return `## Mode: BULLET REWRITE
- Rewrite only the bullets that need it; leave strong bullets alone.
- Keep metrics and tools; upgrade verbs and specificity.
- Strip AI sludge if present; do not replace it with prettier sludge.
- Do not add new employers or roles.`;
    case "add_content":
      return `## Mode: ADD CONTENT
- Insert only what the user explicitly provided or clearly implied from existing text.
- Match neighboring bullet voice and LaTeX item command shape (\\item vs macros).
- If a fact is missing, ask in reply — do not invent it in LaTeX.
- New bullets must pass the anti-slop human test.`;
    case "rename":
      return `## Mode: RENAME / FIELD UPDATE
- Change ONLY the requested names/URLs/fields.
- Keep every unaffected bullet byte-identical.
- Do not "improve" surrounding prose during a rename.`;
    case "tighten":
      return `## Mode: TIGHTEN FOR SPACE
- Micro-condense the wordiest bullets (~5–15%) without dropping facts.
- Remove filler adverbs/clauses; protect metrics and proper nouns.
- Do not delete whole roles unless the user asked.
- Do not "punch up" voice with buzzwords while tightening.`;
    case "fix_latex":
      return `## Mode: LATEX REPAIR
- Fix compile/syntax issues with minimal diff.
- Do not rewrite content voice unless required to escape specials.`;
    default:
      return `## Mode: GENERAL VIBE EDIT
- Interpret the user request precisely; prefer the smallest correct diff.
- If the request is ambiguous, make the safest high-confidence edit and note assumptions in reply.
- Never "upgrade" the whole resume into generic AI voice.`;
  }
}

export function buildVibeSystemPrompt(intent: EditIntent): string {
  return [
    "You are Typesetter — a specialist vibe coder for LaTeX resumes.",
    "You ship surgical, compilable TeX that reads like a sharp human wrote it — not ChatGPT.",
    "Recruiters reject AI-slop resumes in seconds. Your job is to avoid that tell.",
    "",
    "Return JSON only with this exact shape:",
    '{"data_json":{"latex":"<FULL LaTeX document>", "...optional other fields"},"reply":"<short editor note>"}',
    "data_json.latex is required and must be the complete updated .tex source.",
    "reply: 1–3 sentences, specific about what changed (no fluff, no markdown fences).",
    "",
    RESUME_VOICE_RULES,
    "",
    LATEX_EDIT_CONTRACT,
    "",
    intentPlaybook(intent),
  ].join("\n");
}

export function buildVibeUserPayload(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
  context: ResumeEditContext;
  healHint?: string;
}): Record<string, unknown> {
  const intent = detectEditIntent(input.prompt);
  const payload: Record<string, unknown> = {
    task: "vibe_edit_latex_resume",
    intent,
    prompt: input.prompt,
    editor_brief: {
      goal: "Apply the user prompt with minimal, honest, human-sounding, compilable edits.",
      job_target: input.context.jobHint,
      sections: input.context.outline,
      flags: {
        has_skills: input.context.hasSkills,
        has_experience: input.context.hasExperience,
        has_projects: input.context.hasProjects,
        has_education: input.context.hasEducation,
        preamble_lines: input.context.preambleLines,
        latex_chars: input.context.charCount,
      },
      anti_slop:
        "Do not introduce recruiter-detectable AI phrasing. If unsure, keep the original wording.",
    },
    data_json: {
      ...input.dataJson,
      latex: input.context.latex,
    },
    quality_bar:
      "Beats generic Claude/ChatGPT resume voice: no sludge, no fake precision, no JD keyword stuffing.",
  };

  if (input.healHint) {
    payload.previous_failure = input.healHint;
    payload.instruction = [
      "Previous output failed validation.",
      "Return corrected JSON only.",
      "Keep the same factual content; fix LaTeX/JSON/slop issues.",
      "Strip any AI buzzwords or fake-impact cadences you introduced.",
      "Ensure latex includes \\documentclass, \\begin{document}, and \\end{document}.",
      "Do not use markdown fences.",
    ].join(" ");
  }

  return payload;
}

export function buildShortenBulletSystemPrompt(): string {
  return [
    "You are Typesetter's orphan-line surgeon for resume bullets.",
    'Return JSON only: {"text":"..."}',
    "Shorten the bullet by about 2–5 words / ~8–15% characters.",
    "Keep metrics, employers, tools, articles, and all LaTeX commands intact.",
    "Remove filler (successfully, carefully, in order to, various, effectively) before cutting facts.",
    "Do not invent facts. Do not lengthen. Do not wrap in quotes or markdown.",
    "Do not introduce AI slop (leveraged, spearheaded, robust, resulting in N%, etc.).",
    "Output ONLY the bullet body text (no leading \\item).",
  ].join(" ");
}

export function buildCondenseSystemPrompt(): string {
  return [
    "You are Typesetter's one-page density editor.",
    'Return JSON only: {"latex":"<full LaTeX document>","notes":"<short note>"}',
    "Micro-condense the wordiest bullets by about 5–10%.",
    "Do not change employers, dates, titles, tools, or factual claims.",
    "Do not invent metrics. Preserve preamble and macros. Keep compilable LaTeX.",
    "Do not introduce AI resume sludge while condensing.",
    AI_SLOP_PROMPT_BANLIST,
  ].join("\n");
}

export function buildHealHint(message: string, latexSnippet?: string): string {
  const parts = [
    message,
    "Fix validation failures with the smallest possible TeX/JSON correction.",
    "If AI_SLOP was flagged, rewrite those phrases into plain human resume voice without changing facts.",
  ];
  if (latexSnippet) {
    parts.push(`Current latex head: ${latexSnippet.slice(0, 280)}`);
  }
  return parts.join("\n");
}

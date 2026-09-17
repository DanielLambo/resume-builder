/**
 * Recruiter quality bar — from a real hiring-manager screen.
 * Keep this compact: injected into every Groq system prompt (token budget matters).
 *
 * 1. Tailor to the role
 * 2. Outcomes / impact over task descriptions
 * 3. Technical depth + real-world application
 */

export const RECRUITER_QUALITY_RULES = [
  "Recruiter bar (always):",
  "(1) Tailor — float the most role-relevant evidence first; mirror JD language only where the resume already supports it; never invent a match.",
  "(2) Outcomes > tasks — every edited bullet must show what changed/shipped/improved/was prevented, not just what was done. No fabricated metrics; use honest qualitative impact or [X%] placeholders.",
  "(3) Technical depth — include one concrete signal beyond a tool name: scale, constraint, architecture choice, testing, migration, or production context.",
  'Weak: "Worked on the API using Python." Strong: "Shipped Python API handler for 40k nightly events; added DLQ + alerts to cut silent failures."',
  "Ban task-only openers on new/edited bullets: Worked on, Was involved in, Contributed to, Helped with, Participated in, Assisted in, Supported the team.",
].join(" ");

export const RECRUITER_REVIEW_RULES = [
  "Score and advise against the recruiter bar:",
  "(1) Tailored to the target role?",
  "(2) Outcomes over tasks — flag task-only bullets.",
  "(3) Technical depth — flag tool-name-only bullets with no scale/constraint/prod signal.",
  "In bulletAdvice, name which rule fails (tailor|outcome|depth) and give a rewrite that fixes it without inventing facts.",
  "At least 2 actionItems must address outcomes or technical depth.",
].join(" ");

import { getLatexFromDataJson } from "@/lib/resume-template";

export type ResumeSectionOutline = {
  title: string;
  entryCount: number;
  bulletCount: number;
};

export type ResumeEditContext = {
  latex: string;
  charCount: number;
  sectionTitles: string[];
  outline: ResumeSectionOutline[];
  hasSkills: boolean;
  hasExperience: boolean;
  hasProjects: boolean;
  hasEducation: boolean;
  preambleLines: number;
  jobHint: string | null;
};

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

/**
 * Compact structural digest so the model edits with map-awareness
 * instead of treating the TeX as an opaque blob.
 */
export function buildResumeEditContext(
  dataJson: Record<string, unknown>,
): ResumeEditContext {
  const latex = getLatexFromDataJson(dataJson);
  const beginIdx = latex.search(/\\begin\{document\}/i);
  const body = beginIdx >= 0 ? latex.slice(beginIdx) : latex;
  const preambleLines =
    beginIdx >= 0 ? latex.slice(0, beginIdx).split("\n").length : 0;

  const sectionRe = /\\section\*?\{([^}]+)\}/gi;
  const sectionTitles: string[] = [];
  const outline: ResumeSectionOutline[] = [];
  let match: RegExpExecArray | null;
  const sectionSpans: Array<{ title: string; start: number; end: number }> = [];

  while ((match = sectionRe.exec(body)) !== null) {
    sectionTitles.push(match[1] ?? "Section");
    sectionSpans.push({
      title: match[1] ?? "Section",
      start: match.index,
      end: body.length,
    });
  }
  for (let i = 0; i < sectionSpans.length; i += 1) {
    const next = sectionSpans[i + 1];
    sectionSpans[i]!.end = next?.start ?? body.length;
  }
  for (const span of sectionSpans) {
    const chunk = body.slice(span.start, span.end);
    outline.push({
      title: span.title,
      entryCount: countMatches(chunk, /\\(?:entry|resumeSubheading|textbf)\{/g),
      bulletCount: countMatches(chunk, /\\(?:item|resumeItem)\b/g),
    });
  }

  const job =
    dataJson.job && typeof dataJson.job === "object" && !Array.isArray(dataJson.job)
      ? (dataJson.job as Record<string, unknown>)
      : null;
  const company = typeof job?.company === "string" ? job.company : null;
  const role = typeof job?.role === "string" ? job.role : null;

  return {
    latex,
    charCount: latex.length,
    sectionTitles,
    outline,
    hasSkills: sectionTitles.some((t) => /skill/i.test(t)),
    hasExperience: sectionTitles.some((t) => /experience|work|employment/i.test(t)),
    hasProjects: sectionTitles.some((t) => /project/i.test(t)),
    hasEducation: sectionTitles.some((t) => /education/i.test(t)),
    preambleLines,
    jobHint: company && role ? `${role} @ ${company}` : null,
  };
}

export type EditIntent =
  | "review"
  | "tailor"
  | "rewrite_bullets"
  | "add_content"
  | "rename"
  | "tighten"
  | "fix_latex"
  | "general";

/** Cheap intent router so prompts can specialize without a second model call. */
export function detectEditIntent(prompt: string): EditIntent {
  const p = prompt.toLowerCase();
  // Review before tailor — "review for X role" should not become a silent rewrite.
  if (
    /\b(review|critique|feedback|assess|evaluate|roast)\b/.test(p) ||
    /\bhow (does|do|is|are) (this|my) resume\b/.test(p) ||
    /\b(rate|score) (this|my) resume\b/.test(p)
  ) {
    return "review";
  }
  if (
    p.includes("tailor this resume") ||
    p.includes("job description:") ||
    (p.includes("tailor") && (p.includes("job") || p.includes("role")))
  ) {
    return "tailor";
  }
  if (
    /\\[a-zA-Z]|compile|overfull|undefined control|missing \$|fix (the )?latex|syntax/.test(
      p,
    )
  ) {
    return "fix_latex";
  }
  if (
    /\b(rename|change (my )?name|update (my )?(email|phone|linkedin|github|school|university|employer|company name))\b/.test(
      p,
    )
  ) {
    return "rename";
  }
  if (
    /\b(shorten|tighten|condense|compress|fit|one page|1 page|trim)\b/.test(p)
  ) {
    return "tighten";
  }
  if (
    /\b(add|include|insert|put)\b/.test(p) &&
    /\b(skill|bullet|project|course|award|certificat|experience|internship)\b/.test(
      p,
    )
  ) {
    return "add_content";
  }
  if (
    /\b(rewrite|rephrase|improve|stronger|punchier|better bullets|make .* sound)\b/.test(
      p,
    )
  ) {
    return "rewrite_bullets";
  }
  return "general";
}

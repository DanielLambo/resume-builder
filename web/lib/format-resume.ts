/**
 * Mechanical resume formatting — spacing, bullets, dates, section rhythm.
 * Fact-safe: does not rewrite sentences.
 */

export const FORMAT_CONSISTENCY_PROMPT = [
  "Format this entire resume for recruiter-grade consistency.",
  "Unify: section headers, date ranges (Mon YYYY--Mon YYYY), bullet punctuation (end with a period), parallel verb tense (past for past roles, present only for current), \\cdot separators, and itemize spacing.",
  "Do not invent jobs, metrics, tools, or schools. Do not drop facts. Do not change the template class or packages unless broken.",
  "Keep it one page. Return polished LaTeX only via the usual JSON contract.",
].join(" ");

const SECTION_TITLES: Record<string, string> = {
  education: "Education",
  experience: "Experience",
  workexperience: "Experience",
  work: "Experience",
  projects: "Projects",
  skills: "Skills",
  technicalskills: "Skills",
  leadership: "Leadership",
  activities: "Activities",
  involvement: "Involvement",
  honors: "Honors",
  awards: "Awards",
  coursework: "Coursework",
  publications: "Publications",
  research: "Research",
};

function titleCaseSection(raw: string): string {
  const key = raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (SECTION_TITLES[key]) return SECTION_TITLES[key]!;
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function normalizeDateToken(token: string): string {
  const months: Record<string, string> = {
    jan: "Jan",
    january: "Jan",
    feb: "Feb",
    february: "Feb",
    mar: "Mar",
    march: "Mar",
    apr: "Apr",
    april: "Apr",
    may: "May",
    jun: "Jun",
    june: "Jun",
    jul: "Jul",
    july: "Jul",
    aug: "Aug",
    august: "Aug",
    sep: "Sep",
    sept: "Sep",
    september: "Sep",
    oct: "Oct",
    october: "Oct",
    nov: "Nov",
    november: "Nov",
    dec: "Dec",
    december: "Dec",
  };
  const t = token.trim();
  if (/^(present|now|current)$/i.test(t)) return "Present";
  const m = t.match(/^([A-Za-z]+)\.?\s+(\d{4})$/);
  if (m) {
    const mon = months[m[1]!.toLowerCase()];
    if (mon) return `${mon} ${m[2]}`;
  }
  return t;
}

/** Normalize date ranges like "May 2025 - August 2025" → "May 2025--Aug 2025". */
export function normalizeDateRanges(text: string): string {
  return text.replace(
    /\b([A-Za-z]{3,9}\.?\s+\d{4}|Present|Now|Current)\s*(?:--|–|—|-|to|until)\s*([A-Za-z]{3,9}\.?\s+\d{4}|Present|Now|Current)\b/gi,
    (_all, a: string, b: string) => `${normalizeDateToken(a)}--${normalizeDateToken(b)}`,
  );
}

function normalizeItemLine(line: string): string {
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch?.[1] ?? "";
  let body = line.trim();

  body = body
    .replace(/^\\item\s*/, "")
    .replace(/^[-*•·]\s+/, "")
    .replace(/^\\resumeItem\{(.*)\}\s*$/, "$1");

  body = body.replace(/\s+/g, " ").trim();
  if (!body) return `${indent}\\item`;

  // Consistent terminal period (leave URLs / emails alone if that's the whole bullet).
  if (!/[.!?]$/.test(body) && !/^https?:\/\//i.test(body) && !body.includes("@")) {
    body = `${body}.`;
  }

  return `${indent || "  "}\\item ${body}`;
}

/**
 * Apply deterministic consistency passes across a full LaTeX resume.
 */
export function formatResumeLatex(source: string): string {
  let next = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  next = next.replace(/[ \t]+$/gm, "");
  next = next.replace(/\n{3,}/g, "\n\n");
  next = next.replace(/[–—]/g, "--");
  next = next.replace(/\s*\\cdot\s*/g, " $\\cdot$ ");
  next = next.replace(/\$\s*\\cdot\s*\$/g, "$\\cdot$");
  next = next.replace(/[ \t]{2,}/g, " ");

  next = next.replace(
    /\\section\*?\{([^}]*)\}/g,
    (_m, title: string) => `\\section*{${titleCaseSection(title)}}`,
  );

  next = next.replace(/\n\\section\*/g, "\n\n\\section*");
  next = next.replace(/\\end\{itemize\}\n(?!\\n|\\section|\\end\{document\}|\\entry)/g, "\\end{itemize}\n\n");

  const lines = next.split("\n");
  let inItemize = false;
  const out: string[] = [];

  for (const line of lines) {
    if (/\\begin\{itemize\}/.test(line)) {
      inItemize = true;
      out.push(line.trimStart().startsWith("\\") ? line.replace(/^\s+/, "") : line);
      continue;
    }
    if (/\\end\{itemize\}/.test(line)) {
      inItemize = false;
      out.push(line.replace(/^\s+/, ""));
      continue;
    }
    if (inItemize) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (
        trimmed.startsWith("\\item") ||
        trimmed.startsWith("\\resumeItem") ||
        /^[-*•·]/.test(trimmed)
      ) {
        out.push(normalizeItemLine(line));
        continue;
      }
    }
    out.push(normalizeDateRanges(line));
  }

  next = out.join("\n");
  next = next.replace(/\n{3,}/g, "\n\n");
  if (!next.endsWith("\n")) next += "\n";
  return next;
}

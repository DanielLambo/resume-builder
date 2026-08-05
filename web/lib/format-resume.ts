/**
 * Recruiter house style — mechanical first, then a fact-safe AI tense pass.
 *
 * Research baseline (ATS + tech recruiter screens, 2026):
 * - One date format everywhere: Mon YYYY--Mon YYYY, "Present" for current roles
 * - Standard section titles (Experience, Education, Skills, …)
 * - Plain bullets, parallel tense, identical terminal punctuation
 * - Contact as real text; LinkedIn/GitHub without https://www.
 * - Never invent or drop employers, titles, dates, tools, schools, or metrics
 */

export type FormatChangeKind =
  | "dates"
  | "headers"
  | "bullets"
  | "spacing"
  | "separators"
  | "contact"
  | "punctuation";

export type FormatChange = {
  kind: FormatChangeKind;
  detail: string;
};

export type FormatResult = {
  latex: string;
  changes: FormatChange[];
};

export const FORMAT_CONSISTENCY_PROMPT = [
  "Apply recruiter house style to this entire resume. Format only — do not rewrite the story.",
  "House style:",
  "1) Dates: Mon YYYY--Mon YYYY using Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec. Current roles end with Present (never Current, Now, or Ongoing). Same-year internships may stay Mon--Mon YYYY (May--Aug 2025).",
  "2) Section titles: Education, Experience, Projects, Skills, Leadership, Activities, Honors, Awards, Summary, Certifications — Title Case, standard names only.",
  "3) Bullets: start with a strong action verb; past tense for ended roles; present tense ONLY when the date line ends in Present. No first person. No \"Responsible for\" or \"Helped to\". Every bullet ends with a period.",
  "4) Keep \\entry{left}{dates}{subtitle}. Bold stays on the first argument only. Skills use $\\cdot$ or commas — no bars, stars, or proficiency graphics.",
  "5) Do not invent or drop jobs, metrics, tools, schools, titles, or dates. Do not delete bullets. Slight wording tightening for parallel structure is OK.",
  "6) Keep it one page. Do not change the document class or packages unless broken.",
  "Reply in one short sentence listing what you unified (dates / tense / headers / bullets).",
].join(" ");

const MONTHS: Record<string, string> = {
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

const MONTH_BY_NUM = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const SECTION_TITLES: Record<string, string> = {
  education: "Education",
  experience: "Experience",
  workexperience: "Experience",
  work: "Experience",
  professionalexperience: "Experience",
  employment: "Experience",
  employmenthistory: "Experience",
  workhistory: "Experience",
  projects: "Projects",
  academicprojects: "Projects",
  personalprojects: "Projects",
  skills: "Skills",
  technicalskills: "Skills",
  techskills: "Skills",
  relevantskills: "Skills",
  leadership: "Leadership",
  activities: "Activities",
  extracurriculars: "Activities",
  involvement: "Activities",
  volunteering: "Activities",
  volunteer: "Activities",
  honors: "Honors",
  awards: "Awards",
  honorsawards: "Honors",
  coursework: "Coursework",
  publications: "Publications",
  research: "Research",
  summary: "Summary",
  objectivesummary: "Summary",
  professionalsummary: "Summary",
  objective: "Summary",
  certifications: "Certifications",
  certificates: "Certifications",
};

function note(
  changes: FormatChange[],
  seen: Set<FormatChangeKind>,
  kind: FormatChangeKind,
  detail: string,
) {
  if (seen.has(kind)) return;
  seen.add(kind);
  changes.push({ kind, detail });
}

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
  const t = token.trim().replace(/\.$/, "");
  if (/^(present|now|current|ongoing|today)$/i.test(t)) return "Present";

  const numeric = t.match(/^(0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})$/);
  if (numeric) {
    const month = MONTH_BY_NUM[Number(numeric[1]) - 1];
    return month ? `${month} ${numeric[2]}` : t;
  }

  const named = t.match(/^([A-Za-z]+)\.?\s+((?:19|20)\d{2})$/);
  if (named) {
    const mon = MONTHS[named[1]!.toLowerCase()];
    if (mon) return `${mon} ${named[2]}`;
  }

  return t;
}

/** Normalize date ranges like "May 2025 - August 2025" → "May 2025--Aug 2025". */
export function normalizeDateRanges(text: string): string {
  let next = text.replace(
    /\b(0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})\b/g,
    (_all, mm: string, yyyy: string) => {
      const month = MONTH_BY_NUM[Number(mm) - 1];
      return month ? `${month} ${yyyy}` : `${mm}/${yyyy}`;
    },
  );

  next = next.replace(
    /\b([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})\b/g,
    (_all, mon: string, year: string) => {
      const short = MONTHS[mon.toLowerCase()];
      return short ? `${short} ${year}` : `${mon} ${year}`;
    },
  );

  next = next.replace(
    /\b((?:19|20)\d{2})\s*(?:--|–|—|-|to|until)\s*((?:19|20)\d{2}|Present|Now|Current|Ongoing)\b/gi,
    (_all, a: string, b: string) => `${a}--${normalizeDateToken(b)}`,
  );

  next = next.replace(
    /\b([A-Za-z]{3}\s+(?:19|20)\d{2}|Present|Now|Current|Ongoing)\s*(?:--|–|—|-|to|until)\s*([A-Za-z]{3}\s+(?:19|20)\d{2}|Present|Now|Current|Ongoing)\b/gi,
    (_all, a: string, b: string) =>
      `${normalizeDateToken(a)}--${normalizeDateToken(b)}`,
  );

  next = next.replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(?:--|–|—|-)\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+((?:19|20)\d{2})\b/g,
    "$1--$2 $3",
  );

  return next;
}

function normalizePhoneNumbers(text: string): string {
  return text.replace(
    /(?:\+1[\s.-]?)?(?:\(?(\d{3})\)?[\s.-]?)(\d{3})[\s.-]?(\d{4})\b/g,
    (_all, a: string, b: string, c: string) => `(${a}) ${b}-${c}`,
  );
}

function normalizeContactUrls(text: string): string {
  return text
    .replace(/https?:\/\/(www\.)?linkedin\.com\/in\/([\w%-]+)\/?/gi, "linkedin.com/in/$2")
    .replace(/https?:\/\/(www\.)?github\.com\/([\w%-]+)\/?/gi, "github.com/$2");
}

function normalizeItemLine(line: string): string {
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch?.[1] ?? "";
  let body = line.trim();

  body = body
    .replace(/^\\item\s*/, "")
    .replace(/^[-*•·‣▪▸➤→]\s+/, "")
    .replace(/^\\resumeItem\{(.*)\}\s*$/, "$1");

  body = body.replace(/\s+/g, " ").trim();
  if (!body) return `${indent}\\item`;

  if (/^[a-z]/.test(body) && !body.startsWith("http")) {
    body = body.charAt(0).toUpperCase() + body.slice(1);
  }

  if (/[;:]$/.test(body)) {
    body = `${body.slice(0, -1)}.`;
  } else if (
    !/[.!?]$/.test(body) &&
    !/^https?:\/\//i.test(body) &&
    !body.includes("@")
  ) {
    body = `${body}.`;
  }

  return `${indent || "  "}\\item ${body}`;
}

function pushChangeIfDifferent(
  before: string,
  after: string,
  changes: FormatChange[],
  seen: Set<FormatChangeKind>,
  kind: FormatChangeKind,
  detail: string,
): string {
  if (before !== after) note(changes, seen, kind, detail);
  return after;
}

/**
 * Deterministic house-style pass. Fact-safe: does not rewrite sentences.
 */
export function polishResumeLatex(source: string): FormatResult {
  const changes: FormatChange[] = [];
  const seen = new Set<FormatChangeKind>();
  let next = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  next = pushChangeIfDifferent(
    next,
    next.replace(/[ \t]+$/gm, ""),
    changes,
    seen,
    "spacing",
    "Trimmed trailing spaces and extra blank lines",
  );

  const typography = next
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "--")
    .replace(/\u00a0/g, " ");
  next = pushChangeIfDifferent(
    next,
    typography,
    changes,
    seen,
    "punctuation",
    "Normalized quotes and dashes",
  );

  const dated = normalizeDateRanges(next);
  next = pushChangeIfDifferent(
    next,
    dated,
    changes,
    seen,
    "dates",
    "Unified dates to Mon YYYY--Mon YYYY with Present",
  );

  const contact = normalizePhoneNumbers(normalizeContactUrls(next));
  next = pushChangeIfDifferent(
    next,
    contact,
    changes,
    seen,
    "contact",
    "Cleaned phone numbers and profile URLs",
  );

  const separators = next
    .replace(/ \| /g, " $\\cdot$ ")
    .replace(/\s*\\cdot\s*/g, " $\\cdot$ ")
    .replace(/\$\s*\\cdot\s*\$/g, "$\\cdot$")
    .replace(/[ \t]{2,}/g, " ");
  next = pushChangeIfDifferent(
    next,
    separators,
    changes,
    seen,
    "separators",
    "Unified $\\cdot$ separators",
  );

  next = next.replace(/\\section\*?\{([^}]*)\}/g, (_m, title: string) => {
    const normalized = titleCaseSection(title);
    if (normalized !== title.trim()) {
      note(changes, seen, "headers", "Standardized section titles");
    }
    return `\\section*{${normalized}}`;
  });

  next = next.replace(/\n\\section\*/g, "\n\n\\section*");
  next = next.replace(
    /\\end\{itemize\}\n(?!\n|\\section|\\end\{document\}|\\entry)/g,
    "\\end{itemize}\n\n",
  );

  const lines = next.split("\n");
  let inItemize = false;
  const out: string[] = [];
  let bulletTouched = false;

  for (const line of lines) {
    if (/\\begin\{itemize\}/.test(line)) {
      inItemize = true;
      out.push(line.replace(/^\s+/, ""));
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
        /^[-*•·‣▪▸➤→]/.test(trimmed)
      ) {
        const formatted = normalizeItemLine(line);
        if (formatted !== line) bulletTouched = true;
        out.push(formatted);
        continue;
      }
    }
    out.push(line);
  }

  if (bulletTouched) {
    note(
      changes,
      seen,
      "bullets",
      "Normalized bullets to \\item with terminal periods",
    );
  }

  next = out.join("\n");
  const spaced = next.replace(/\n{3,}/g, "\n\n");
  next = pushChangeIfDifferent(
    next,
    spaced,
    changes,
    seen,
    "spacing",
    "Trimmed trailing spaces and extra blank lines",
  );
  if (!next.endsWith("\n")) next += "\n";

  return { latex: next, changes };
}

export function formatResumeLatex(source: string): string {
  return polishResumeLatex(source).latex;
}

export function summarizeFormatChanges(changes: FormatChange[]): string {
  if (changes.length === 0) return "Already on house style";
  return changes.map((change) => change.detail).join(" · ");
}

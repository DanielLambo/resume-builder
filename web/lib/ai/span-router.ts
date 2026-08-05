import type { ResumeIndex, ResumeSpan } from "@/lib/ai/resume-index";

const SECTION_HINTS: Array<{ re: RegExp; sections: string[] }> = [
  {
    re: /\b(intern|internship|job|role|employer|experience|work(ed)?|company|rippling|hired)\b/i,
    sections: ["experience", "engineering-experience", "technical-experience", "product-experience"],
  },
  {
    re: /\b(project|shipped|built|app|repo)\b/i,
    sections: ["projects", "projects-leadership"],
  },
  {
    re: /\b(skill|skills|aws|docker|python|typescript|stack|tooling)\b/i,
    sections: ["skills", "skills-activities"],
  },
  {
    re: /\b(education|gpa|coursework|university|college|degree|dean)\b/i,
    sections: ["education"],
  },
  {
    re: /\b(header|name|email|phone|linkedin|contact)\b/i,
    sections: ["header"],
  },
];

export type SpanSelection = {
  focused: ResumeSpan[];
  global: boolean;
  needsFullDocument: boolean;
};

export function selectSpansForPrompt(
  prompt: string,
  index: ResumeIndex,
): SpanSelection {
  const text = prompt.trim();
  const needsFullDocument =
    /\b(compile error|latex|documentclass|undefined control|fix this latex|heal)\b/i.test(
      text,
    );

  if (needsFullDocument) {
    return {
      focused: index.spans.filter((span) => span.kind !== "preamble"),
      global: true,
      needsFullDocument: true,
    };
  }

  const global =
    /\b(format|house style|consistenc|everywhere|entire resume|whole resume|all bullets|impact-driven|more senior)\b/i.test(
      text,
    );

  const hintedSections = new Set<string>();
  for (const hint of SECTION_HINTS) {
    if (hint.re.test(text)) {
      for (const section of hint.sections) hintedSections.add(section);
    }
  }

  const previewHits = index.spans.filter((span) => {
    if (span.kind === "preamble" || span.preview.length < 4) return false;
    const needle = span.preview.slice(0, 48);
    const token = needle.split(" ").find((part) => part.length > 4);
    return Boolean(token && text.toLowerCase().includes(token.toLowerCase()));
  });

  const sectionHits = index.spans.filter((span) => hintedSections.has(span.section));
  const focusedIds = new Set<string>();
  const focused: ResumeSpan[] = [];
  const push = (span: ResumeSpan) => {
    if (focusedIds.has(span.id)) return;
    focusedIds.add(span.id);
    focused.push(span);
  };

  for (const span of previewHits) push(span);
  for (const span of sectionHits) {
    if (span.kind === "section" || span.kind === "entry" || span.kind === "header") {
      push(span);
    }
  }

  if (global || focused.length === 0) {
    for (const span of index.spans) {
      if (span.kind === "entry" || span.kind === "header" || span.kind === "section") {
        push(span);
      }
    }
  }

  return { focused, global, needsFullDocument: false };
}

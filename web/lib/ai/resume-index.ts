import { clipText } from "@/lib/ai/tokens";

export type SpanKind = "preamble" | "header" | "section" | "entry" | "bullet";

export type ResumeSpan = {
  id: string;
  kind: SpanKind;
  section: string;
  start: number;
  end: number;
  preview: string;
};

export type ResumeIndex = {
  checksum: string;
  charCount: number;
  spans: ResumeSpan[];
};

export type ResumeOutlineItem = {
  id: string;
  kind: SpanKind;
  section: string;
  preview: string;
};

const SECTION_RE = /\\(?:section\*|section)\s*\{/g;
const ENTRY_RE = /\\(?:entry|resumeSubheading)\s*\{/g;
const HEADER_RE = /\\headerblock\s*\{/g;
const ITEM_RE = /\\item\b(?:\[[^\]]*\])?\s*/g;
const RESUME_ITEM_RE = /\\resumeItem\s*\{/g;

function checksum(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function slug(value: string): string {
  const next = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return next || "section";
}

function previewOf(latex: string, start: number, end: number): string {
  return clipText(
    latex
      .slice(start, end)
      .replace(/\\[a-zA-Z]+\*?/g, " ")
      .replace(/[{}\[\]]/g, " ")
      .replace(/\s+/g, " "),
    72,
  );
}

function findBalancedBraceEnd(latex: string, openBraceIndex: number): number {
  if (latex[openBraceIndex] !== "{") return -1;
  let depth = 0;
  for (let i = openBraceIndex; i < latex.length; i += 1) {
    const ch = latex[i];
    if (ch === "\\" && i + 1 < latex.length) {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function firstArgText(latex: string, commandStart: number): string {
  const open = latex.indexOf("{", commandStart);
  if (open < 0) return "";
  const close = findBalancedBraceEnd(latex, open);
  if (close < 0) return "";
  return latex.slice(open + 1, close - 1).trim();
}

function commandEndWithArgs(latex: string, start: number, argCount: number): number {
  let cursor = latex.indexOf("{", start);
  for (let i = 0; i < argCount && cursor >= 0; i += 1) {
    const close = findBalancedBraceEnd(latex, cursor);
    if (close < 0) return latex.length;
    cursor = latex.indexOf("{", close);
    if (i === argCount - 1) return close;
  }
  return start;
}

function collectStarts(latex: string, re: RegExp, from: number, to: number): number[] {
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  copy.lastIndex = from;
  const starts: number[] = [];
  let match: RegExpExecArray | null = copy.exec(latex);
  while (match && match.index < to) {
    if (match.index >= from) starts.push(match.index);
    match = copy.exec(latex);
  }
  return starts;
}

/**
 * Deterministic resume map. LaTeX stays source of truth; this is only a
 * locator index so the model can edit by span id instead of rewriting the file.
 */
export function indexLatex(latex: string): ResumeIndex {
  const spans: ResumeSpan[] = [];
  const beginDoc = latex.search(/\\begin\{document\}/i);
  const endDoc = latex.search(/\\end\{document\}/i);
  const bodyStart = beginDoc >= 0 ? beginDoc + "\\begin{document}".length : 0;
  const bodyEnd = endDoc >= 0 ? endDoc : latex.length;

  if (beginDoc > 0) {
    spans.push({
      id: "preamble",
      kind: "preamble",
      section: "preamble",
      start: 0,
      end: beginDoc,
      preview: previewOf(latex, 0, Math.min(beginDoc, 180)),
    });
  }

  const headerStarts = collectStarts(latex, HEADER_RE, bodyStart, bodyEnd);
  for (const start of headerStarts) {
    const end = Math.min(commandEndWithArgs(latex, start, 2), bodyEnd);
    spans.push({
      id: "header",
      kind: "header",
      section: "header",
      start,
      end,
      preview: previewOf(latex, start, end),
    });
  }

  const sectionStarts = collectStarts(latex, SECTION_RE, bodyStart, bodyEnd);
  const sectionBounds = sectionStarts.map((start, i) => ({
    start,
    end: i + 1 < sectionStarts.length ? sectionStarts[i + 1]! : bodyEnd,
    title: firstArgText(latex, start),
  }));

  const usedSlugs = new Map<string, number>();
  for (const section of sectionBounds) {
    const base = slug(section.title);
    const seen = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, seen + 1);
    const sectionSlug = seen === 0 ? base : `${base}-${seen + 1}`;
    const sectionId = `sec.${sectionSlug}`;
    spans.push({
      id: sectionId,
      kind: "section",
      section: sectionSlug,
      start: section.start,
      end: section.end,
      preview: section.title || previewOf(latex, section.start, section.end),
    });

    const entryStarts = collectStarts(latex, ENTRY_RE, section.start, section.end);
    const entryBounds = entryStarts.map((start, i) => ({
      start,
      end: i + 1 < entryStarts.length ? entryStarts[i + 1]! : section.end,
    }));

    entryBounds.forEach((entry, entryIndex) => {
      const entryId = `${sectionId}.e${entryIndex}`;
      spans.push({
        id: entryId,
        kind: "entry",
        section: sectionSlug,
        start: entry.start,
        end: entry.end,
        preview: previewOf(latex, entry.start, entry.end),
      });
      pushBullets(latex, spans, entry.start, entry.end, entryId, sectionSlug);
    });

    if (entryBounds.length === 0) {
      pushBullets(latex, spans, section.start, section.end, sectionId, sectionSlug);
    }
  }

  return {
    checksum: checksum(latex),
    charCount: latex.length,
    spans,
  };
}

function pushBullets(
  latex: string,
  spans: ResumeSpan[],
  from: number,
  to: number,
  parentId: string,
  section: string,
): void {
  const itemStarts = collectStarts(latex, ITEM_RE, from, to).filter((start) => {
    return start === 0 || !/[A-Za-z]/.test(latex[start - 1] ?? "");
  });
  const resumeStarts = collectStarts(latex, RESUME_ITEM_RE, from, to);
  const starts = [...itemStarts, ...resumeStarts].sort((a, b) => a - b);

  starts.forEach((start, bulletIndex) => {
    let end = to;
    const next = starts[bulletIndex + 1];
    if (next != null) end = Math.min(end, next);
    const endEnv = latex.slice(start, end).search(/\\end\{(?:itemize|enumerate|description)\}/);
    if (endEnv >= 0) end = Math.min(end, start + endEnv);
    spans.push({
      id: `${parentId}.b${bulletIndex}`,
      kind: "bullet",
      section,
      start,
      end,
      preview: previewOf(latex, start, end),
    });
  });
}

export function outlineFromIndex(index: ResumeIndex): ResumeOutlineItem[] {
  return index.spans
    .filter((span) => span.kind !== "preamble")
    .map((span) => ({
      id: span.id,
      kind: span.kind,
      section: span.section,
      preview: span.preview,
    }));
}

export function spanById(index: ResumeIndex, id: string): ResumeSpan | undefined {
  return index.spans.find((span) => span.id === id);
}

/** Detect vibe-edit outputs that deleted unrelated resume content. */

const SECTION_RE = /\\(?:section\*|section)\s*\{([^}]+)\}/gi;
const SUBHEAD_RE = /\\resumeSubheading\s*\{([^}]+)\}/g;

function uniqueMatches(source: string, re: RegExp): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const copy = new RegExp(re.source, re.flags);
  let match: RegExpExecArray | null;
  while ((match = copy.exec(source))) {
    const value = match[1]?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(value);
  }
  return found;
}

/**
 * Returns a heal hint when `nextLatex` dropped existing sections or roles.
 * Null means the edit looks additive / surgical enough to accept.
 */
export function detectContentWipe(originalLatex: string, nextLatex: string): string | null {
  const original = originalLatex.trim();
  const next = nextLatex.trim();
  if (!original || !next) return null;

  const origCompact = original.replace(/\s+/g, "").length;
  const nextCompact = next.replace(/\s+/g, "").length;
  if (origCompact > 400 && nextCompact < Math.floor(origCompact * 0.72)) {
    return "CONTENT_WIPED: the new LaTeX is much shorter than the original. Restore every previous job, bullet, skill, and education entry. Only apply the user's requested change.";
  }

  for (const section of uniqueMatches(original, SECTION_RE)) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\\\(?:section\\*|section)\\s*\\{${escaped}\\}`, "i").test(next)) {
      return `CONTENT_WIPED: missing section "${section}". Keep all existing sections and only change what the user asked.`;
    }
  }

  for (const heading of uniqueMatches(original, SUBHEAD_RE)) {
    if (heading.length < 2) continue;
    if (!next.includes(heading)) {
      return `CONTENT_WIPED: removed existing role or organization "${heading}". Keep it verbatim and add the new experience instead of replacing the whole resume.`;
    }
  }

  return null;
}

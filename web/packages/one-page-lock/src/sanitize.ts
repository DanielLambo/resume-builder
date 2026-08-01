/**
 * Strip or neutralize dangerous TeX before any PDF engine sees it.
 * Complements -no-shell-escape; does not claim to be a full TeX sandbox.
 */
const DANGEROUS_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\\write18\b/gi, label: "\\write18" },
  { pattern: /\\immediate\b/gi, label: "\\immediate" },
  { pattern: /\\openout\b/gi, label: "\\openout" },
  { pattern: /\\closeout\b/gi, label: "\\closeout" },
  { pattern: /\\openin\b/gi, label: "\\openin" },
  { pattern: /\\read\b/gi, label: "\\read" },
  { pattern: /\\input\s*\{?\s*\|/gi, label: "\\input|" },
  { pattern: /\\input\b/gi, label: "\\input" },
  { pattern: /\\include\b/gi, label: "\\include" },
  { pattern: /\\includeonly\b/gi, label: "\\includeonly" },
  { pattern: /\\InputIfFileExists\b/gi, label: "\\InputIfFileExists" },
];

export type SanitizeResult =
  | { ok: true; content: string }
  | { ok: false; content: string; error: string };

export function sanitizeLatex(content: string): SanitizeResult {
  const hits: string[] = [];
  let next = content;
  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(next)) {
      hits.push(label);
      next = next.replace(pattern, `% blocked:${label} `);
    }
    // Reset lastIndex for global regex reuse
    pattern.lastIndex = 0;
  }
  if (hits.length > 0) {
    return {
      ok: false,
      content: next,
      error: `Blocked unsafe LaTeX: ${hits.join(", ")}`,
    };
  }
  return { ok: true, content: next };
}

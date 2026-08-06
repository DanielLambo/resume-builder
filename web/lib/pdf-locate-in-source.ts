/**
 * Map PDF text (from pdf.js getTextContent) back to a 1-based LaTeX source line.
 * Strips common TeX noise so rendered PDF strings can match source.
 */

export function normalizePdfNeedle(raw: string): string {
  return raw
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Collapse LaTeX markup enough to compare against PDF-visible text. */
export function normalizeLatexHaystack(line: string): string {
  let s = line;
  // Drop comments
  const commentIdx = s.indexOf("%");
  if (commentIdx >= 0) s = s.slice(0, commentIdx);
  s = s
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}\[\]$~^_&#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return s;
}

/**
 * Expand a short PDF glyph cluster into a longer searchable phrase using
 * neighboring items on the same visual line.
 */
export function buildPdfSearchPhrase(
  items: ReadonlyArray<{ str: string; x: number; y: number }>,
  index: number,
): string {
  const seed = items[index];
  if (!seed) return "";
  const yTol = 3.5;
  const sameLine = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => Math.abs(item.y - seed.y) <= yTol)
    .sort((a, b) => a.item.x - b.item.x);

  const seedPos = sameLine.findIndex(({ i }) => i === index);
  if (seedPos < 0) return seed.str.trim();

  const start = Math.max(0, seedPos - 2);
  const end = Math.min(sameLine.length, seedPos + 6);
  return sameLine
    .slice(start, end)
    .map(({ item }) => item.str)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function findLatexLineForPdfText(
  latex: string,
  pdfText: string,
): number | null {
  const needle = normalizePdfNeedle(pdfText);
  if (needle.length < 2) return null;

  const lines = latex.replace(/\r\n/g, "\n").split("\n");
  let bestLine: number | null = null;
  let bestScore = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const hay = normalizeLatexHaystack(lines[i] ?? "");
    if (!hay) continue;

    if (hay.includes(needle)) {
      // Prefer longer exact containment (more specific).
      const score = 1000 + needle.length - Math.abs(hay.length - needle.length) * 0.01;
      if (score > bestScore) {
        bestScore = score;
        bestLine = i + 1;
      }
      continue;
    }

    // Fallback: longest shared substring of length >= 6
    if (needle.length >= 6) {
      const shared = longestSharedSubstringLen(hay, needle);
      if (shared >= 6 && shared > bestScore) {
        bestScore = shared;
        bestLine = i + 1;
      }
    }
  }

  return bestLine;
}

function longestSharedSubstringLen(a: string, b: string): number {
  if (!a || !b) return 0;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  let best = 0;
  for (let len = Math.min(short.length, 48); len >= 6; len -= 1) {
    for (let i = 0; i <= short.length - len; i += 1) {
      if (long.includes(short.slice(i, i + len))) {
        return len;
      }
    }
    if (best > 0) break;
  }
  return best;
}

export type PdfTextItem = {
  str: string;
  /** PDF user-space X (origin bottom-left). */
  x: number;
  /** Distance from top of page in PDF points (click-friendly). */
  yFromTop: number;
};

export function nearestPdfTextItem(
  items: ReadonlyArray<PdfTextItem>,
  pdfX: number,
  pdfYFromTop: number,
  maxDist = 48,
): number | null {
  let bestIdx: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || !item.str.trim()) continue;
    const d = Math.abs(pdfX - item.x) + Math.abs(pdfYFromTop - item.yFromTop) * 1.4;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx == null || bestDist > maxDist) return null;
  return bestIdx;
}

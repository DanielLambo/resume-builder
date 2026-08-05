/**
 * Line Overflow & Orphan Detector — pure string analysis, no PDF I/O.
 * Estimates wrap from character count so the heatmap stays off the compile path.
 */

export type OrphanBullet = {
  /** Index among extracted bullets (stable for this latex snapshot). */
  index: number;
  /** Raw item body (without leading command / braces). */
  text: string;
  /** Absolute start offset of the item command in the source. */
  start: number;
  /** Absolute end offset (exclusive) of the item span (command + body). */
  end: number;
  /** Which command produced this bullet. */
  kind: "item" | "resumeItem";
  charCount: number;
  estimatedLines: number;
  /** Characters estimated on the final wrapped line. */
  trailingChars: number;
  /** Words estimated on the final wrapped line. */
  trailingWords: number;
  orphanRisk: boolean;
};

export type OrphanAnalysis = {
  bullets: OrphanBullet[];
  orphanCount: number;
  lineWidth: number;
};

/** Typical usable width for 10–11pt letter resumes with ~0.5–0.6in margins. */
export const DEFAULT_LINE_WIDTH = 90;

/** Final-line leftovers shorter than this are treated as orphan risk. */
export const ORPHAN_TRAILING_THRESHOLD = 18;

/** Orphans are short wraps — cap trailing words so long soft wraps aren't flagged. */
export const ORPHAN_TRAILING_WORD_MAX = 3;

const ITEM_CMD_RE = /\\item\b(?:\[[^\]]*\])?\s*/g;
const RESUME_ITEM_CMD_RE = /\\resumeItem\s*\{/g;

type ExtractedItem = {
  index: number;
  text: string;
  start: number;
  end: number;
  kind: "item" | "resumeItem";
};

/** Human-readable bullet text for UI (keeps %, ×, etc.). */
export function latexToDisplayText(raw: string): string {
  return raw
    .replace(/\\%/g, "%")
    .replace(/\\\$/g, "$")
    .replace(/\\&/g, "&")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\{/g, "{")
    .replace(/\\}/g, "}")
    .replace(/\\times\b/g, "×")
    .replace(/\\cdot\b/g, "·")
    .replace(/\\sim\b/g, "~")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, "")
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\{([^{}]*)\}/g, "$1")
    .replace(/~/g, " ")
    .replace(/\\\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLatexNoise(raw: string): string {
  return latexToDisplayText(raw);
}

function estimateWrap(
  plain: string,
  lineWidth: number,
): {
  estimatedLines: number;
  trailingChars: number;
  trailingWords: number;
} {
  const plainLen = plain.length;
  if (plainLen <= 0) {
    return { estimatedLines: 0, trailingChars: 0, trailingWords: 0 };
  }
  if (plainLen <= lineWidth) {
    const words = plain.split(/\s+/).filter(Boolean).length;
    return {
      estimatedLines: 1,
      trailingChars: plainLen,
      trailingWords: words,
    };
  }
  const fullLines = Math.floor(plainLen / lineWidth);
  const trailing = plainLen % lineWidth;
  if (trailing === 0) {
    return {
      estimatedLines: fullLines,
      trailingChars: lineWidth,
      trailingWords: plain.slice(-lineWidth).split(/\s+/).filter(Boolean).length,
    };
  }
  const trailingText = plain.slice(plainLen - trailing);
  return {
    estimatedLines: fullLines + 1,
    trailingChars: trailing,
    trailingWords: trailingText.split(/\s+/).filter(Boolean).length,
  };
}

function findBalancedBraceEnd(latex: string, openBraceIndex: number): number {
  if (latex[openBraceIndex] !== "{") return -1;
  let depth = 0;
  for (let i = openBraceIndex; i < latex.length; i += 1) {
    const ch = latex[i];
    if (ch === "\\" && i + 1 < latex.length) {
      i += 1; // skip escaped char
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

function extractBareItems(latex: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const re = new RegExp(ITEM_CMD_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(latex)) !== null) {
    const commandStart = match.index;
    const bodyStart = commandStart + match[0].length;

    // Skip false positives inside longer command names (defensive).
    if (commandStart > 0 && /[A-Za-z]/.test(latex[commandStart - 1] ?? "")) {
      continue;
    }

    let bodyEnd = latex.length;
    const from = latex.slice(bodyStart).search(/\\item\b/);
    const nextItemAfter = from === -1 ? -1 : bodyStart + from;
    const endEnvMatch = latex
      .slice(bodyStart)
      .match(/\\end\{(?:itemize|enumerate|description)\}/);
    const endEnvAfter =
      endEnvMatch && typeof endEnvMatch.index === "number"
        ? bodyStart + endEnvMatch.index
        : -1;
    const resumeItemAfter = (() => {
      const m = latex.slice(bodyStart).search(/\\resumeItem\b/);
      return m === -1 ? -1 : bodyStart + m;
    })();

    const candidates = [nextItemAfter, endEnvAfter, resumeItemAfter].filter(
      (n) => n > bodyStart,
    );
    if (candidates.length > 0) {
      bodyEnd = Math.min(...candidates);
    }

    const blank = latex.slice(bodyStart, bodyEnd).search(/\n\s*\n/);
    if (blank >= 0) {
      bodyEnd = Math.min(bodyEnd, bodyStart + blank);
    }

    const text = latex.slice(bodyStart, bodyEnd).trim();
    if (!text) continue;

    items.push({
      index: 0,
      text,
      start: commandStart,
      end: bodyEnd,
      kind: "item",
    });
  }

  return items;
}

function extractResumeItems(latex: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const re = new RegExp(RESUME_ITEM_CMD_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(latex)) !== null) {
    const commandStart = match.index;
    const openBrace = commandStart + match[0].length - 1;
    const end = findBalancedBraceEnd(latex, openBrace);
    if (end < 0) continue;
    const text = latex.slice(openBrace + 1, end - 1).trim();
    if (!text) continue;
    items.push({
      index: 0,
      text,
      start: commandStart,
      end,
      kind: "resumeItem",
    });
  }

  return items;
}

/**
 * Extract bullet bodies with a lightweight scan.
 * Supports `\item ...` and Jake-style `\resumeItem{...}`.
 * Exotic environments fall back to next command / env end.
 */
export function extractItems(latex: string): ExtractedItem[] {
  try {
    const merged = [...extractBareItems(latex), ...extractResumeItems(latex)].sort(
      (a, b) => a.start - b.start || a.end - b.end,
    );

    // Drop nested duplicates (e.g. `\item` found inside a resumeItem body — rare).
    const filtered: ExtractedItem[] = [];
    for (const item of merged) {
      const inside = filtered.some(
        (prev) => item.start >= prev.start && item.end <= prev.end,
      );
      if (inside) continue;
      filtered.push(item);
    }

    return filtered.map((item, index) => ({ ...item, index }));
  } catch {
    return [];
  }
}

export function analyzeOrphans(
  latex: string,
  options: { lineWidth?: number; trailingThreshold?: number } = {},
): OrphanAnalysis {
  const lineWidth = options.lineWidth ?? DEFAULT_LINE_WIDTH;
  const threshold = options.trailingThreshold ?? ORPHAN_TRAILING_THRESHOLD;

  try {
    const extracted = extractItems(latex);
    const bullets: OrphanBullet[] = extracted.map((item) => {
      const plain = stripLatexNoise(item.text);
      const charCount = plain.length;
      const { estimatedLines, trailingChars, trailingWords } = estimateWrap(
        plain,
        lineWidth,
      );
      const orphanRisk =
        estimatedLines >= 2 &&
        trailingChars > 0 &&
        trailingChars < threshold &&
        trailingWords > 0 &&
        trailingWords <= ORPHAN_TRAILING_WORD_MAX;

      return {
        index: item.index,
        text: item.text,
        start: item.start,
        end: item.end,
        kind: item.kind,
        charCount,
        estimatedLines,
        trailingChars,
        trailingWords,
        orphanRisk,
      };
    });

    return {
      bullets,
      orphanCount: bullets.filter((b) => b.orphanRisk).length,
      lineWidth,
    };
  } catch {
    return { bullets: [], orphanCount: 0, lineWidth };
  }
}

/**
 * Replace a single bullet body while preserving surrounding whitespace /
 * braces so sibling items keep their indentation.
 */
export function replaceItemText(
  latex: string,
  item: Pick<OrphanBullet, "start" | "end" | "text" | "kind">,
  nextBody: string,
): string {
  const trimmed = nextBody.trim();
  if (!trimmed) return latex;

  if (item.kind === "resumeItem") {
    const open = latex.indexOf("{", item.start);
    if (open < 0 || open >= item.end) return latex;
    const close = item.end - 1;
    if (latex[close] !== "}") return latex;
    const region = latex.slice(open + 1, close);
    const idx = region.indexOf(item.text);
    if (idx >= 0) {
      return (
        latex.slice(0, open + 1 + idx) +
        trimmed +
        latex.slice(open + 1 + idx + item.text.length)
      );
    }
    return latex.slice(0, open + 1) + trimmed + latex.slice(close);
  }

  const commandMatch = latex
    .slice(item.start)
    .match(/^\\item\b(?:\[[^\]]*\])?\s*/);
  const commandLen = commandMatch?.[0]?.length ?? 0;
  const bodyStart = item.start + commandLen;
  const region = latex.slice(bodyStart, item.end);
  const idx = region.indexOf(item.text);
  if (idx >= 0) {
    return (
      latex.slice(0, bodyStart + idx) +
      trimmed +
      latex.slice(bodyStart + idx + item.text.length)
    );
  }

  // Fallback: keep original leading/trailing whitespace in the body span.
  const lead = region.match(/^\s*/)?.[0] ?? "";
  const trail = region.match(/\s*$/)?.[0] ?? "";
  return (
    latex.slice(0, bodyStart) + lead + trimmed + trail + latex.slice(item.end)
  );
}

const SAFE_FILLERS =
  /\b(effectively|successfully|various|numerous|carefully|really|very|respectively|currently|actively)\b/gi;
const ORDER_TO = /\bin order to\b/gi;

/**
 * Offline shorten: drop filler adverbs / "in order to", else trim 2–3
 * trailing plain words without nuking articles.
 */
export function mockShortenBullet(text: string): string {
  let next = text.replace(ORDER_TO, "to").replace(SAFE_FILLERS, " ");
  next = next.replace(/[ \t]{2,}/g, " ").replace(/ \n/g, "\n").trim();

  if (next.length <= text.length - 8 && next.length > 0) {
    return next;
  }

  const plain = stripLatexNoise(text);
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length <= 6) {
    return next.length > 0 && next !== text ? next : text;
  }

  const drop = Math.min(3, Math.max(2, words.length - 6));
  const trimmedPlain = words.slice(0, words.length - drop).join(" ");
  if (text.includes(plain)) {
    return text.replace(plain, trimmedPlain);
  }
  // Don't invent a plain-only body — that strips macros like $…$ / \times.
  return next.length > 0 && next !== text ? next : text;
}

/** True when the micro-edit actually shortened the visible plain text. */
export function didShortenBullet(before: string, after: string): boolean {
  const a = stripLatexNoise(before);
  const b = stripLatexNoise(after);
  if (!b) return false;
  return b.length < a.length || b.split(/\s+/).length < a.split(/\s+/).length;
}

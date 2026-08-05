export type LatexDiffHunk = {
  before: string;
  after: string;
};

export type LatexDiffSummary = {
  changedLineCount: number;
  hunks: LatexDiffHunk[];
};

function significantLines(latex: string): string[] {
  return latex
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%"));
}

/** Compact line-level diff for the proposal UI — not a full patch viewer. */
export function summarizeLatexDiff(before: string, after: string): LatexDiffSummary {
  if (before === after) {
    return { changedLineCount: 0, hunks: [] };
  }

  const a = significantLines(before);
  const b = significantLines(after);
  const aSet = new Set(a);
  const bSet = new Set(b);
  const removed = a.filter((line) => !bSet.has(line));
  const added = b.filter((line) => !aSet.has(line));
  const changedLineCount = removed.length + added.length;
  const hunks: LatexDiffHunk[] = [];
  const pairs = Math.max(removed.length, added.length);
  for (let i = 0; i < Math.min(pairs, 4); i += 1) {
    hunks.push({
      before: removed[i] ?? "",
      after: added[i] ?? "",
    });
  }
  return { changedLineCount, hunks };
}

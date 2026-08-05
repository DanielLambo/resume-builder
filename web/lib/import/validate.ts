import { HOUSE_LATEX_PREAMBLE } from "@/lib/resume-template";

function unescapedBraceDelta(text: string): number {
  let opens = 0;
  let closes = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\\" && i + 1 < text.length) {
      i += 1;
      continue;
    }
    if (text[i] === "{") opens += 1;
    else if (text[i] === "}") closes += 1;
  }
  return opens - closes;
}

export function latexValidationError(latex: string): string | null {
  const text = latex.trim();
  if (!text) return "LaTeX is empty.";
  if (!/\\documentclass/.test(text)) return "LaTeX missing \\documentclass";
  if (!/\\begin\{document\}/.test(text) || !/\\end\{document\}/.test(text)) {
    return "LaTeX missing document environment";
  }
  if (/\\write18|\\immediate\s*\\write|\\openout/.test(text)) {
    return "LaTeX contains blocked shell escapes";
  }
  // Ignore \\{ \\} literals — naive \{ counts false-flagged Jake resumes.
  if (Math.abs(unescapedBraceDelta(text)) > 8) {
    return "LaTeX looks incomplete (unbalanced braces). Re-import or fix the source.";
  }
  return null;
}

/**
 * Imported / AI latex often uses \\headerblock without defining it.
 * When house commands appear in the body but macros are missing, keep the
 * document body and attach the Resumate preamble.
 */
export function ensureHousePreamble(latex: string): string {
  const text = latex.trim();
  if (!text) return text;

  const beginMatch = /\\begin\{document\}/.exec(text);
  if (!beginMatch || beginMatch.index == null) return text;

  const body = text.slice(beginMatch.index);
  const usesHouseCmds =
    /\\headerblock\s*\{/.test(body) || /\\entry\s*\{/.test(body);
  if (!usesHouseCmds) return text;

  const hasHeaderMacro = /\\newcommand\{\\headerblock\}/.test(text);
  const hasEntryMacro = /\\newcommand\{\\entry\}/.test(text);
  if (hasHeaderMacro && hasEntryMacro) return text;

  return `${HOUSE_LATEX_PREAMBLE}\n${body}`;
}

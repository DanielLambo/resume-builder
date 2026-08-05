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
  return null;
}

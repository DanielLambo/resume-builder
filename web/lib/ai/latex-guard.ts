/**
 * Strict-enough LaTeX sanity checks before trusting model output.
 * Returns null when OK, otherwise a healable error string.
 */
export function validateResumeLatex(
  latex: unknown,
  priorLatex?: string,
): string | null {
  if (typeof latex !== "string" || !latex.trim()) {
    return "data_json.latex missing or empty";
  }
  if (!/\\documentclass/.test(latex)) {
    return "LaTeX missing \\documentclass";
  }
  if (!/\\begin\{document\}/.test(latex) || !/\\end\{document\}/.test(latex)) {
    return "LaTeX missing document environment";
  }
  if (/\\write18|\\immediate\s*\\write|\\openout|\\input\s*\{/.test(latex)) {
    return "LaTeX contains blocked shell escapes or \\input";
  }
  // Unbalanced $ is a common model footgun in resumes.
  const dollarCount = (latex.match(/(?<!\\)\$/g) ?? []).length;
  if (dollarCount % 2 !== 0) {
    return "LaTeX has unbalanced $ math delimiters";
  }

  if (priorLatex) {
    const priorClass = priorLatex.match(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/);
    const nextClass = latex.match(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/);
    if (priorClass && nextClass && priorClass[0] !== nextClass[0]) {
      return "LaTeX \\documentclass was changed unexpectedly";
    }

    // Catastrophic shrink usually means the model returned a fragment.
    // Only enforce on realistically sized resumes so short fixtures don't trip it.
    if (
      priorLatex.length >= 800 &&
      latex.length < Math.floor(priorLatex.length * 0.45)
    ) {
      return "LaTeX shrank too much — likely truncated output";
    }

    const priorSections = priorLatex.match(/\\section\*?\{[^}]+\}/g)?.length ?? 0;
    const nextSections = latex.match(/\\section\*?\{[^}]+\}/g)?.length ?? 0;
    if (priorSections >= 2 && nextSections === 0) {
      return "LaTeX lost all \\section headings";
    }
  }

  return null;
}

export function extractLatexFromDataJson(
  dataJson: Record<string, unknown>,
): string {
  return typeof dataJson.latex === "string" ? dataJson.latex : "";
}

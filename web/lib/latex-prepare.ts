import {
  jakeToHouseLatex,
  looksLikeJakeTemplate,
  planTexImport,
  softenJakeSource,
} from "@/lib/import/tex";
import { latexValidationError } from "@/lib/import/validate";

export type PrepareCompileResult = {
  latex: string;
  /** True when Jake macros were rewritten to the house template. */
  convertedFromJake: boolean;
};

export { softenJakeSource, looksLikeJakeTemplate };

/**
 * Make pasted / imported TeX more likely to compile on Resumate's TeX host.
 * Jake's fullpage/titlesec stack is rewritten to the house preamble.
 * Prefer best-effort house output over failing the compile.
 */
export function prepareLatexForCompile(tex: string): PrepareCompileResult {
  const trimmed = tex.trim();
  if (!trimmed) {
    throw new Error("Resume source is empty.");
  }

  if (looksLikeJakeTemplate(trimmed)) {
    const softened = softenJakeSource(trimmed);
    const plan = planTexImport(softened);
    if (plan.mode === "jake") {
      return { latex: plan.latex, convertedFromJake: true };
    }

    const fallback = jakeToHouseLatex(softened);
    const err = latexValidationError(fallback);
    if (!err && !/\\resume[A-Z]/.test(fallback)) {
      return { latex: fallback, convertedFromJake: true };
    }

    throw new Error(
      err ??
        "This Jake-style resume has broken braces or macros. Tap Fix with AI, or use Import resume.",
    );
  }

  const latex = trimmed
    .replace(/\\input\{glyphtounicode\}/gi, "")
    .replace(/\\pdfgentounicode\s*=\s*1/gi, "");

  return { latex, convertedFromJake: false };
}

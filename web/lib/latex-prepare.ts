import { planTexImport, softenJakeSource } from "@/lib/import/tex";

const JAKE_MARKERS =
  /\\resumeItem\b|\\resumeSubheading\b|\\resumeSubHeadingListStart\b|\\resumeProjectHeading\b/;

export type PrepareCompileResult = {
  latex: string;
  /** True when Jake macros were rewritten to the house template. */
  convertedFromJake: boolean;
};

export { softenJakeSource };

/**
 * Make pasted / imported TeX more likely to compile on Resumate's TeX host.
 * Jake's fullpage/titlesec stack is rewritten to the house preamble.
 */
export function prepareLatexForCompile(tex: string): PrepareCompileResult {
  const trimmed = tex.trim();
  if (!trimmed) {
    throw new Error("Resume source is empty.");
  }

  if (JAKE_MARKERS.test(trimmed)) {
    const softened = softenJakeSource(trimmed);
    const plan = planTexImport(softened);
    if (plan.mode === "jake") {
      return { latex: plan.latex, convertedFromJake: true };
    }
    throw new Error(
      "This Jake-style resume has broken braces or macros. Tap Fix with AI, or use Import resume.",
    );
  }

  const latex = trimmed
    .replace(/\\input\{glyphtounicode\}/gi, "")
    .replace(/\\pdfgentounicode\s*=\s*1/gi, "");

  return { latex, convertedFromJake: false };
}

import { type FitToSinglePageOptions, type FitToSinglePageResult } from "./schema.js";
/**
 * 1-Page Lock auto-fitting engine.
 *
 * 1. Compile with default spacing.
 * 2. If already 1 page, return.
 * 3. Up to 4 binary-search iterations on a tightness axis (list gaps → leading → margins).
 * 4. If still overflow, Groq micro-condenses bullets, then final compile.
 *
 * On compile errors, reverts to the last valid PDF + config. Hard timeout defaults to 5s.
 */
export declare function fitToSinglePage(rawTex: string, options?: FitToSinglePageOptions): Promise<FitToSinglePageResult>;
//# sourceMappingURL=fitToSinglePage.d.ts.map
import { z } from "zod";
export declare const LaTeXLayoutConfigSchema: z.ZodObject<{
    topBottomMargin: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
    leftRightMargin: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
    lineSpacing: z.ZodDefault<z.ZodNumber>;
    itemSep: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
    parsep: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
}, "strict", z.ZodTypeAny, {
    topBottomMargin: string;
    leftRightMargin: string;
    lineSpacing: number;
    itemSep: string;
    parsep: string;
}, {
    topBottomMargin?: string | undefined;
    leftRightMargin?: string | undefined;
    lineSpacing?: number | undefined;
    itemSep?: string | undefined;
    parsep?: string | undefined;
}>;
export type LaTeXLayoutConfig = z.infer<typeof LaTeXLayoutConfigSchema>;
export declare const DEFAULT_LAYOUT_CONFIG: LaTeXLayoutConfig;
/** Tightest layout the spacing search is allowed to reach. */
export declare const MAX_TIGHT_LAYOUT_CONFIG: LaTeXLayoutConfig;
export declare const GroqCondenseResponseSchema: z.ZodObject<{
    latex: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    latex: string;
    notes?: string | undefined;
}, {
    latex: string;
    notes?: string | undefined;
}>;
export type GroqCondenseResponse = z.infer<typeof GroqCondenseResponseSchema>;
export type CompileLatexFn = (tex: string) => Promise<Buffer>;
export type FitToSinglePageResult = {
    compiledPdf: Buffer;
    finalConfig: LaTeXLayoutConfig;
};
export type FitToSinglePageOptions = {
    compile?: CompileLatexFn;
    timeoutMs?: number;
    maxSpacingIterations?: number;
    groqApiKey?: string;
    groqBaseUrl?: string;
    model?: string;
    logger?: Pick<Console, "warn" | "error" | "info">;
};
//# sourceMappingURL=schema.d.ts.map
import { z } from "zod";

/** Inch margins accepted by geometry (e.g. "0.5in"). */
const inchMarginSchema = z
  .string()
  .regex(/^0\.\d{1,3}in$/, "Expected margin like 0.5in")
  .refine((v) => {
    const n = Number.parseFloat(v);
    return n >= 0.3 && n <= 0.75;
  }, "Margin must be between 0.3in and 0.75in");

/** pt lengths for list spacing (e.g. "1pt", "-2pt"). */
const ptLengthSchema = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?pt$/, "Expected length like 1pt or -2pt");

export const LaTeXLayoutConfigSchema = z
  .object({
    topBottomMargin: inchMarginSchema.default("0.5in"),
    leftRightMargin: inchMarginSchema.default("0.5in"),
    lineSpacing: z.number().min(0.9).max(1.15).default(1.0),
    itemSep: ptLengthSchema
      .refine((v) => {
        const n = Number.parseFloat(v);
        return n >= -2 && n <= 4;
      }, "itemSep must be between -2pt and 4pt")
      .default("1pt"),
    parsep: ptLengthSchema
      .refine((v) => {
        const n = Number.parseFloat(v);
        return n >= 0 && n <= 2;
      }, "parsep must be between 0pt and 2pt")
      .default("1pt"),
  })
  .strict();

export type LaTeXLayoutConfig = z.infer<typeof LaTeXLayoutConfigSchema>;

export const DEFAULT_LAYOUT_CONFIG: LaTeXLayoutConfig = LaTeXLayoutConfigSchema.parse({});

/** Tightest layout the spacing search is allowed to reach. */
export const MAX_TIGHT_LAYOUT_CONFIG: LaTeXLayoutConfig = LaTeXLayoutConfigSchema.parse({
  topBottomMargin: "0.35in",
  leftRightMargin: "0.4in",
  lineSpacing: 0.92,
  itemSep: "-2pt",
  parsep: "0pt",
});

export const GroqCondenseResponseSchema = z
  .object({
    latex: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();

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

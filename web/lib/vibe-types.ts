import { z } from "zod";

export type VibeEditModelOutput = {
  reply: string;
  data_json: Record<string, unknown> & { latex: string };
};

const VibeEditRawSchema = z.object({
  reply: z.string().min(1),
  latex: z.string().optional(),
  data_json: z.record(z.string(), z.unknown()).optional(),
});

export const VibeEditModelOutputSchema = VibeEditRawSchema.transform(
  (value, ctx): VibeEditModelOutput => {
    const nestedLatex =
      value.data_json && typeof value.data_json.latex === "string"
        ? value.data_json.latex
        : "";
    const latex = (value.latex?.trim() ? value.latex : nestedLatex).trim();
    if (!latex) {
      ctx.addIssue({ code: "custom", message: "latex missing" });
      return z.NEVER;
    }
    return {
      reply: value.reply,
      data_json: {
        ...(value.data_json ?? {}),
        latex,
      },
    };
  },
);

export function latexFromVibeOutput(output: VibeEditModelOutput): string {
  return output.data_json.latex;
}

export type GroqVibeEditResult = {
  output: VibeEditModelOutput;
  totalTokens: number;
  healed?: boolean;
};

import { z } from "zod";

import type { EditIntent } from "@/lib/ai/resume-context";

export const VibeEditModelOutputSchema = z.object({
  data_json: z.record(z.string(), z.unknown()),
  reply: z.string().min(1),
});

export type VibeEditModelOutput = z.infer<typeof VibeEditModelOutputSchema>;

export type GroqVibeEditResult = {
  output: VibeEditModelOutput;
  totalTokens: number;
  healed?: boolean;
  intent?: EditIntent;
  /** False for advice-only reviews that preserved source TeX. */
  latexChanged?: boolean;
};

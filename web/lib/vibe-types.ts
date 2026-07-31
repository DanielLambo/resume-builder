import { z } from "zod";

export const VibeEditModelOutputSchema = z.object({
  data_json: z.record(z.string(), z.unknown()),
  reply: z.string().min(1),
});

export type VibeEditModelOutput = z.infer<typeof VibeEditModelOutputSchema>;

export type GroqVibeEditResult = {
  output: VibeEditModelOutput;
  totalTokens: number;
  healed?: boolean;
};

import { z } from "zod";

export const AiHistoryEntrySchema = z.object({
  latex: z.string().min(1),
  reply: z.string().default(""),
  prompt: z.string().default(""),
  at: z.string().datetime(),
});

export type AiHistoryEntry = z.infer<typeof AiHistoryEntrySchema>;

export const MAX_AI_HISTORY = 10;

export function pushAiHistory(
  existing: unknown,
  entry: AiHistoryEntry,
  max = MAX_AI_HISTORY,
): AiHistoryEntry[] {
  const prior = Array.isArray(existing)
    ? existing
        .map((item) => AiHistoryEntrySchema.safeParse(item))
        .filter((r) => r.success)
        .map((r) => r.data)
    : [];
  return [...prior, entry].slice(-max);
}

export function parseAiHistory(value: unknown): AiHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => AiHistoryEntrySchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
}

/** Client-side ring buffer for instant Prev/Next without a round trip. */
export type LocalAiSnapshot = {
  latex: string;
  reply: string | null;
  prompt: string;
  at: number;
};

export function appendLocalSnapshot(
  stack: LocalAiSnapshot[],
  index: number,
  next: LocalAiSnapshot,
  max = MAX_AI_HISTORY,
): { stack: LocalAiSnapshot[]; index: number } {
  const trimmed = stack.slice(0, Math.max(0, index + 1));
  const stacked = [...trimmed, next].slice(-max);
  return { stack: stacked, index: stacked.length - 1 };
}

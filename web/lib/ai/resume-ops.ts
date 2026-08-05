import { z } from "zod";

import { spanById, type ResumeIndex } from "@/lib/ai/resume-index";

export const ResumeOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace_span"),
    id: z.string().trim().min(1).max(80),
    text: z.string().min(1).max(20_000),
  }),
  z.object({
    op: z.literal("insert_after"),
    id: z.string().trim().min(1).max(80),
    text: z.string().min(1).max(20_000),
  }),
  z.object({
    op: z.literal("insert_before"),
    id: z.string().trim().min(1).max(80),
    text: z.string().min(1).max(20_000),
  }),
  z.object({
    op: z.literal("delete_span"),
    id: z.string().trim().min(1).max(80),
  }),
  z.object({
    op: z.literal("replace_full"),
    latex: z.string().min(40).max(400_000),
  }),
]);

export type ResumeOp = z.infer<typeof ResumeOpSchema>;

const BLOCKED_TEX = /\\write18|\\immediate\s*\\write|\\openout/;

export function assertSafeOpText(text: string): void {
  if (BLOCKED_TEX.test(text)) {
    throw new Error("APPLY_FAILED: blocked unsafe LaTeX in op text");
  }
}

export function applyResumeOps(
  latex: string,
  index: ResumeIndex,
  ops: ResumeOp[],
): string {
  if (ops.length === 0) {
    throw new Error("APPLY_FAILED: no ops");
  }

  const full = ops.find((op) => op.op === "replace_full");
  if (full && full.op === "replace_full") {
    assertSafeOpText(full.latex);
    return full.latex;
  }

  const resolved = ops.map((op) => {
    if (op.op === "replace_full") return { op, start: 0, end: latex.length };
    const span = spanById(index, op.id);
    if (!span) {
      throw new Error(`APPLY_FAILED: unknown span ${op.id}`);
    }
    return { op, start: span.start, end: span.end };
  });

  resolved.sort((a, b) => b.start - a.start);

  let next = latex;
  for (const item of resolved) {
    if (item.op.op === "replace_full") continue;
    if (item.op.op === "delete_span") {
      next = `${next.slice(0, item.start)}${next.slice(item.end)}`;
      continue;
    }
    assertSafeOpText(item.op.text);
    if (item.op.op === "replace_span") {
      next = `${next.slice(0, item.start)}${item.op.text}${next.slice(item.end)}`;
      continue;
    }
    if (item.op.op === "insert_after") {
      const insertion = item.op.text.startsWith("\n") ? item.op.text : `\n${item.op.text}`;
      next = `${next.slice(0, item.end)}${insertion}${next.slice(item.end)}`;
      continue;
    }
    const insertion = item.op.text.endsWith("\n") ? item.op.text : `${item.op.text}\n`;
    next = `${next.slice(0, item.start)}${insertion}${next.slice(item.start)}`;
  }
  return next;
}

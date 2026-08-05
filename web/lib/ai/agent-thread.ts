import { z } from "zod";

import { clipText } from "@/lib/ai/tokens";

export const AgentTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(800),
  at: z.string().datetime(),
});

export type AgentTurn = z.infer<typeof AgentTurnSchema>;

export const AgentThreadSchema = z.object({
  summary: z.string().max(500).default(""),
  turns: z.array(AgentTurnSchema).max(24).default([]),
});

export type AgentThread = z.infer<typeof AgentThreadSchema>;

export const EMPTY_AGENT_THREAD: AgentThread = { summary: "", turns: [] };

export const MAX_STORED_TURNS = 12;
export const MAX_PROMPT_TURNS = 6;

export function parseAgentThread(value: unknown): AgentThread {
  const parsed = AgentThreadSchema.safeParse(value);
  if (!parsed.success) return { ...EMPTY_AGENT_THREAD };
  return parsed.data;
}

export function pushAgentTurns(
  thread: AgentThread,
  userText: string,
  assistantText: string,
  at = new Date().toISOString(),
): AgentThread {
  const incoming: AgentTurn[] = [
    { role: "user", text: clipText(userText, 400), at },
    { role: "assistant", text: clipText(assistantText, 400), at },
  ];
  const combined = [...thread.turns, ...incoming];
  if (combined.length <= MAX_STORED_TURNS) {
    return { summary: thread.summary, turns: combined };
  }

  const overflow = combined.slice(0, combined.length - MAX_STORED_TURNS);
  const kept = combined.slice(-MAX_STORED_TURNS);
  const folded = overflow
    .map((turn) => `${turn.role === "user" ? "U" : "A"}: ${clipText(turn.text, 80)}`)
    .join(" · ");
  const summary = clipText([thread.summary, folded].filter(Boolean).join(" · "), 500);
  return { summary, turns: kept };
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Last N text turns only — never latex snapshots. */
export function threadToChatMessages(
  thread: AgentThread,
  limit = MAX_PROMPT_TURNS,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (thread.summary.trim()) {
    messages.push({
      role: "system",
      content: `Earlier conversation summary (do not repeat latex): ${thread.summary.trim()}`,
    });
  }
  for (const turn of thread.turns.slice(-limit)) {
    messages.push({
      role: turn.role,
      content: turn.text,
    });
  }
  return messages;
}

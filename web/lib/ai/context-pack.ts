import {
  outlineFromIndex,
  type ResumeIndex,
  type ResumeSpan,
} from "@/lib/ai/resume-index";
import {
  threadToChatMessages,
  type AgentThread,
  type ChatMessage,
} from "@/lib/ai/agent-thread";
import { selectSpansForPrompt } from "@/lib/ai/span-router";
import { estimateTokens } from "@/lib/ai/tokens";

/** Stable across users — keep byte-identical for Groq prefix caching. */
export const VIBE_EDITOR_SYSTEM = [
  "You are Resumate's resume editor.",
  "Edit surgically. Never invent employers, dates, titles, schools, tools, or metrics.",
  "Never delete unrelated jobs, bullets, education, skills, or sections.",
  "Prefer ops that touch one span. Use insert_after to add a role.",
  'Return JSON only: {"reply":"one sentence","ops":[...]}',
  'Ops: {"op":"replace_span","id":"...","text":"..."} | insert_after | insert_before | delete_span | {"op":"replace_full","latex":"..."}.',
  "replace_full is last resort (compile repair or global rewrite).",
  "Escape backslashes in JSON strings.",
].join(" ");

export const REVIEW_SYSTEM = [
  "You are Resumate's resume reviewer.",
  "Analysis only. Do not rewrite LaTeX. Do not invent facts.",
  "Ground every claim in the provided resume text.",
  "Return JSON only matching:",
  JSON.stringify({
    targetRole: "string|null",
    fitScore: "1-10",
    summary: "2-4 sentence verdict",
    strengths: [{ title: "string", detail: "string" }],
    gaps: [{ title: "string", detail: "string", severity: "high|medium|low" }],
    bulletAdvice: [{ quote: "string", issue: "string", suggestion: "string" }],
    keywordGaps: ["string"],
    actionItems: ["string"],
    reply: "short UI blurb",
  }),
].join(" ");

const PROMPT_TOKEN_BUDGET = 3000;

export type ContextPack = {
  messages: ChatMessage[];
  focusedIds: string[];
  completionBudget: number;
  estimatedPromptTokens: number;
  needsFullDocument: boolean;
};

function packFocusedSpans(
  latex: string,
  focused: ResumeSpan[],
  budgetTokens: number,
): Array<{ id: string; text: string }> {
  const packed: Array<{ id: string; text: string }> = [];
  let used = 0;
  const ordered = [...focused].sort((a, b) => {
    const rank = (kind: ResumeSpan["kind"]) =>
      kind === "entry" ? 0 : kind === "header" ? 1 : kind === "section" ? 2 : 3;
    return rank(a.kind) - rank(b.kind);
  });

  for (const span of ordered) {
    const text = latex.slice(span.start, span.end);
    const cost = estimateTokens(text) + 8;
    if (used + cost > budgetTokens && packed.length > 0) break;
    packed.push({ id: span.id, text });
    used += cost;
  }
  return packed;
}

export function buildEditContextPack(input: {
  latex: string;
  index: ResumeIndex;
  prompt: string;
  thread: AgentThread;
  writingProfileNote?: string;
  healHint?: string;
}): ContextPack {
  const selection = selectSpansForPrompt(input.prompt, input.index);
  const outline = outlineFromIndex(input.index);
  const history = threadToChatMessages(input.thread);
  const historyTokens = history.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
  const outlineTokens = estimateTokens(JSON.stringify(outline));
  const reserved =
    estimateTokens(VIBE_EDITOR_SYSTEM) +
    historyTokens +
    outlineTokens +
    estimateTokens(input.prompt) +
    estimateTokens(input.writingProfileNote ?? "") +
    180;
  const spanBudget = Math.max(400, PROMPT_TOKEN_BUDGET - reserved);
  const spans = packFocusedSpans(input.latex, selection.focused, spanBudget);

  const userPayload: Record<string, unknown> = {
    task: input.prompt,
    outline,
    spans,
  };
  if (input.writingProfileNote?.trim()) {
    userPayload.profile = input.writingProfileNote.trim();
  }
  if (input.healHint?.trim()) {
    userPayload.heal = input.healHint.trim();
    userPayload.instruction =
      "Previous ops failed validation. Fix with valid ops, or replace_full if the document is broken.";
  }
  if (selection.needsFullDocument) {
    userPayload.full_latex = input.latex;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: VIBE_EDITOR_SYSTEM },
    ...history,
    { role: "user", content: JSON.stringify(userPayload) },
  ];

  const estimatedPromptTokens = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    24,
  );
  const completionBudget = selection.needsFullDocument
    ? Math.max(700, Math.min(2400, 7200 - estimatedPromptTokens))
    : selection.global
      ? 1400
      : 900;

  return {
    messages,
    focusedIds: spans.map((span) => span.id),
    completionBudget,
    estimatedPromptTokens,
    needsFullDocument: selection.needsFullDocument,
  };
}

export function buildReviewContextPack(input: {
  resumeBody: string;
  prompt: string;
  targetRole: string | null;
  jobContext: { company: string; role: string; description: string } | null;
  writingProfileNote?: string;
  healHint?: string;
}): ContextPack {
  const body = input.resumeBody.length > 9000 ? input.resumeBody.slice(0, 9000) : input.resumeBody;
  const userPayload: Record<string, unknown> = {
    prompt: input.prompt,
    target_role: input.targetRole,
    job_context: input.jobContext,
    resume_body: body,
  };
  if (input.writingProfileNote?.trim()) {
    userPayload.profile = input.writingProfileNote.trim();
  }
  if (input.healHint) {
    userPayload.validation_error = input.healHint;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: REVIEW_SYSTEM },
    { role: "user", content: JSON.stringify(userPayload) },
  ];
  const estimatedPromptTokens = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    24,
  );

  return {
    messages,
    focusedIds: [],
    completionBudget: 1600,
    estimatedPromptTokens,
    needsFullDocument: false,
  };
}

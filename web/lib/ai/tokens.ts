/** Cheap token estimate — ~3.5 chars/token for mixed TeX + English. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5));
}

export function clipText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

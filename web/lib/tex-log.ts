/**
 * Parse pdflatex / FastAPI-style log diagnostics into line-aware messages.
 */

export type TexLogError = {
  message: string;
  line: number | null;
  context: string;
};

/** Parse `! …` / `l.42` style LaTeX log fragments. */
export function parseTexLogErrors(logText: string): TexLogError[] {
  const errors: TexLogError[] = [];
  const lines = logText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("!")) {
      const message = line.replace(/^!\s*/, "").trim();
      let lineNum: number | null = null;
      const ctx: string[] = [];
      let j = i + 1;
      while (j < lines.length && j <= i + 4) {
        const next = lines[j] ?? "";
        const m = /^l\.(\d+)/.exec(next);
        if (m) {
          lineNum = Number(m[1]);
          ctx.push(next.trim());
          break;
        }
        if (next.trim() && !next.startsWith("!")) {
          ctx.push(next.trim());
          break;
        }
        j += 1;
      }
      errors.push({
        message,
        line: lineNum,
        context: ctx.join("\n"),
      });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return errors;
}

export function formatTexLogError(err: TexLogError): string {
  const loc = err.line != null ? `Line ${err.line}: ` : "";
  const ctx = err.context ? ` — ${err.context.replace(/^l\.\d+\s*/, "").trim()}` : "";
  return `${loc}${err.message}${ctx}`.replace(/\s+/g, " ").trim();
}

/**
 * Prefer structured FastAPI `errors[]`, then parse freeform log / error text.
 */
export function formatCompileDiagnostic(input: {
  error?: string | null;
  hint?: string | null;
  errors?: Array<string | { message?: string; line?: number | null; context?: string }>;
  log?: string | null;
}): { message: string; line: number | null } {
  const structured: TexLogError[] = [];

  if (Array.isArray(input.errors)) {
    for (const item of input.errors) {
      if (typeof item === "string") {
        const parsed = parseTexLogErrors(item);
        if (parsed.length) structured.push(...parsed);
        else structured.push({ message: item.trim(), line: null, context: "" });
        continue;
      }
      if (item && typeof item === "object") {
        const message = (item.message ?? "").trim();
        if (!message) continue;
        structured.push({
          message,
          line: typeof item.line === "number" ? item.line : null,
          context: typeof item.context === "string" ? item.context : "",
        });
      }
    }
  }

  const blob = [input.error, input.log, input.hint].filter(Boolean).join("\n");
  if (!structured.length && blob) {
    structured.push(...parseTexLogErrors(blob));
  }

  // Also pick bare "l.42" references from freeform text.
  if (!structured.some((e) => e.line != null) && blob) {
    const m = /\bl\.(\d+)\b/.exec(blob);
    if (m) {
      const line = Number(m[1]);
      const msg =
        (input.error ?? "")
          .replace(/\s+/g, " ")
          .replace(/^Compile service failed \(HTTP \d+\):\s*/i, "")
          .trim() || "LaTeX error";
      structured.unshift({ message: msg, line, context: "" });
    }
  }

  if (structured.length) {
    const primary = structured.find((e) => e.line != null) ?? structured[0];
    let message = formatTexLogError(primary);
    if (input.hint?.trim() && !message.includes(input.hint.trim())) {
      const hint = input.hint.trim();
      if (hint.length <= 120 && !/\\begin\{document\}/i.test(hint)) {
        message = `${message}. ${hint}`;
      }
    }
    // Cap length but keep "Line N:" prefix intact.
    if (message.length > 280) {
      message = `${message.slice(0, 277)}…`;
    }
    return { message, line: primary.line };
  }

  const fallback = (input.error ?? input.hint ?? "PDF compile failed.")
    .replace(/\s+/g, " ")
    .replace(/^Compile service failed \(HTTP \d+\):\s*/i, "")
    .trim();
  return {
    message: fallback.length > 280 ? `${fallback.slice(0, 277)}…` : fallback,
    line: null,
  };
}

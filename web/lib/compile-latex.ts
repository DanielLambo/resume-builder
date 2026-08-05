import { compileLatexWithPdflatex } from "@resumate/one-page-lock";

import type { CompileLatexFn } from "@resumate/one-page-lock";

import { formatCompileDiagnostic, parseTexLogErrors } from "@/lib/tex-log";

/** Per-compile hard timeout (remote TeX). Override with LATEX_COMPILE_TIMEOUT_MS. */
export const COMPILE_TIMEOUT_MS = Number(
  process.env.LATEX_COMPILE_TIMEOUT_MS ?? 8_000,
);

const LATEX_ONLINE_DEFAULT = "https://latexonline.cc/compile";

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "production"
  );
}

/**
 * Third-party latexonline.cc receives the full TeX document (names, emails,
 * employers). Never enable in production unless the operator explicitly opts in
 * and discloses this in the product privacy notice.
 */
export function isLatexOnlineAllowed(): boolean {
  if (process.env.ALLOW_LATEX_ONLINE === "0") return false;
  if (process.env.ALLOW_LATEX_ONLINE === "1") return true;
  // Fail closed in production — require an owned LATEX_COMPILE_URL instead.
  return !isProductionRuntime();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export class CompileDiagnosticError extends Error {
  readonly line: number | null;

  constructor(message: string, line: number | null = null) {
    super(message);
    this.name = "CompileDiagnosticError";
    this.line = line;
  }
}

/** Keep compiler-style diagnostics; only collapse secrets / TeX dumps. */
export function sanitizeCompileError(err: unknown): string {
  if (err instanceof CompileDiagnosticError) {
    return err.message.length <= 320 ? err.message : `${err.message.slice(0, 317)}…`;
  }

  const raw = err instanceof Error ? err.message : String(err);
  const cleaned = raw.replace(/\s+/g, " ").trim();

  if (/^Line \d+:/i.test(cleaned)) {
    return cleaned.length <= 320 ? cleaned : `${cleaned.slice(0, 317)}…`;
  }

  const parsed = formatCompileDiagnostic({ error: cleaned, log: raw });
  if (
    parsed.line != null ||
    /undefined control sequence|emergency stop|missing \$|runaway argument|! LaTeX Error|Package .* Error/i.test(
      parsed.message,
    )
  ) {
    return parsed.message;
  }

  if (/Missing LATEX_COMPILE_URL|latexonline is disabled|PII/i.test(cleaned)) {
    return cleaned.length <= 160 ? cleaned : `${cleaned.slice(0, 157)}…`;
  }
  if (/timed out/i.test(cleaned)) {
    return "PDF compile timed out. Try again in a moment.";
  }
  if (/ENOENT|spawn .*ENOENT|not found.*pdflatex/i.test(cleaned)) {
    return "Local TeX compiler is unavailable.";
  }
  if (/Jake-style resume has broken braces|Resume source is empty/i.test(cleaned)) {
    return cleaned;
  }

  if (/Compile service failed|latexonline|HTTP \d+/i.test(cleaned)) {
    const afterColon = cleaned.includes(": ")
      ? cleaned.slice(cleaned.indexOf(": ") + 2).trim()
      : "";
    if (afterColon) {
      return formatCompileDiagnostic({ error: afterColon }).message;
    }
    return "PDF compile failed. Check LaTeX near recent edits, then Recompile.";
  }

  if (/\\documentclass|\\begin\{document\}|you@email\.com/i.test(cleaned) && cleaned.length > 200) {
    return "PDF compile failed. Check LaTeX near recent edits.";
  }

  if (cleaned.length <= 280) {
    return cleaned;
  }
  return "PDF compile failed. Check LaTeX near recent edits, then Recompile.";
}

export function compileErrorLine(err: unknown): number | null {
  if (err instanceof CompileDiagnosticError) return err.line;
  const msg = err instanceof Error ? err.message : String(err);
  const m = /^Line (\d+):/i.exec(msg) ?? /\bl\.(\d+)\b/.exec(msg);
  return m ? Number(m[1]) : null;
}

async function compileViaFastapi(tex: string, baseUrl: string): Promise<Buffer> {
  const endpoint = baseUrl.replace(/\/$/, "").endsWith("/api/compile")
    ? baseUrl.replace(/\/$/, "")
    : `${baseUrl.replace(/\/$/, "")}/api/compile`;

  const body = new FormData();
  body.set("latex_content", tex);
  body.set("job_id", `web-${Date.now()}`);
  body.set("auto_fit", "0");

  const res = await fetch(endpoint, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
  });

  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    pdf_base64?: string;
    error?: string;
    hint?: string;
    log?: string;
    errors?: Array<string | { message?: string; line?: number | null; context?: string }>;
    pages?: number;
  } | null;

  if (!res.ok || !json?.success || !json.pdf_base64) {
    const diagnostic = formatCompileDiagnostic({
      error: json?.error,
      hint: json?.hint,
      errors: json?.errors,
      log: json?.log,
    });
    const fallback =
      diagnostic.message && diagnostic.message !== "PDF compile failed."
        ? diagnostic.message
        : `Compile service failed (HTTP ${res.status})`;
    throw new CompileDiagnosticError(fallback, diagnostic.line);
  }

  return Buffer.from(json.pdf_base64, "base64");
}

async function compileViaLatexOnline(tex: string): Promise<Buffer> {
  if (!isLatexOnlineAllowed()) {
    throw new Error(
      "latexonline is disabled (PII). Set LATEX_COMPILE_URL to your private TeX host, or ALLOW_LATEX_ONLINE=1 only if you accept sending resume text to a third party.",
    );
  }

  const endpoint = process.env.LATEX_ONLINE_URL?.trim() || LATEX_ONLINE_DEFAULT;
  const url = new URL(endpoint);
  url.searchParams.set("command", "pdflatex");
  url.searchParams.set("text", tex);

  const res = await fetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const diagnostic = formatCompileDiagnostic({
      error: `latexonline compile failed (HTTP ${res.status})`,
      log: bodyText.slice(0, 8000),
    });
    throw new CompileDiagnosticError(diagnostic.message, diagnostic.line);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 5 || bytes.subarray(0, 4).toString("utf8") !== "%PDF") {
    const asText = bytes.toString("utf8").slice(0, 8000);
    const diagnostic = formatCompileDiagnostic({
      error: "latexonline returned a non-PDF response",
      log: asText,
    });
    throw new CompileDiagnosticError(diagnostic.message, diagnostic.line);
  }
  return bytes;
}

function canUseLocalPdflatex(): boolean {
  if (process.env.RESUMATE_USE_LOCAL_PDFLATEX === "0") return false;
  if (process.env.RESUMATE_USE_LOCAL_PDFLATEX === "1") return true;
  return process.env.VERCEL !== "1";
}

/**
 * Server-side LaTeX → PDF compiler.
 *
 * Priority:
 * 1. LATEX_COMPILE_URL (owned FastAPI / TeX host) — preferred for PII
 * 2. Local pdflatex (dev machines)
 * 3. latexonline.cc — only when ALLOW_LATEX_ONLINE=1 (never default in prod)
 */
export const compileLatexRemote: CompileLatexFn = async (tex) => {
  const { prepareLatexForCompile } = await import("@/lib/latex-prepare");
  const { latex } = prepareLatexForCompile(tex);

  const fastapi = process.env.LATEX_COMPILE_URL?.trim();
  if (fastapi) {
    return withTimeout(
      compileViaFastapi(latex, fastapi),
      COMPILE_TIMEOUT_MS + 500,
      "LATEX_COMPILE_URL",
    );
  }

  if (canUseLocalPdflatex()) {
    try {
      return await withTimeout(
        compileLatexWithPdflatex(latex),
        COMPILE_TIMEOUT_MS + 2_000,
        "pdflatex",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/ENOENT|not found|spawn/i.test(message)) {
        // fall through
      } else {
        const diagnostic = formatCompileDiagnostic({
          error: message,
          log: message,
          errors: parseTexLogErrors(message),
        });
        throw new CompileDiagnosticError(diagnostic.message, diagnostic.line);
      }
    }
  }

  if (!isLatexOnlineAllowed()) {
    throw new Error(
      "Missing LATEX_COMPILE_URL. Production refuses latexonline.cc to avoid sending resume PII to a third party.",
    );
  }

  return withTimeout(
    compileViaLatexOnline(latex),
    COMPILE_TIMEOUT_MS + 500,
    "latexonline",
  );
};

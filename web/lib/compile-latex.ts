import { compileLatexWithPdflatex, sanitizeLatex } from "@resumate/one-page-lock";

import type { CompileLatexFn } from "@resumate/one-page-lock";
import { isProductionRuntime } from "@/lib/prod-runtime";

/** Per-compile hard timeout (remote TeX). Override with LATEX_COMPILE_TIMEOUT_MS. */
export const COMPILE_TIMEOUT_MS = Number(
  process.env.LATEX_COMPILE_TIMEOUT_MS ?? 8_000,
);

const LATEX_ONLINE_DEFAULT = "https://latexonline.cc/compile";

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

/** Strip TeX / third-party bodies from errors before they hit clients or logs. */
export function sanitizeCompileError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/Missing LATEX_COMPILE_URL|latexonline is disabled|PII/i.test(raw)) {
    return raw;
  }
  if (/timed out/i.test(raw)) {
    return "PDF compile timed out. Try again in a moment.";
  }
  if (/pdflatex|ENOENT|spawn/i.test(raw)) {
    return "Local TeX compiler is unavailable.";
  }
  if (/latexonline|Compile service failed|HTTP \d+/i.test(raw)) {
    return "PDF compile service failed. Resume content was not returned in this error.";
  }
  if (/\\documentclass|\\begin\{document\}|you@email\.com/i.test(raw)) {
    return "PDF compile failed.";
  }
  // Keep short, non-TeX messages; otherwise generic.
  if (raw.length <= 160 && !raw.includes("\\")) {
    return raw;
  }
  return "PDF compile failed.";
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

  const json = (await res.json()) as {
    success?: boolean;
    pdf_base64?: string;
    error?: string;
    pages?: number;
  };

  if (!res.ok || !json.success || !json.pdf_base64) {
    throw new Error(`Compile service failed (HTTP ${res.status})`);
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
  // GET puts TeX in the query string — only used when explicitly allowed.
  url.searchParams.set("text", tex);

  const res = await fetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Do not attach response bodies (may echo TeX) into thrown errors.
    throw new Error(`latexonline compile failed (HTTP ${res.status})`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 5 || bytes.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Error("latexonline returned a non-PDF response");
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
export const compileLatexRemote: CompileLatexFn = async (tex: string) => {
  const sanitized = sanitizeLatex(tex);
  if (!sanitized.ok) {
    throw new Error(sanitized.error);
  }
  const safeTex = sanitized.content;

  const fastapi = process.env.LATEX_COMPILE_URL?.trim();
  if (fastapi) {
    return withTimeout(
      compileViaFastapi(safeTex, fastapi),
      COMPILE_TIMEOUT_MS + 500,
      "LATEX_COMPILE_URL",
    );
  }

  if (canUseLocalPdflatex()) {
    try {
      return await withTimeout(
        compileLatexWithPdflatex(safeTex),
        COMPILE_TIMEOUT_MS + 2_000,
        "pdflatex",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/ENOENT|not found|spawn/i.test(message)) {
        throw err;
      }
    }
  }

  if (!isLatexOnlineAllowed()) {
    throw new Error(
      "Missing LATEX_COMPILE_URL. Production refuses latexonline.cc to avoid sending resume PII to a third party.",
    );
  }

  return withTimeout(
    compileViaLatexOnline(safeTex),
    COMPILE_TIMEOUT_MS + 500,
    "latexonline",
  );
};

/**
 * Helpers for /api/compile binary PDF responses (not base64-in-JSON).
 */

export type CompilePdfResult = {
  success: true;
  /** Raw PDF bytes as base64 for existing preview plumbing. */
  pdfBase64: string;
  pageCount: number;
  lockedToOnePage: boolean;
  elapsedMs: number;
};

export type CompilePdfError = {
  success: false;
  error: string;
  hint?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function parseCompileResponse(
  res: Response,
): Promise<CompilePdfResult | CompilePdfError> {
  const contentType = res.headers.get("content-type") ?? "";

  if (res.ok && contentType.includes("application/pdf")) {
    const buffer = new Uint8Array(await res.arrayBuffer());
    const pageCount = Number(res.headers.get("X-Page-Count") ?? "0") || 0;
    const locked =
      res.headers.get("X-Locked-One-Page") === "1" || pageCount === 1;
    const elapsedMs = Number(res.headers.get("X-Elapsed-Ms") ?? "0") || 0;
    return {
      success: true,
      pdfBase64: bytesToBase64(buffer),
      pageCount,
      lockedToOnePage: locked,
      elapsedMs,
    };
  }

  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    pdfBase64?: string;
    pageCount?: number;
    lockedToOnePage?: boolean;
    error?: string;
    hint?: string;
    elapsedMs?: number;
  } | null;

  if (data?.success && data.pdfBase64) {
    return {
      success: true,
      pdfBase64: data.pdfBase64,
      pageCount: data.pageCount ?? 0,
      lockedToOnePage: Boolean(data.lockedToOnePage ?? data.pageCount === 1),
      elapsedMs: data.elapsedMs ?? 0,
    };
  }

  return {
    success: false,
    error: data?.error?.trim() || "Compile failed",
    hint: data?.hint?.trim(),
  };
}

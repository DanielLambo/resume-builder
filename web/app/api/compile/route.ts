import { NextResponse } from "next/server";
import { z } from "zod";

import {
  compileErrorLine,
  sanitizeCompileError,
} from "@/lib/compile-latex";
import { fitResumeToSinglePage } from "@/lib/fit-resume";
import { persistResumePdf } from "@/lib/persist-resume-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  latex: z.string().min(1).max(400_000),
  /** When true (default), run full 1-page lock. When false, single compile only. */
  autoFit: z.boolean().optional().default(true),
  /** When set (authenticated), persist PDF to storage for dashboard download. */
  resumeId: z.string().uuid().optional(),
});

function pdfResponse(
  pdf: Buffer,
  meta: {
    pageCount: number;
    lockedToOnePage: boolean;
    elapsedMs: number;
    finalConfig?: unknown;
  },
) {
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Cache-Control": "no-store",
    "X-Page-Count": String(meta.pageCount),
    "X-Locked-One-Page": meta.lockedToOnePage ? "1" : "0",
    "X-Elapsed-Ms": String(meta.elapsedMs),
  });
  if (meta.finalConfig != null) {
    try {
      headers.set("X-Final-Config", JSON.stringify(meta.finalConfig));
    } catch {
      /* ignore oversized config */
    }
  }
  return new NextResponse(new Uint8Array(pdf), { status: 200, headers });
}

/**
 * POST /api/compile
 * Auth required. Success = application/pdf (+ page metadata headers).
 * Errors stay JSON (include `line` when TeX reported l.N).
 */
export async function POST(request: Request) {
  let latexForDiagnostics = "";

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const allowAnonDevHarness =
        process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_USE_MOCK_AI === "true" &&
        process.env.VERCEL !== "1";
      if (!allowAnonDevHarness) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const json = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }

    const { latex, autoFit, resumeId } = parsed.data;
    latexForDiagnostics = latex;

    const maybePersist = async (pdf: Buffer) => {
      if (!user || !resumeId) return;
      await persistResumePdf(supabase, user.id, resumeId, pdf);
    };

    if (!autoFit) {
      const { compileLatexRemote } = await import("@/lib/compile-latex");
      const { getPDFPageCount } = await import("@resumate/one-page-lock");
      const pdf = await compileLatexRemote(latex);
      const pageCount = await getPDFPageCount(pdf);
      await maybePersist(pdf);
      return pdfResponse(pdf, {
        pageCount,
        lockedToOnePage: pageCount === 1,
        elapsedMs: 0,
        finalConfig: null,
      });
    }

    const fit = await fitResumeToSinglePage(latex, { allowGroqCondense: false });
    await maybePersist(fit.compiledPdf);
    return pdfResponse(fit.compiledPdf, {
      pageCount: fit.pageCount,
      lockedToOnePage: fit.lockedToOnePage,
      elapsedMs: fit.elapsedMs,
      finalConfig: fit.finalConfig,
    });
  } catch (err) {
    let rootErr: unknown = err;
    let message = sanitizeCompileError(err);
    let line = compileErrorLine(err);

    if (
      latexForDiagnostics &&
      /no successful compilation/i.test(
        err instanceof Error ? err.message : String(err),
      )
    ) {
      try {
        const { compileLatexRemote } = await import("@/lib/compile-latex");
        await compileLatexRemote(latexForDiagnostics);
      } catch (root) {
        rootErr = root;
        message = sanitizeCompileError(root);
        line = compileErrorLine(root);
      }
    }

    if (line == null) {
      const fromMsg = /^Line (\d+):/i.exec(message);
      line = compileErrorLine(rootErr) ?? (fromMsg ? Number(fromMsg[1]) : null);
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
        hint: message,
        line,
      },
      { status: 500 },
    );
  }
}

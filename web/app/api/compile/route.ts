import { NextResponse } from "next/server";
import { z } from "zod";

import { sanitizeCompileError } from "@/lib/compile-latex";
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

/**
 * POST /api/compile
 * Auth required. Preview compiles never send LaTeX to Groq for condense.
 */
export async function POST(request: Request) {
  let latexForDiagnostics = "";

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Local mock harness only — never in production / Vercel.
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
      return NextResponse.json({
        success: true,
        pdfBase64: pdf.toString("base64"),
        pageCount,
        lockedToOnePage: pageCount === 1,
        finalConfig: null,
        elapsedMs: 0,
      });
    }

    // Spacing search only — no Groq condense on passive preview compiles.
    const fit = await fitResumeToSinglePage(latex, { allowGroqCondense: false });
    await maybePersist(fit.compiledPdf);
    return NextResponse.json({
      success: true,
      pdfBase64: fit.compiledPdf.toString("base64"),
      pageCount: fit.pageCount,
      lockedToOnePage: fit.lockedToOnePage,
      finalConfig: fit.finalConfig,
      elapsedMs: fit.elapsedMs,
    });
  } catch (err) {
    let message = sanitizeCompileError(err);
    // fitToSinglePage collapses every compile failure into one opaque string —
    // probe a single compile so the client sees the root cause (e.g. missing
    // LATEX_COMPILE_URL on Vercel).
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
        message = sanitizeCompileError(root);
      }
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

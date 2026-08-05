"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { assertImportSize, detectImportKind, titleFromFilename } from "@/lib/import/detect";
import { convertImportedText } from "@/lib/import/convert";
import { extractPdfText } from "@/lib/import/pdf-text";
import { planTexImport } from "@/lib/import/tex";
import { ensureHousePreamble, latexValidationError } from "@/lib/import/validate";
import { isMockAiEnabled } from "@/lib/mock-ai";
import {
  AiRateLimitError,
  assertWithinDailyAiLimit,
  incrementDailyAiTokens,
} from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

export type ImportResumeResult =
  | {
      ok: true;
      id: string;
      title: string;
      kind: "tex" | "pdf";
      mode: "passthrough" | "jake" | "rewrite";
      tokensUsed: number;
      notes?: string;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      code?: "UNAUTHORIZED" | "VALIDATION" | "AI_DAILY_LIMIT" | "INTERNAL";
    };

const FilenameSchema = z.string().trim().min(1).max(240);

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function importResumeAction(formData: FormData): Promise<ImportResumeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", error: "Sign in to import a resume." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, status: 400, code: "VALIDATION", error: "Choose a .tex or PDF file." };
  }

  const filenameParsed = FilenameSchema.safeParse(file.name);
  if (!filenameParsed.success) {
    return { ok: false, status: 400, code: "VALIDATION", error: "Invalid file name." };
  }

  const filename = filenameParsed.data;
  const kind = detectImportKind(filename, file.type);
  if (!kind) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      error: "Use a .tex / .latex file or a PDF.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sizeError = assertImportSize(kind, bytes.byteLength);
  if (sizeError) {
    return { ok: false, status: 400, code: "VALIDATION", error: sizeError };
  }

  const fallbackTitle = titleFromFilename(filename);
  let latex = "";
  let title = fallbackTitle;
  let mode: "passthrough" | "jake" | "rewrite" = "passthrough";
  let tokensUsed = 0;
  let notes: string | undefined;

  try {
    if (kind === "tex") {
      const plan = planTexImport(decodeUtf8(bytes));
      if (plan.mode === "passthrough" || plan.mode === "jake") {
        latex = plan.latex;
        mode = plan.mode;
      } else {
        mode = "rewrite";
        if (!isMockAiEnabled()) {
          try {
            await assertWithinDailyAiLimit(user.id);
          } catch (err) {
            if (err instanceof AiRateLimitError) {
              return {
                ok: false,
                status: 429,
                code: "AI_DAILY_LIMIT",
                error: err.message,
              };
            }
            throw err;
          }
        }
        const converted = await convertImportedText({
          sourceText: plan.source,
          fallbackTitle,
        });
        latex = converted.output.latex;
        title = converted.output.title || fallbackTitle;
        notes = converted.output.notes || plan.reason;
        tokensUsed = converted.totalTokens;
        if (tokensUsed > 0) {
          await incrementDailyAiTokens(user.id, tokensUsed);
        }
      }
    } else {
      mode = "rewrite";
      const extracted = await extractPdfText(bytes);
      if (!extracted.ok) {
        return { ok: false, status: 400, code: "VALIDATION", error: extracted.error };
      }
      if (!isMockAiEnabled()) {
        try {
          await assertWithinDailyAiLimit(user.id);
        } catch (err) {
          if (err instanceof AiRateLimitError) {
            return {
              ok: false,
              status: 429,
              code: "AI_DAILY_LIMIT",
              error: err.message,
            };
          }
          throw err;
        }
      }
      const converted = await convertImportedText({
        sourceText: extracted.text,
        fallbackTitle,
      });
      latex = converted.output.latex;
      title = converted.output.title || fallbackTitle;
      notes = converted.output.notes;
      tokensUsed = converted.totalTokens;
      if (tokensUsed > 0) {
        await incrementDailyAiTokens(user.id, tokensUsed);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    if (/HTTP 429/.test(message)) {
      return {
        ok: false,
        status: 429,
        code: "AI_DAILY_LIMIT",
        error: "The AI host is busy. Wait a moment and try again.",
      };
    }
    return {
      ok: false,
      status: 500,
      code: "INTERNAL",
      error: message.startsWith("Missing GROQ")
        ? "AI import isn’t configured on this host."
        : "Could not convert that resume. Try a clearer PDF or the original .tex.",
    };
  }

  latex = ensureHousePreamble(latex);
  const latexError = latexValidationError(latex);
  if (latexError) {
    return { ok: false, status: 400, code: "VALIDATION", error: latexError };
  }

  const dataJson = {
    latex,
    template: "blank",
    version: 1,
    source: "import",
    import: {
      kind,
      mode,
      originalFilename: filename.slice(0, 240),
    },
  };

  const { data: row, error } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      title: title.slice(0, 120),
      data_json: dataJson as unknown as Json,
    })
    .select("id")
    .single();

  if (error || !row) {
    return {
      ok: false,
      status: 500,
      code: "INTERNAL",
      error: error?.message ?? "Could not save the imported resume.",
    };
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    id: row.id,
    title: title.slice(0, 120),
    kind,
    mode,
    tokensUsed,
    notes,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

type TypedClient = SupabaseClient<Database>;

/**
 * Best-effort upload of a compiled PDF so dashboard "Download PDF" works.
 * Failures are swallowed — preview already has the bytes in-memory.
 */
export async function persistResumePdf(
  supabase: TypedClient,
  userId: string,
  resumeId: string,
  pdf: Buffer,
): Promise<void> {
  const path = `${userId}/${resumeId}.pdf`;
  const { error } = await supabase.storage.from("resume-pdfs").upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    // Do not fail the compile/AI path over storage hiccups.
    console.warn("[persistResumePdf]", error.message);
  }
}

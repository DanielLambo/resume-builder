"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import {
  createResumeData,
  DEFAULT_RESUME_TITLE,
  getLatexFromDataJson,
  isResumeTemplateId,
} from "@/lib/resume-template";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string; status?: number };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase, user: null as null };
  }
  return { supabase, user };
}

export async function createResumeAction(
  title: string = DEFAULT_RESUME_TITLE,
  templateId: string = "new-grad",
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required.", status: 401 };

  const cleanTitle = title.trim().slice(0, 120) || DEFAULT_RESUME_TITLE;
  const tpl = isResumeTemplateId(templateId) ? templateId : "new-grad";
  const data = createResumeData(tpl);

  const { data: row, error } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      title: cleanTitle,
      data_json: data as unknown as Json,
    })
    .select("id")
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message ?? "Could not create resume." };
  }

  revalidatePath("/dashboard");
  return { ok: true, id: row.id, message: "Resume created." };
}

export async function duplicateResumeAction(resumeId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(resumeId);
  if (!parsed.success) return { ok: false, error: "Invalid resume id." };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required.", status: 401 };

  const { data: source, error: loadError } = await supabase
    .from("resumes")
    .select("title, data_json")
    .eq("id", parsed.data)
    .maybeSingle();

  if (loadError || !source) {
    return { ok: false, error: "Resume not found.", status: 404 };
  }

  const { data: row, error } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      title: `${source.title} (copy)`.slice(0, 120),
      data_json: source.data_json,
    })
    .select("id")
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message ?? "Duplicate failed." };
  }

  revalidatePath("/dashboard");
  return { ok: true, id: row.id, message: "Resume duplicated." };
}

export async function deleteResumeAction(resumeId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(resumeId);
  if (!parsed.success) return { ok: false, error: "Invalid resume id." };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required.", status: 401 };

  const { error } = await supabase
    .from("resumes")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // Best-effort: remove stored PDF if present
  await supabase.storage.from("resume-pdfs").remove([`${user.id}/${parsed.data}.pdf`]);

  revalidatePath("/dashboard");
  return { ok: true, message: "Resume deleted." };
}

export async function saveResumeLatexAction(
  resumeId: string,
  latex: string,
  title?: string,
  templateId?: string,
): Promise<ActionResult> {
  const parsed = z
    .object({
      resumeId: z.string().uuid(),
      latex: z.string().min(1).max(400_000),
      title: z.string().trim().max(120).optional(),
      templateId: z.string().trim().max(40).optional(),
    })
    .safeParse({ resumeId, latex, title, templateId });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid save payload." };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required.", status: 401 };

  const { data: existing, error: loadError } = await supabase
    .from("resumes")
    .select("data_json")
    .eq("id", parsed.data.resumeId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Resume not found.", status: 404 };
  }

  const prev =
    existing.data_json && typeof existing.data_json === "object" && !Array.isArray(existing.data_json)
      ? (existing.data_json as Record<string, unknown>)
      : {};

  const nextData: Record<string, unknown> = {
    ...prev,
    latex: parsed.data.latex,
    version: typeof prev.version === "number" ? prev.version + 1 : 1,
  };
  if (parsed.data.templateId && isResumeTemplateId(parsed.data.templateId)) {
    nextData.template = parsed.data.templateId;
  }

  const updatePayload: { data_json: Json; title?: string } = {
    data_json: nextData as unknown as Json,
  };
  if (parsed.data.title) {
    updatePayload.title = parsed.data.title;
  }

  const { error } = await supabase
    .from("resumes")
    .update(updatePayload)
    .eq("id", parsed.data.resumeId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/editor/${parsed.data.resumeId}`);
  return { ok: true, message: "Saved to cloud." };
}

export async function getResumePdfSignedUrlAction(
  resumeId: string,
): Promise<ActionResult & { url?: string }> {
  const parsed = z.string().uuid().safeParse(resumeId);
  if (!parsed.success) return { ok: false, error: "Invalid resume id." };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required.", status: 401 };

  const path = `${user.id}/${parsed.data}.pdf`;
  const { data, error } = await supabase.storage
    .from("resume-pdfs")
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: "No compiled PDF yet. Open the editor and compile first.",
      status: 404,
    };
  }

  return { ok: true, url: data.signedUrl };
}

export async function signOutAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Re-export helper for server pages that need latex preview text. */
export async function loadResumeLatex(resumeId: string): Promise<string | null> {
  const { supabase, user } = await requireUser();
  if (!user) return null;
  const { data } = await supabase
    .from("resumes")
    .select("data_json")
    .eq("id", resumeId)
    .maybeSingle();
  if (!data) return null;
  return getLatexFromDataJson(data.data_json);
}

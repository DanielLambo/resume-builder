"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  WritingProfileSchema,
  writingProfileFromMetadata,
  type WritingProfile,
} from "@/lib/writing-profile";

export type WritingProfileResult =
  | { ok: true; profile: WritingProfile }
  | { ok: false; error: string };

export async function getWritingProfileAction(): Promise<WritingProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, error: "Sign in to load your writing profile." };
  }
  return { ok: true, profile: writingProfileFromMetadata(user.user_metadata) };
}

const SaveSchema = z.object({
  instructions: z.string().trim().max(500),
});

/**
 * Persist freeform writing instructions onto auth user_metadata.
 * Job types / fields continue to come from onboarding.
 */
export async function saveWritingProfileAction(
  raw: unknown,
): Promise<WritingProfileResult> {
  const parsed = SaveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid profile",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Sign in to save your writing profile." };
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      writing_instructions: parsed.data.instructions,
    },
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshed = await supabase.auth.getUser();
  const meta = refreshed.data.user?.user_metadata;
  return {
    ok: true,
    profile: writingProfileFromMetadata({
      ...(meta && typeof meta === "object" ? meta : {}),
      writing_instructions: parsed.data.instructions,
    }),
  };
}

import { z } from "zod";

import {
  labelsForFields,
  labelsForJobTypes,
} from "@/lib/onboarding/options";

export const WritingProfileSchema = z.object({
  fullName: z.string().trim().max(80).optional().or(z.literal("")),
  jobTypes: z.array(z.string()).max(8).default([]),
  targetFields: z.array(z.string()).max(8).default([]),
  /** Freeform voice / banned phrases / always-do rules. */
  instructions: z.string().trim().max(500).optional().or(z.literal("")),
});

export type WritingProfile = z.infer<typeof WritingProfileSchema>;

export const EMPTY_WRITING_PROFILE: WritingProfile = {
  fullName: "",
  jobTypes: [],
  targetFields: [],
  instructions: "",
};

type UserMetadata = Record<string, unknown> | null | undefined;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 8);
}

/** Build a silent writing profile from Supabase auth user_metadata. */
export function writingProfileFromMetadata(meta: UserMetadata): WritingProfile {
  const record = meta && typeof meta === "object" ? meta : {};
  const fullName =
    typeof record.full_name === "string"
      ? record.full_name
      : typeof record.display_name === "string"
        ? record.display_name
        : "";
  const instructions =
    typeof record.writing_instructions === "string"
      ? record.writing_instructions
      : "";

  return WritingProfileSchema.parse({
    fullName,
    jobTypes: asStringArray(record.job_types),
    targetFields: asStringArray(record.target_fields),
    instructions,
  });
}

export function writingProfileHasSignal(profile: WritingProfile): boolean {
  return Boolean(
    profile.fullName?.trim() ||
      profile.jobTypes.length ||
      profile.targetFields.length ||
      profile.instructions?.trim(),
  );
}

/**
 * Compact instructions injected into Groq system prompts.
 * Never invents facts — only steers tone and targeting.
 */
export function formatWritingProfileForPrompt(profile: WritingProfile): string {
  if (!writingProfileHasSignal(profile)) return "";

  const parts: string[] = ["Candidate writing profile (follow silently):"];
  if (profile.fullName?.trim()) {
    parts.push(`- Name on resume should stay consistent with: ${profile.fullName.trim()}`);
  }
  const jobs = labelsForJobTypes(profile.jobTypes);
  if (jobs.length) {
    parts.push(`- Target job types: ${jobs.join(", ")}`);
  }
  const fields = labelsForFields(profile.targetFields);
  if (fields.length) {
    parts.push(`- Target fields: ${fields.join(", ")}`);
  }
  if (profile.instructions?.trim()) {
    parts.push(`- Voice / preferences: ${profile.instructions.trim()}`);
  }
  parts.push("- Keep every employer, title, date, degree, tool, and metric honest.");
  return parts.join("\n");
}

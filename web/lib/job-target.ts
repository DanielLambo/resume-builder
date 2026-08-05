import { z } from "zod";

import type { Json } from "@/lib/database.types";

export const JobTargetSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  description: z.string().trim().min(20).max(20_000),
  createdAt: z.string().datetime().optional(),
});

export type JobTarget = z.infer<typeof JobTargetSchema>;

export function asDataRecord(value: Json | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function getJobTargetFromDataJson(
  value: Json | Record<string, unknown> | null | undefined,
): JobTarget | null {
  const record = asDataRecord(value);
  const parsed = JobTargetSchema.safeParse(record.job);
  return parsed.success ? parsed.data : null;
}

/** Short library / editor label, e.g. "SWE Intern · Acme". */
export function formatJobTargetLabel(job: Pick<JobTarget, "company" | "role">): string {
  return `${job.role} · ${job.company}`;
}

/** Resume title used when creating a tailored variant. */
export function formatJobResumeTitle(job: Pick<JobTarget, "company" | "role">): string {
  return `${job.role} @ ${job.company}`.slice(0, 120);
}

/**
 * Prompt wrapper for Groq — keeps facts honest and anchors the edit to the JD.
 */
export function buildTailorJobPrompt(job: JobTarget): string {
  return [
    "Tailor this resume for the following job application.",
    "Rewrite and reorder bullets to emphasize the most relevant experience and skills.",
    "Keep every fact honest — do not invent employers, titles, dates, degrees, or metrics.",
    "Prefer tightening and reframing existing content over adding new roles.",
    "Keep the resume suitable for a single page.",
    "",
    `Company: ${job.company}`,
    `Role: ${job.role}`,
    "",
    "Job description:",
    job.description,
  ].join("\n");
}

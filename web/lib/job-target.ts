import { z } from "zod";

import type { Json } from "@/lib/database.types";

export const JobTargetSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  description: z.string().trim().min(40).max(20_000),
  createdAt: z.string().datetime().optional(),
});

export type JobTarget = z.infer<typeof JobTargetSchema>;

export function asDataRecord(
  value: Json | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
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
export function formatJobTargetLabel(
  job: Pick<JobTarget, "company" | "role">,
): string {
  return `${job.role} · ${job.company}`;
}

/** Resume title used when creating a tailored variant. */
export function formatJobResumeTitle(
  job: Pick<JobTarget, "company" | "role">,
): string {
  return `${job.role} @ ${job.company}`.slice(0, 120);
}

/**
 * Prompt wrapper for Groq — keeps facts honest and anchors the edit to the JD.
 */
export function buildTailorJobPrompt(job: JobTarget): string {
  return [
    "Tailor this resume for the following job application.",
    "",
    "Operate like an elite technical recruiter paired with a LaTeX typesetter:",
    "1) Extract the top 6–10 requirements / keywords from the JD.",
    "2) Map each to honest evidence already on the resume (bullets, projects, skills, coursework).",
    "3) Reorder bullets (and entries if needed) so the strongest matches appear first under Experience/Projects.",
    "4) Rewrite matched bullets to use the posting's language ONLY where the underlying fact already exists.",
    "5) Tighten or demote weak/irrelevant bullets; do not delete whole roles unless clearly necessary for one page.",
    "6) Update Skills labels to surface overlapping tools — never invent tools absent from the resume.",
    "7) Keep the document one-page dense and fully compilable.",
    "",
    "Hard rules:",
    "- Keep every employer, title, date, school, and metric honest.",
    "- Do not invent projects, employers, or fake-precise stats from the JD.",
    "- Ban AI/recruiter-detectable sludge: leveraged, utilizing, spearheaded, orchestrated,",
    "  passionate, results-driven, cutting-edge, robust, seamless, showcasing, actionable insights,",
    "  ', resulting in N%', keyword-stuffing JD jargon the candidate never used.",
    "- Prefer plain human bullets over polished ChatGPT voice.",
    "- Reply must list the JD themes you mirrored and what you changed.",
    "",
    `Company: ${job.company}`,
    `Role: ${job.role}`,
    "",
    "Job description:",
    job.description,
  ].join("\n");
}

import { z } from "zod";

export const REFERRAL_SOURCES = [
  "linkedin",
  "word_of_mouth",
  "x",
  "google",
  "youtube",
  "podcast_blog",
  "other",
] as const;

export const JOB_TYPES = [
  "internship",
  "entry_level",
  "full_time",
  "part_time",
  "exploring",
] as const;

export const TARGET_FIELDS = [
  "software_engineering",
  "product_management",
  "ui_ux",
  "data_science",
  "marketing",
  "finance",
  "other",
] as const;

export const AVATAR_COLORS = [
  "#C44B3B",
  "#2F3A33",
  "#3D5A80",
  "#6B4F3A",
  "#4A6741",
  "#5C4B7A",
] as const;

export const OnboardingDataSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name")
      .max(80, "Keep it under 80 characters"),
    displayName: z.string().trim().max(40).optional().or(z.literal("")),
    avatarColor: z.string().min(1),
    avatarUrl: z.string().optional(),
    referralSource: z.enum(REFERRAL_SOURCES).optional(),
    referralOtherText: z.string().trim().max(120).optional().or(z.literal("")),
    jobTypes: z.array(z.enum(JOB_TYPES)).default([]),
    targetFields: z.array(z.enum(TARGET_FIELDS)).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.referralSource === "other" && !data.referralOtherText?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Please specify how you heard about us",
        path: ["referralOtherText"],
      });
    }
  });

export type OnboardingData = z.infer<typeof OnboardingDataSchema>;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type TargetField = (typeof TARGET_FIELDS)[number];

export const DEFAULT_ONBOARDING: OnboardingData = {
  fullName: "",
  displayName: "",
  avatarColor: AVATAR_COLORS[0],
  avatarUrl: undefined,
  referralSource: undefined,
  referralOtherText: "",
  jobTypes: [],
  targetFields: [],
};

export const ONBOARDING_STORAGE_KEY = "resumate_onboarding_v1";
export const ONBOARDING_DONE_KEY = "resumate_onboarding_done";
